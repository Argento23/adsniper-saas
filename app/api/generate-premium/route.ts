import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import sharp from 'sharp';
import { generateFluxInpaint, generateFluxImageToImage, generateBriaBackgroundRemoval, generateBriaProductShot, generateFalImage, FalBalanceExhaustedError, pollFalResult } from '@/lib/fal';

// v41.9: Disable sharp cache to prevent memory saturation in serverless
sharp.cache(false);

export const dynamic = 'force-dynamic';
export const maxDuration = 300; 

// V66: Credit consumption delegated to lib/credits.ts (system-wide).
// Studio Pro requires plan 'studio' or 'agency'. Cost: 3 credits per image (Flux Inpaint).
const ADMIN_EMAIL = 'gustavodornhofer@gmail.com';

async function consumePremiumCredit(userId: string, cost: number = 3) {
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

// V81: SMART background removal — preserves existing transparency, and removes
// both solid white and solid black borders cleanly without breaking alpha channels.
async function removeSolidBackground(buffer: Buffer): Promise<Buffer> {
    const meta = await sharp(buffer).metadata();
    const { width = 1, height = 1 } = meta;
    const channels = 4;

    const raw = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: false }) as Buffer;
    const output = Buffer.from(raw);

    let transparentCount = 0;
    let opaqueCount = 0;

    for (let i = 0; i < raw.length; i += channels) {
        const r = raw[i], g = raw[i + 1], b = raw[i + 2];
        const a = raw[i + 3];
        
        // 1. If pixel is already transparent, keep it perfectly transparent
        if (a < 5) {
            output[i + 3] = 0;
            transparentCount++;
            continue;
        }

        // 2. Remove solid white backgrounds
        const isWhite = r > 238 && g > 238 && b > 238;

        // 3. Remove solid black backgrounds
        const isBlack = r < 25 && g < 25 && b < 25;

        if (isWhite || isBlack) {
            output[i + 3] = 0; // transparent
            transparentCount++;
        } else {
            output[i + 3] = a; // keep original alpha perfectly intact
            opaqueCount++;
        }
    }

    console.log(`[V81] ✂️ Background Cleaned: Removed ${transparentCount} bg pixels, kept ${opaqueCount} logo pixels`);
    return sharp(output, { raw: { width, height, channels } }).png().toBuffer();
}

// V73: Fallback elegante cuando FAL no está disponible.
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

        const { image_base64, scene_prompt, mode = 'auto', sceneLogo = false } = await req.json();
        if (!image_base64) return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 });
        if (!scene_prompt) return NextResponse.json({ error: 'Falta el prompt de la escena' }, { status: 400 });

        const creditCheck = await consumePremiumCredit(userId);
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

console.log(`[V83] ⚡ STUDIO INPAINTING PIPELINE...`);
        const startTime = Date.now();
        
        // V83: NO more early Bria background removal — the Inpaint pipeline handles everything
        // Skip directly to mode detection using original image
        const base64Data = image_base64.includes(',') ? image_base64.split(',')[1] : image_base64;
        const originalBuffer = Buffer.from(base64Data, 'base64');
        let optimizedInput = await sharp(originalBuffer).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).toBuffer();

        // V75: Detect intended mode (product vs logo)
        // - 'mode' from user: 'product' | 'logo' | 'auto'
        // - auto: detect from image alpha + prompt keywords
        const imageIsLogo = await isLikelyLogo(optimizedInput);
        const promptSuggestsLogo = /logo|neon|sign|brand|signage|icon|emblem|badge|symbol/i.test(scene_prompt);
        let effectiveMode: 'product' | 'logo';
        if (mode === 'product') {
            effectiveMode = 'product';
        } else if (mode === 'logo') {
            effectiveMode = 'logo';
        } else { // auto
            effectiveMode = (imageIsLogo || promptSuggestsLogo) ? 'logo' : 'product';
        }
        console.log(`[V75] 🎯 User mode: ${mode}, imageIsLogo: ${imageIsLogo}, promptSuggestsLogo: ${promptSuggestsLogo} → ${effectiveMode.toUpperCase()}`);

        // V74: For logos, remove background before compositing
        if (effectiveMode === 'logo') {
            console.log(`[V74] ✂️ Logo mode — removing background...`);
            optimizedInput = await removeSolidBackground(optimizedInput);
        }

        let finalImage: string;
        let augmentedPrompt: string;
        let version: string;

