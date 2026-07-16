import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import sharp from 'sharp';
import { generateFluxInpaint, generateFluxImageToImage, generateBriaBackgroundRemoval } from '@/lib/fal';

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
// Logos typically have large transparent areas and don't look like photographed products.
// We sample the alpha channel: if >50% of pixels are transparent, it's likely a logo/graphic overlay.
async function isLikelyLogo(buffer: Buffer): Promise<boolean> {
    try {
        const meta = await sharp(buffer).metadata();
        // If no alpha channel, it's not a logo with transparency
        if (!meta.hasAlpha) return false;

        const pixels = await sharp(buffer)
            .ensureAlpha()
            .extractChannel(3) // Alpha channel only
            .raw()
            .toBuffer();

        let transparentCount = 0;
        const total = pixels.length;
        for (let i = 0; i < total; i++) {
            if (pixels[i] < 25) transparentCount++; // alpha < ~10%
        }

        const ratio = transparentCount / total;
        console.log(`[V57 Logo Detection] Alpha transparency ratio: ${(ratio * 100).toFixed(1)}%`);
        // If > 40% of pixels are transparent, treat as logo-style image
        return ratio > 0.4;
    } catch (e) {
        console.warn('[V57 Logo Detection] Failed, assuming product:', e);
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
        
        // v56.1: AUTO-BACKGROUND REMOVAL FOR PERFECT PRODUCT SILHOUETTE
        console.log(`[V56] ✂️ Cortando el fondo del producto para silueta perfecta...`);
        const transparentPngUrl = await generateBriaBackgroundRemoval(image_base64);
        console.log(`[V56] 📥 Descargando silueta desde: ${transparentPngUrl}`);
        const imageFetchResponse = await fetch(transparentPngUrl);
        const imageArrayBuffer = await imageFetchResponse.arrayBuffer();
        const inputBuffer = Buffer.from(imageArrayBuffer);
        
        const optimizedInput = await sharp(inputBuffer).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).toBuffer();

        // V57: DETECTAR LOGO vs PRODUCTO para elegir pipeline
        const logoMode = await isLikelyLogo(optimizedInput);
        console.log(`[V57] 🏷️ Modo: ${logoMode ? 'LOGO (Image-to-Image)' : 'PRODUCTO (Inpaint + Bake)'}`);

        let finalImage: string;
        let augmentedPrompt: string;
        let version: string;

        if (logoMode) {
            // LOGO MODE: Image-to-Image con strength alto para integrar el logo en la escena
            // La IA redibuja el logo dentro del contexto sin preservar píxeles exactos
            console.log(`[V57] 🎨 Integrando logo en escena vía Image-to-Image (strength 0.75)...`);
            const iiStart = Date.now();
            augmentedPrompt = `${scene_prompt}, exact logo design displayed in the scene, professional photography, 8k, NO TEXT, NO TYPOGRAPHY`;
            const dataUri = `data:image/png;base64,${optimizedInput.toString('base64')}`;
            finalImage = await generateFluxImageToImage(dataUri, augmentedPrompt, 0.75);
            version = "v57-logo-img2img";
            console.log(`[V57] ⏱️ Logo Image-to-Image tardó: ${((Date.now() - iiStart)/1000).toFixed(1)}s`);
        } else {
            // PRODUCT MODE: pipeline actual (inpaint inverso + bake)
            console.log(`[V56] 🎨 Ensamblando Composición Base y Máscara Inversa...`);
            const { baseImage, maskImage } = await createInverseMaskPayload(optimizedInput);

            console.log(`[V56] 🖐️ ESTRUCTURA (Step 1): Construyendo entorno 3D perfecto...`);
            const inpaintStart = Date.now();
            
            augmentedPrompt = `${scene_prompt}, product photography, dynamic lighting, masterpiece, 8k resolution, NO TEXT, NO TYPOGRAPHY, NO LETTERS, NO WORDS ON IMAGE`;
            
            // Step 1: Inpainting. Generates the entire room/hands outside the product.
            const structureImage = await generateFluxInpaint(baseImage, maskImage, augmentedPrompt, 1.0);
            console.log(`[V56] ⏱️ Estructura Inpaint tardó: ${((Date.now() - inpaintStart)/1000).toFixed(1)}s`);

            console.log(`[V56] 💡 HORNEADO FÍSICO (Step 2): Fusionando luz de la habitación sobre el producto...`);
            const bakeStart = Date.now();
            
            // Step 2: Precision Harmony Bake.
            const strength = 0.22; 
            finalImage = await generateFluxImageToImage(structureImage, augmentedPrompt, strength);
            version = "v56-flux-inpaint-bake";
            console.log(`[V56] ⏱️ Horneado Físico tardó: ${((Date.now() - bakeStart)/1000).toFixed(1)}s`);
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

