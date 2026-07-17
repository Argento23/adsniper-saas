import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import sharp from 'sharp';
import { generateFluxInpaint, generateFluxImageToImage, generateBriaBackgroundRemoval, generateFalImage, FalBalanceExhaustedError } from '@/lib/fal';

// v41.9: Disable sharp cache to prevent memory saturation in serverless
sharp.cache(false);

export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

// V66: Credit consumption delegated to lib/credits.ts (system-wide).
// Studio Pro requires plan 'studio' or 'agency'. Cost: 1 credit per image.
const ADMIN_EMAIL = 'gustavodornhofer@gmail.com';

async function consumePremiumCredit(userId: string, cost: number = 1) {
    const ck = await import('@/lib/credits');
    return await ck.consumeCredits(userId, cost, 'image');
}

// V56: Native 3D Inverse Mask Logic + Harmony Bake Base
async function createInverseMaskPayload(
    productBuffer: Buffer
): Promise<{ baseImage: string; maskImage: string }> {
    const bgW = 1024;
    const bgH = 1024;

    const productMeta = await sharp(productBuffer).metadata();
    const pW = productMeta.width || 1;
    const pH = productMeta.height || 1;

    // Scale product to fit comfortably (around 32% for realistic hands/environment scale)
    const maxTargetW = Math.round(bgW * 0.32);
    const maxTargetH = Math.round(bgH * 0.45);

    let targetW = maxTargetW;
    let targetH = Math.round(targetW * (pH / pW));

    if (targetH > maxTargetH) {
        targetH = maxTargetH;
        targetW = Math.round(targetH * (pW / pH));
    }
    
    // Position comfortably lower than center to ensure humans/faces are rendered above it
    const left = Math.round((bgW - targetW) / 2);
    const top = Math.round((bgH - targetH) / 1.25);

    const resizedProduct = await sharp(productBuffer).resize(targetW, targetH).toBuffer();
    
    // 1. Base Image: Neutral Gray Background + Product
    const baseBuffer = await sharp({ create: { width: bgW, height: bgH, channels: 3, background: '#808080' } })
        .composite([{ input: resizedProduct, left, top }])
        .jpeg({ quality: 95 }) 
        .toBuffer();

    // 2. Inverse Mask: Black over the internal product (Protect), White everywhere else (Generate AI Scene)
    // CRITICAL FIX: Extract the actual alpha channel contour instead of a flat bounding rectangle!
    // This prevents the AI from protecting the grey rectangular box around an irregularly shaped bag/product.
    const maskSilhouette = await sharp(resizedProduct)
        .ensureAlpha()
        .extractChannel(3) // Extracts Alpha (255 = Opaque Product, 0 = Transparent Background)
        .negate() // Negate it (0 = Opaque Product [Protect], 255 = Transparent Background [Generate])
        .toColorspace('srgb') // Convert from 1 channel to 3 channels for compositing
        .toBuffer();

    const maskBuffer = await sharp({ create: { width: bgW, height: bgH, channels: 3, background: '#FFFFFF' } })
        .composite([{ input: maskSilhouette, left, top }])
        .jpeg({ quality: 90 }) // Pixel-perfect contour
        .toBuffer();

    return {
        baseImage: `data:image/jpeg;base64,${baseBuffer.toString('base64')}`,
        maskImage: `data:image/jpeg;base64,${maskBuffer.toString('base64')}`
    };
}

