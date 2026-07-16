import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import sharp from 'sharp';
import { generateFluxInpaint, generateFluxImageToImage, generateBriaBackgroundRemoval, generateFalImage, FalBalanceExhaustedError } from '@/lib/fal';

// v41.9: Disable sharp cache to prevent memory saturation in serverless
sharp.cache(false);

export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

const ADMIN_EMAIL = 'gustavodornhofer@gmail.com';

async function consumePremiumCredit(userId: string): Promise<{ canProceed: boolean; isAdmin: boolean }> {
    const clerk = clerkClient;
    const user = await clerk.users.getUser(userId);
    const meta = user.publicMetadata as any;
    const emails = user.emailAddresses.map(e => e.emailAddress.toLowerCase().trim());
    const isAdmin = emails.some(email => email === ADMIN_EMAIL.toLowerCase().trim());

    if (isAdmin) return { canProceed: true, isAdmin };
    if (meta.plan === 'Infinity') return { canProceed: true, isAdmin };

    const credits = meta.premiumStudioCredits !== undefined ? Number(meta.premiumStudioCredits) : 0;
    if (credits <= 0) return { canProceed: false, isAdmin };
    await clerk.users.updateUserMetadata(userId, {
        publicMetadata: { ...meta, premiumStudioCredits: credits - 1 }
    });
    return { canProceed: true, isAdmin };
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

// LOGO DETECTION: Check if the image is a flat logo/graphic vs a 3D physical product
// We analyze both transparency AND the spatial distribution of opaque pixels.
// - A product photo with background removed: large CONTIGUOUS opaque region (the product itself)
// - A flat logo/graphic: small or multiple scattered opaque regions (the design elements)
// Detection: if the biggest opaque blob is < 12% of total pixels AND > 65% is transparent → LOGO
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

        for (let i = 0; i < alphaData.length; i++) {
            if (alphaData[i] < 25) {
                transparentCount++;
                continue;
            }
            // This pixel is at least partially opaque — check if it's fully opaque
            if (alphaData[i] < 200) continue; // semi-transparent, skip for blob detection

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

                // Check 4 neighbors
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

        console.log(`[V58 Logo Detection] Transparent: ${(transparentRatio * 100).toFixed(1)}%, biggest opaque blob: ${(opaqueBlobRatio * 100).toFixed(1)}% of image`);

        // LOGO if: > 65% transparent AND biggest blob is < 12% of total pixels
        // This distinguishes logos (small design elements) from products (large contiguous object)
        return transparentRatio > 0.65 && opaqueBlobRatio < 0.12;
    } catch (e) {
        console.warn('[V58 Logo Detection] Failed, assuming product:', e);
        return false;
    }
}

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { image_base64, scene_prompt } = await req.json();
        if (!image_base64) return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 });
        if (!scene_prompt) return NextResponse.json({ error: 'Falta el prompt de la escena' }, { status: 400 });

        const { canProceed, isAdmin } = await consumePremiumCredit(userId);
        if (!canProceed) return NextResponse.json({ error: 'NO_PREMIUM_CREDITS' }, { status: 403 });

        console.log(`[V56] ⚡ INICIANDO ESTUDIO DE INTEGRACIÓN PROFUNDA (INPAINT + BAKE)...`);
        const startTime = Date.now();
        
        let inputBuffer: Buffer;
        let briaUsed = false;

        // Intentar Bria para remover fondo (si hay balance de FAL)
        try {
            console.log(`[V60] ✂️ Intentando eliminar fondo con Bria...`);
            const transparentPngUrl = await generateBriaBackgroundRemoval(image_base64);
            console.log(`[V60] 📥 Descargando silueta desde: ${transparentPngUrl}`);
            const imageFetchResponse = await fetch(transparentPngUrl);
            const imageArrayBuffer = await imageFetchResponse.arrayBuffer();
            inputBuffer = Buffer.from(imageArrayBuffer);
            briaUsed = true;
            console.log(`[V60] ✅ Bria OK, fondo eliminado`);
        } catch (briaErr: any) {
            // Bria falló (balance agotado o error de red) - usar imagen original sin procesar fondo
            console.warn(`[V60] ⚠️ Bria falló (${briaErr.message}). Usando imagen original como input.`);
            const base64Data = image_base64.includes(',') ? image_base64.split(',')[1] : image_base64;
            inputBuffer = Buffer.from(base64Data, 'base64');
        }

        const optimizedInput = await sharp(inputBuffer).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).toBuffer();

        // V58: DETECTAR LOGO vs PRODUCTO para elegir pipeline
        const logoMode = await isLikelyLogo(optimizedInput);
        console.log(`[V58] 🏷️ Modo: ${logoMode ? 'LOGO (Image-to-Image)' : 'PRODUCTO (Inpaint + Bake)'}`);

        let finalImage: string;
        let augmentedPrompt: string;
        let version: string;

        if (logoMode) {
            // V59 LOGO MODE: Two-step approach
            // Step 1: Generar escena completa con text-to-image (sin input del usuario - sigue el prompt al 100%)
            // Step 2: Compositar el logo real del usuario sobre la escena generada
            // Step 3: Pass final img2img MUY bajo (0.15) solo para suavizar el borde del composite
            console.log(`[V59] 🎨 Generando escena completa con Flux Dev (text-to-image)...`);
            const sceneStart = Date.now();

            try {
                const fullPrompt = `${scene_prompt}, professional scene photography, 8k, cinematic lighting, highly detailed environment`;
                const sceneResult = await generateFalImage(fullPrompt, 'square');
                const sceneUrl = sceneResult.imageUrl;
                console.log(`[V59] ⏱️ Escena generada en: ${((Date.now() - sceneStart)/1000).toFixed(1)}s`);

                // Step 2: Descargar escena + compositar logo
                console.log(`[V59] 🖼️ Compositando logo sobre la escena...`);
                const sceneResponse = await fetch(sceneUrl);
                const sceneBuffer = await sceneResponse.arrayBuffer();
                const sceneImg = Buffer.from(sceneBuffer);

                const logoMeta = await sharp(optimizedInput).metadata();
                const lW = logoMeta.width || 512;
                const lH = logoMeta.height || 512;
                // Logo al 28% del canvas, centrado horizontalmente, en el tercio inferior (como si estuviera colgado)
                const targetLogoW = Math.round(1024 * 0.28);
                const targetLogoH = Math.round(targetLogoW * (lH / lW));
                const left = Math.round((1024 - targetLogoW) / 2);
                const top = Math.round(1024 * 0.55);

                const resizedLogo = await sharp(optimizedInput)
                    .resize(targetLogoW, targetLogoH, { fit: 'inside' })
                    .ensureAlpha()
                    .toBuffer();

                const composite = await sharp(sceneImg)
                    .composite([{ input: resizedLogo, left, top }])
                    .png()
                    .toBuffer();

                // Step 3: Suavizar bordes del composite
                console.log(`[V59] ✨ Suavizando bordes del composite...`);
                const compositeDataUri = `data:image/png;base64,${composite.toString('base64')}`;
                finalImage = await generateFluxImageToImage(compositeDataUri, fullPrompt, 0.15);
                augmentedPrompt = fullPrompt;
                version = "v59-logo-twostep";
                console.log(`[V59] ⏱️ Total: ${((Date.now() - sceneStart)/1000).toFixed(1)}s`);

            } catch (logoErr: any) {
                if (logoErr instanceof FalBalanceExhaustedError) {
                    // FAL sin balance: fallback directo - composite del logo en fondo neutral
                    // No generamos escena con IA, solo compositamos el logo en un fondo bonito
                    console.warn(`[V59] ⚠️ FAL sin balance. Haciendo fallback directo...`);
                    const fallbackStart = Date.now();

                    const logoMeta = await sharp(optimizedInput).metadata();
                    const lW = logoMeta.width || 512;
                    const lH = logoMeta.height || 512;
                    const targetLogoW = Math.round(1024 * 0.30);
                    const targetLogoH = Math.round(targetLogoW * (lH / lW));
                    const left = Math.round((1024 - targetLogoW) / 2);
                    const top = Math.round(1024 * 0.52);

                    const resizedLogo = await sharp(optimizedInput)
                        .resize(targetLogoW, targetLogoH, { fit: 'inside' })
                        .ensureAlpha()
                        .toBuffer();

                    // Fondo degradado elegante en vez de escena IA
                    const bgBuffer = await sharp({
                        create: { width: 1024, height: 1024, channels: 3, background: '#1a1a2e' }
                    })
                        .png()
                        .toBuffer();

                    const composite = await sharp(bgBuffer)
                        .composite([{ input: resizedLogo, left, top }])
                        .png()
                        .toBuffer();

                    const fallbackDataUri = `data:image/png;base64,${composite.toString('base64')}`;
                    augmentedPrompt = scene_prompt;
                    finalImage = fallbackDataUri; // Ya es PNG base64 listo
                    version = "v59-logo-fallback-no-fal";
                    console.log(`[V59] ⏱️ Fallback completado: ${((Date.now() - fallbackStart)/1000).toFixed(1)}s`);
                } else {
                    throw logoErr;
                }
            }
        } else {
            // PRODUCT MODE: intenta pipeline inpaint+bake, fallback a composite directo si FAL falla
            try {
                console.log(`[V60] 🎨 Ensamblando Composición Base y Máscara Inversa...`);
                const { baseImage, maskImage } = await createInverseMaskPayload(optimizedInput);

                console.log(`[V60] 🖐️ ESTRUCTURA (Step 1): Construyendo entorno 3D perfecto...`);
                const inpaintStart = Date.now();
                
                augmentedPrompt = `${scene_prompt}, product photography, dynamic lighting, masterpiece, 8k resolution, NO TEXT, NO TYPOGRAPHY, NO LETTERS, NO WORDS ON IMAGE`;
                
                const structureImage = await generateFluxInpaint(baseImage, maskImage, augmentedPrompt, 1.0);
                console.log(`[V60] ⏱️ Estructura Inpaint tardó: ${((Date.now() - inpaintStart)/1000).toFixed(1)}s`);

                console.log(`[V60] 💡 HORNEADO FÍSICO (Step 2): Fusionando luz de la habitación sobre el producto...`);
                const bakeStart = Date.now();
                
                const strength = 0.30; 
                finalImage = await generateFluxImageToImage(structureImage, augmentedPrompt, strength);
                version = "v60-flux-inpaint-bake";
                console.log(`[V60] ⏱️ Horneado Físico tardó: ${((Date.now() - bakeStart)/1000).toFixed(1)}s`);
            } catch (productErr: any) {
                // Si FAL falla (balance agotado o cualquier error), hacer fallback: composite directo en fondo elegante
                console.warn(`[V60] ⚠️ Producto FAL falló (${productErr.message}). Fallback directo...`);
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
                version = "v60-product-fallback-no-fal";
                console.log(`[V60] ⏱️ Fallback completado: ${((Date.now() - fallbackStart)/1000).toFixed(1)}s`);
            }
        }

        const totalTime = ((Date.now() - startTime)/1000).toFixed(1);
        console.log(`[V56] ✅ COMPLETADO en ${totalTime}s.`);

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