if (effectiveMode === 'product') {
            // V83 PRODUCT MODE: Flux Inpaint — real 3D scene integration with natural shadows/reflections
            // Keeps the product pixel-perfect, AI generates scene around it with proper lighting & depth.
            const startV83 = Date.now();
            console.log(`[V83] 📦 PRODUCT MODE: Flux Inpaint (3D integration)...`);

            try {
                // Use optimizedInput (already resized to 1024x1024) as the product
                console.log(`[V83] Creating inverse mask for product...`);
                const { baseImage, maskImage } = await createInverseMaskPayload(optimizedInput);

                // Inpaint: AI generates the full scene, keeping product exact shape/colors
                console.log(`[V83] Calling Flux Inpaint with scene prompt: "${scene_prompt.substring(0, 60)}..."`);
                const inpaintStart = Date.now();
                finalImage = await generateFluxInpaint(baseImage, maskImage, scene_prompt, 0.95);
                const inpaintUrl = finalImage;
                console.log(`[V83] ⏱️ Inpaint completed in ${((Date.now() - inpaintStart) / 1000).toFixed(1)}s`);

                // Download and re-encode as data URI for response
                const dlResp = await fetch(inpaintUrl, { signal: AbortSignal.timeout(30000) });
                if (!dlResp.ok) throw new Error(`Inpaint download failed: ${dlResp.status}`);
                const dlBuf = Buffer.from(await dlResp.arrayBuffer());
                finalImage = `data:image/png;base64,${dlBuf.toString('base64')}`;

                augmentedPrompt = scene_prompt;
                version = "v83-product-inpaint";
                console.log(`[V83] ✅ Product integration complete: ${((Date.now() - startV83) / 1000).toFixed(1)}s total`);
            } catch (productErr: any) {
                console.warn(`[V83] ⚠️ Product Inpaint failed (${productErr.message}). Falling back to dark composite.`);
                // Last resort fallback: product centered on dark background
                const prodMeta = await sharp(optimizedInput).metadata();
                const pW = prodMeta.width || 512;
                const pH = prodMeta.height || 512;
                const targetW = Math.round(1024 * 0.40);
                const targetH = Math.round(targetW * (pH / pW));
                const left = Math.round((1024 - targetW) / 2);
                const top = Math.round((1024 - targetH) / 2);
                const resized = await sharp(optimizedInput).resize(targetW, targetH, { fit: 'inside' }).ensureAlpha().toBuffer();
                const bgBuffer = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 15, g: 23, b: 42, alpha: 1 } } })
                    .composite([{ input: resized, left, top }]).png().toBuffer();
                finalImage = `data:image/png;base64,${bgBuffer.toString('base64')}`;
                augmentedPrompt = scene_prompt;
                version = "v83-product-fallback";
            }
        } else {
            // V83 LOGO MODE: Flux Inpaint for real 3D integration (no more flat Sharp composite)
            // sceneLogo=true: AI generates scene with logo naturally integrated (shadows, reflections, depth)
            // sceneLogo=false: Dark blue background with centered logo (free, zero API cost)
            if (sceneLogo) {
                console.log(`[V83] 🎬 LOGO SCENE MODE: Flux Inpaint (real 3D integration)...`);
                try {
                    // Create inverse mask: logo protected (black), rest is scene area (white)
                    console.log(`[V83] Creating inverse mask for logo...`);
                    const { baseImage, maskImage } = await createInverseMaskPayload(optimizedInput);

                    // Build scene prompt: make sure it's about placing the logo in a real scene
                    const scenePrompt = `${scene_prompt}, professional photography, photorealistic, 8k, masterpiece, high detail`;

                    // Inpaint: AI generates scene with logo naturally embedded (real shadows, reflections)
                    console.log(`[V83] Calling Flux Inpaint with scene prompt: "${scenePrompt.substring(0, 60)}..."`);
                    const inpaintStart = Date.now();
                    const inpaintUrl = await generateFluxInpaint(baseImage, maskImage, scenePrompt, 0.95);
                    console.log(`[V83] ⏱️ Inpaint completed in ${((Date.now() - inpaintStart) / 1000).toFixed(1)}s`);

                    // Download and return as data URI
                    const dlResp = await fetch(inpaintUrl, { signal: AbortSignal.timeout(30000) });
                    if (!dlResp.ok) throw new Error(`Inpaint download failed: ${dlResp.status}`);
                    const dlBuf = Buffer.from(await dlResp.arrayBuffer());
                    finalImage = `data:image/png;base64,${dlBuf.toString('base64')}`;

                    augmentedPrompt = scenePrompt;
                    version = "v83-logo-inpaint";
                    console.log(`[V83] ✅ Logo scene integration complete`);
                } catch (logoErr: any) {
                    console.warn(`[V83] ⚠️ Logo scene Inpaint failed (${logoErr.message}). Falling back to dark composite.`);
                    const logoMeta = await sharp(optimizedInput).metadata();
                    const lW = logoMeta.width || 512;
                    const lH = logoMeta.height || 512;
                    const tW = Math.round(1024 * 0.30);
                    const tH = Math.round(tW * (lH / lW));
                    const lL = Math.round((1024 - tW) / 2);
                    const lT = Math.round((1024 - tH) / 2);
                    const rL = await sharp(optimizedInput).resize(tW, tH, { fit: 'inside' }).ensureAlpha().png().toBuffer();
                    const c = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 15, g: 23, b: 42, alpha: 1 } } })
                        .composite([{ input: rL, left: lL, top: lT }]).png().toBuffer();
                    finalImage = `data:image/png;base64,${c.toString('base64')}`;
                    augmentedPrompt = scene_prompt;
                    version = "v83-logo-fallback";
                }
            } else {
                // V83 FREE MODE: Logo centered on dark blue background, zero FAL cost
                try {
                    const logoMeta = await sharp(optimizedInput).metadata();
                    const lW = logoMeta.width || 512;
                    const lH = logoMeta.height || 512;
                    const tW = Math.round(1024 * 0.30);
                    const tH = Math.round(tW * (lH / lW));
                    const lL = Math.round((1024 - tW) / 2);
                    const lT = Math.round((1024 - tH) / 2);
                    const rL = await sharp(optimizedInput).resize(tW, tH, { fit: 'inside' }).ensureAlpha().png().toBuffer();
                    const c = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 15, g: 23, b: 42, alpha: 1 } } })
                        .composite([{ input: rL, left: lL, top: lT }]).png().toBuffer();
                    finalImage = `data:image/png;base64,${c.toString('base64')}`;
                    augmentedPrompt = scene_prompt;
                    version = "v83-logo-free";
                } catch {
                    finalImage = `data:image/png;base64,${optimizedInput.toString('base64')}`;
                    augmentedPrompt = scene_prompt;
                    version = "v83-logo-raw";
                }
            }
        }

        const totalTime = ((Date.now() - startTime)/1000).toFixed(1);
        console.log(`[V75] ✅ COMPLETADO en ${totalTime}s. Mode: ${effectiveMode}, Version: ${version}`);

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