// V69 LOGO DETECTION: Check if the image is a flat logo/graphic vs a 3D physical product
// We analyze both transparency AND the spatial distribution of opaque pixels.
// - A product photo with background removed: large CONTIGUOUS opaque region (the product itself)
// - A flat logo/graphic: small or multiple scattered opaque regions (the design elements)
// V69: Lowered thresholds to catch more logos (was >65% transparent + <12% blob → now >45% + <20%)
async function isLikelyLogo(buffer: Buffer): Promise<boolean> {
    try {
        const meta = await sharp(buffer).metadata();
        if (!meta.hasAlpha) return false;
        const { width = 1, height = 1 } = meta;
        const totalPixels = width * height;

        // Get alpha channel as raw grayscale values (0-255)
        const alphaData = await sharp(buffer)
            .ensureAlpha()
            .extractChannel(3)
            .raw()
            .toBuffer({ resolveWithObject: false }) as Buffer;

        // Count transparent pixels and find contiguous opaque regions
        let transparentCount = 0;
        const visited = new Uint8Array(alphaData.length);
        let maxOpaqueBlob = 0;
        let opaqueCount = 0;

        for (let i = 0; i < alphaData.length; i++) {
            if (alphaData[i] < 25) {
                transparentCount++;
                continue;
            }
            if (alphaData[i] < 200) continue; // semi-transparent, skip
            opaqueCount++;

            // Flood-fill to find connected opaque region size
            if (visited[i]) continue;
            let blobSize = 0;
            const stack = [i];
            while (stack.length > 0) {
                const idx = stack.pop()!;
                if (visited[idx]) continue;
                if (alphaData[idx] < 200) continue;
                visited[idx] = 1;
                blobSize++;

                const x = idx % width;
                const y = Math.floor(idx / width);
                if (x > 0) stack.push(idx - 1);
                if (x < width - 1) stack.push(idx + 1);
                if (y > 0) stack.push(idx - width);
                if (y < height - 1) stack.push(idx + width);
            }
            if (blobSize > maxOpaqueBlob) maxOpaqueBlob = blobSize;
        }

        const transparentRatio = transparentCount / alphaData.length;
        const opaqueBlobRatio = maxOpaqueBlob / totalPixels;
        const opaqueRatio = opaqueCount / totalPixels;

        console.log(`[V69 Logo Detection] Transparent: ${(transparentRatio * 100).toFixed(1)}%, opaque blob: ${(opaqueBlobRatio * 100).toFixed(1)}%, total opaque: ${(opaqueRatio * 100).toFixed(1)}%`);

        // LOGO if: > 45% transparent AND biggest blob is < 20% of total pixels
        // OR: mostly transparent (> 60%) regardless of blob size (logos with alpha channel)
        // This catches more logos while still excluding large product photos
        return (transparentRatio > 0.45 && opaqueBlobRatio < 0.20) || (transparentRatio > 0.60);
    } catch (e) {
        console.warn('[V69 Logo Detection] Failed, assuming product:', e);
        return false;
    }
}

// V63: Fallback elegante cuando FAL no está disponible.
// Compositúa el logo en un fondo degradado oscuro, sin gasto de API.
async function logoFallbackOnDarkBackground(inputBuffer: Buffer): Promise<string> {
    const logoMeta = await sharp(inputBuffer).metadata();
    const lW = logoMeta.width || 512;
    const lH = logoMeta.height || 512;
    const targetLogoW = Math.round(1024 * 0.30);
    const targetLogoH = Math.round(targetLogoW * (lH / lW));
    const left = Math.round((1024 - targetLogoW) / 2);
    const top = Math.round(1024 * 0.52);

    const resizedLogo = await sharp(inputBuffer)
        .resize(targetLogoW, targetLogoH, { fit: 'inside' })
        .ensureAlpha()
        .toBuffer();

    const bg = await sharp({
        create: { width: 1024, height: 1024, channels: 3, background: '#0f172a' }
    })
        .png()
        .toBuffer();

    const composite = await sharp(bg)
        .composite([{ input: resizedLogo, left, top }])
        .png()
        .toBuffer();

    return `data:image/png;base64,${composite.toString('base64')}`;
}

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { image_base64, scene_prompt } = await req.json();
        if (!image_base64) return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 });
        if (!scene_prompt) return NextResponse.json({ error: 'Falta el prompt de la escena' }, { status: 400 });

        const creditCheck = await consumePremiumCredit(userId, 1);
        if (!creditCheck.canProceed) {
            return NextResponse.json({
                error: 'NO_PREMIUM_CREDITS',
                message: creditCheck.reason || 'Sin créditos Studio Pro',
                plan: creditCheck.plan,
                remaining: creditCheck.remaining,
                limit: creditCheck.limit,
                resetDate: creditCheck.resetDate.toISOString()
            }, { status: 403 });
        }
        const isAdmin = creditCheck.plan === 'agency' && creditCheck.remaining === 999;

        console.log(`[V69] ⚡ INICIANDO ESTUDIO DE INTEGRACIÓN PROFUNDA (INPAINT + BAKE)...`);
        const startTime = Date.now();
        
        let inputBuffer: Buffer;
        let briaUsed = false;

        // Intentar Bria para remover fondo (si hay balance de FAL)
        try {
            console.log(`[V69] ✂️ Intentando eliminar fondo con Bria...`);
            const transparentPngUrl = await generateBriaBackgroundRemoval(image_base64);
            console.log(`[V69] 📥 Descargando silueta desde: ${transparentPngUrl}`);
            const imageFetchResponse = await fetch(transparentPngUrl);
            const imageArrayBuffer = await imageFetchResponse.arrayBuffer();
            inputBuffer = Buffer.from(imageArrayBuffer);
            briaUsed = true;
            console.log(`[V69] ✅ Bria OK, fondo eliminado`);
        } catch (briaErr: any) {
            // Bria falló (balance agotado o error de red) - usar imagen original sin procesar fondo
            console.warn(`[V69] ⚠️ Bria falló (${briaErr.message}). Usando imagen original como input.`);
            const base64Data = image_base64.includes(',') ? image_base64.split(',')[1] : image_base64;
            inputBuffer = Buffer.from(base64Data, 'base64');
        }

        const optimizedInput = await sharp(inputBuffer).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).toBuffer();

        // V69: DETECTAR LOGO vs PRODUCTO para elegir pipeline
        const logoMode = await isLikelyLogo(optimizedInput);
        console.log(`[V69] 🏷️ Modo: ${logoMode ? 'LOGO (Inpainting)' : 'PRODUCTO (Inpaint + Bake)'}`);

        let finalImage: string;
        let augmentedPrompt: string;
        let version: string;

