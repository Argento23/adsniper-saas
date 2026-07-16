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
            // V63 LOGO MODE: Single-call optimization
            // ANTES: 2 calls (text-to-image + img2img) = $0.20/logo
            // AHORA: 1 call (img2img) sobre input del usuario con prompt de integración
            // El usuario subió un logo PNG transparente, ya tenemos su posición/color/etc.
            // Le pedimos a Flux que lo integre en la escena descrita, pero a strength BAJO (0.30)
            // para preservar el diseño del logo mientras añade la escena alrededor.
            // COSTE: $0.10/logo (50% menos)
            console.log(`[V63] ⚡ Integrando logo en escena (1 llamada FAL, strength 0.30)...`);
            const startV63 = Date.now();

            try {
                // Pre-componer: logo en un fondo neutro ya dimensionado.
                // Esto evita que la IA tenga que adivinar dónde colocar el logo.
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

                const baseScene = await sharp({
                    create: { width: 1024, height: 1024, channels: 3, background: '#e5e7eb' }
                })
                    .png()
                    .toBuffer();

                const composite = await sharp(baseScene)
                    .composite([{ input: resizedLogo, left, top }])
                    .png()
                    .toBuffer();

                // UNA sola llamada a FAL: Flux img2img con strength bajo
                // El prompt guía la integración pero respeta el diseño del logo
                 const compositeDataUri = `data:image/png;base64,${composite.toString('base64')}`;
                const integrationPrompt = `${scene_prompt}. The logo is part of the scene — it has the same lighting, reflections, and materials as its surroundings. Professional scene photography, 8k`;
                finalImage = await generateFluxImageToImage(compositeDataUri, integrationPrompt, 0.30);
                augmentedPrompt = integrationPrompt;
                version = "v63-logo-single-call";
                console.log(`[V63] ⏱️ Total: ${((Date.now() - startV63)/1000).toFixed(1)}s`);
            } catch (logoErr: any) {
                // Logo FAL falló: fallback directo (compositar logo en fondo elegante)
                console.warn(`[V63] ⚠️ Logo FAL falló (${logoErr.message}). Fallback directo...`);
                finalImage = await logoFallbackOnDarkBackground(optimizedInput);
                augmentedPrompt = scene_prompt;
                version = "v63-logo-fallback";
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