if (logoMode) {
            // V69 LOGO MODE: Inpainting — el logo es la BASE, la escena se genera ALREDEDOR
            // ANTES (V67): escena + composite + img2img → logo sobreimpreso como sticker
            // ANTES (V65): Bria Product Shot → pegaba literal según prompt
            // AHORA (V69): 1 sola llamada FAL con inverse mask
            // 1. Logo como imagen base (centrado en lienzo gris)
            // 2. Máscara inversa: negro sobre el logo (proteger), blanco alrededor (generar escena)
            // 3. Flux inpainting genera la escena alrededor del logo respetando su forma
            // COSTE: 1 llamada FAL = $0.10
            const startV69 = Date.now();
            console.log(`[V69] 🎬 Logo: Inpainting — escena generada alrededor del logo...`);

            try {
                // Paso 1: Preparar logo como imagen base (centrado en lienzo 1024x1024)
                const logoMeta = await sharp(optimizedInput).metadata();
                const lW = logoMeta.width || 512;
                const lH = logoMeta.height || 512;
                // Logo al 30% del canvas (visible pero no dominante para que la escena tenga protagonismo)
                const targetLogoW = Math.round(1024 * 0.30);
                const targetLogoH = Math.round(targetLogoW * (lH / lW));
                const logoLeft = Math.round((1024 - targetLogoW) / 2);
                const logoTop = Math.round((1024 - targetLogoH) / 2);

                const resizedLogo = await sharp(optimizedInput)
                    .resize(targetLogoW, targetLogoH, { fit: 'inside' })
                    .ensureAlpha()
                    .toBuffer();

                // Base image: fondo gris neutro + logo centrado
                const baseBuffer = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#808080' } })
                    .composite([{ input: resizedLogo, left: logoLeft, top: logoTop }])
                    .jpeg({ quality: 95 })
                    .toBuffer();

                // Paso 2: Máscara inversa — proteger el logo, generar todo lo demás
                const maskSilhouette = await sharp(resizedLogo)
                    .ensureAlpha()
                    .extractChannel(3)
                    .negate()
                    .toColorspace('srgb')
                    .toBuffer();

                const maskBuffer = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#FFFFFF' } })
                    .composite([{ input: maskSilhouette, left: logoLeft, top: logoTop }])
                    .jpeg({ quality: 90 })
                    .toBuffer();

                const baseDataUri = `data:image/jpeg;base64,${baseBuffer.toString('base64')}`;
                const maskDataUri = `data:image/jpeg;base64,${maskBuffer.toString('base64')}`;

                // Paso 3: Flux inpainting — genera escena alrededor del logo
                // V69: Improved prompt — emphasize logo as part of the scene, not on top
                const inpaintPrompt = `${scene_prompt}, the logo in the center is a physical object placed in this environment, professional product photography, 8k, cinematic lighting, natural shadows and reflections cast by the central logo element, the scene surrounds and complements the logo, harmonious composition, photorealistic, NO TEXT, NO TYPOGRAPHY`;
                finalImage = await generateFluxInpaint(baseDataUri, maskDataUri, inpaintPrompt, 0.85);
                augmentedPrompt = inpaintPrompt;
                version = "v69-logo-inpaint";
                console.log(`[V69] ⏱️ Total: ${((Date.now() - startV69)/1000).toFixed(1)}s`);
            } catch (logoErr: any) {
                console.warn(`[V69] ⚠️ Logo inpaint falló (${logoErr.message}). Intentando fallback img2img...`);
                // V69: Better fallback — use img2img instead of just dark background
                try {
                    const sceneResult = await generateFalImage(scene_prompt);
                    if (sceneResult && sceneResult.imageUrl) {
                        // Composite logo on scene, then img2img to blend
                        const sceneBuf = await (await fetch(sceneResult.imageUrl, { signal: AbortSignal.timeout(15000) })).arrayBuffer();
                        const sceneBuffer = Buffer.from(sceneBuf);
                        const logoMeta = await sharp(optimizedInput).metadata();
                        const lW = logoMeta.width || 512;
                        const lH = logoMeta.height || 512;
                        const targetLogoW = Math.round(1024 * 0.22);
                        const targetLogoH = Math.round(targetLogoW * (lH / lW));
                        const logoLeft = Math.round((1024 - targetLogoW) / 2);
                        const logoTop = Math.round((1024 - targetLogoH) / 2);
                        const resizedLogo = await sharp(optimizedInput)
                            .resize(targetLogoW, targetLogoH, { fit: 'inside' })
                            .ensureAlpha()
                            .toBuffer();
                        const composited = await sharp(sceneBuffer)
                            .resize(1024, 1024, { fit: 'cover' })
                            .composite([{ input: resizedLogo, left: logoLeft, top: logoTop }])
                            .png()
                            .toBuffer();
                        const compositedDataUri = `data:image/png;base64,${composited.toString('base64')}`;
                        // img2img at 0.35 strength to blend without destroying
                        finalImage = await generateFluxImageToImage(compositedDataUri, `${scene_prompt}, harmonious integration, natural lighting, photorealistic`, 0.35);
                        augmentedPrompt = scene_prompt;
                        version = "v69-logo-img2img-fallback";
                    } else {
                        finalImage = await logoFallbackOnDarkBackground(optimizedInput);
                        augmentedPrompt = scene_prompt;
                        version = "v69-logo-dark-fallback";
                    }
                } catch {
                    finalImage = await logoFallbackOnDarkBackground(optimizedInput);
                    augmentedPrompt = scene_prompt;
                    version = "v69-logo-dark-fallback";
                }
            }
        } else {
            // V69 PRODUCT MODE: intenta pipeline inpaint+bake, fallback a composite directo si FAL falla
            try {
                console.log(`[V69] 🎨 Ensamblando Composición Base y Máscara Inversa...`);
                const { baseImage, maskImage } = await createInverseMaskPayload(optimizedInput);

                console.log(`[V69] 🖐️ ESTRUCTURA (Step 1): Construyendo entorno 3D perfecto...`);
                const inpaintStart = Date.now();
                
                augmentedPrompt = `${scene_prompt}, product photography, dynamic lighting, masterpiece, 8k resolution, NO TEXT, NO TYPOGRAPHY, NO LETTERS, NO WORDS ON IMAGE`;
                
                const structureImage = await generateFluxInpaint(baseImage, maskImage, augmentedPrompt, 1.0);
                console.log(`[V69] ⏱️ Estructura Inpaint tardó: ${((Date.now() - inpaintStart)/1000).toFixed(1)}s`);

                console.log(`[V69] 💡 HORNEADO FÍSICO (Step 2): Fusionando luz de la habitación sobre el producto...`);
                const bakeStart = Date.now();
                
                const strength = 0.30; 
                finalImage = await generateFluxImageToImage(structureImage, augmentedPrompt, strength);
                version = "v69-product-inpaint-bake";
                console.log(`[V69] ⏱️ Horneado Físico tardó: ${((Date.now() - bakeStart)/1000).toFixed(1)}s`);
            } catch (productErr: any) {
                // Si FAL falla (balance agotado o cualquier error), hacer fallback: composite directo en fondo elegante
                console.warn(`[V69] ⚠️ Producto FAL falló (${productErr.message}). Fallback directo...`);
                const fallbackStart = Date.now();

                const prodMeta = await sharp(optimizedInput).metadata();
                const pW = prodMeta.width || 512;
                const pH = prodMeta.height || 512;
                const targetW = Math.round(1024 * 0.32);
                const targetH = Math.round(targetW * (pH / pW));
                const left = Math.round((1024 - targetW) / 2);
                const top = Math.round(1024 * 0.52);

                const resized = await sharp(optimizedInput)
                    .resize(targetW, targetH, { fit: 'inside' })
                    .ensureAlpha()
                    .toBuffer();

                const bgBuffer = await sharp({
                    create: { width: 1024, height: 1024, channels: 3, background: '#0f172a' }
                })
                    .png()
                    .toBuffer();

                const composite = await sharp(bgBuffer)
                    .composite([{ input: resized, left, top }])
                    .png()
                    .toBuffer();

                augmentedPrompt = scene_prompt;
                finalImage = `data:image/png;base64,${composite.toString('base64')}`;
                version = "v69-product-fallback-no-fal";
                console.log(`[V69] ⏱️ Fallback completado: ${((Date.now() - fallbackStart)/1000).toFixed(1)}s`);
            }
        }

        const totalTime = ((Date.now() - startTime)/1000).toFixed(1);
        console.log(`[V69] ✅ COMPLETADO en ${totalTime}s.`);

        return NextResponse.json({
            success: true,
            final_composition: finalImage,
            prompt_used: augmentedPrompt,
            version
        });

    } catch (error: any) {
        console.error("Studio v49 Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

