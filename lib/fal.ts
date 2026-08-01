import { auth } from '@clerk/nextjs/server';

interface FalImageResponse {
    imageUrl: string;
    seed: number;
}

/**
 * Robust Async Polling for Fal.ai
 * Optimized for Base64 payloads and long-running jobs.
 */
export async function pollFalResult(requestId: string, apiKey: string, modelName: string = 'fal-ai/flux/dev'): Promise<any> {
    const statusUrl = `https://queue.fal.run/${modelName}/requests/${requestId}/status`;
    const maxAttempts = 90; // Approx 5 minutes at 3.2s interval
    const interval = 3200;
    
    console.log(`[Fal Poll] 🔍 Monitoreando cola: ${modelName} (${requestId})`);
 
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await fetch(statusUrl, {
                headers: { 'Authorization': `Key ${apiKey}` },
                signal: AbortSignal.timeout(10000)
            });
            
            if (!response.ok) {
                if (response.status === 404 && i < 2) {
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                const error = await response.text();
                console.warn(`[Fal Poll] ⚠️ Intento ${i+1} detalló error: ${response.status}`);
                if (response.status >= 500 && i < maxAttempts - 1) {
                    await new Promise(r => setTimeout(r, interval));
                    continue;
                }
                throw new Error(`Polling request failed: ${response.status}`);
            }
            
            const status = await response.json();
            
            // v41.13: Diagnostic logging
            if (status.status === 'COMPLETED') {
                console.log(`✅ [Fal Poll] Tarea ${requestId} COMPLETADA`);
                const resultResponse = await fetch(`https://queue.fal.run/${modelName}/requests/${requestId}`, {
                    headers: { 'Authorization': `Key ${apiKey}` }
                });
                return await resultResponse.json();
            }
            
            if (status.status === 'FAILED') {
                console.error(`❌ [Fal Poll] Tarea ${requestId} FALLÓ: ${status.error}`);
                throw new Error(`AI Job Failed: ${status.error}`);
            }

            // IN_PROGRESS or IN_QUEUE
            const queuePos = status.queue_position !== undefined ? ` (Pos: ${status.queue_position})` : '';
            console.log(`[Fal Poll] [${i+1}/${maxAttempts}] Estado: ${status.status}${queuePos}`);

        } catch (e: any) {
            console.warn(`[Fal Poll] ⚠️ Error de red en ${requestId}: ${e.message}`);
            if (i === maxAttempts - 1) throw e;
        }
        
        await new Promise(r => setTimeout(r, interval));
    }
    throw new Error('AI Generation Timeout (Tiempo de espera de cola agotado)');
}

/**
 * Universal Async Fal Runner
 */
async function runFalAsync(url: string, payload: any): Promise<any> {
    const apiKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
    if (!apiKey) throw new Error('FAL_KEY no configurado');

    const modelName = url.replace('https://fal.run/', '');
    console.log(`🚀 [Fal Async] Iniciando ${modelName}...`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Key ${apiKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'respond-async'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Fal.ai Submit Error (${response.status}): ${error}`);
    }

    const data = await response.json();
    const requestId = data.request_id;
    if (!requestId) return data;

    console.log(`[Fal Async] 🆔 Solicitud: ${requestId}`);
    return await pollFalResult(requestId, apiKey, modelName);
}

export async function generateFalImage(
    prompt: string,
    imageSize: "square_hd" | "square" | "portrait_4_3" | "portrait_16_9" | "landscape_4_3" | "landscape_16_9" = "square"
): Promise<FalImageResponse> {
    const result = await runFalAsync('https://fal.run/fal-ai/flux/dev', {
        prompt, image_size: imageSize, num_inference_steps: 28, guidance_scale: 3.5, num_images: 1, enable_safety_checker: true
    });
    return { imageUrl: result.images[0].url, seed: result.seed };
}

export async function generateFluxReduxImage(
    referenceImageUrl: string,
    prompt: string,
    imageSize: "square_hd" | "portrait_hd" | "landscape_hd" = "square_hd"
): Promise<string> {
    const result = await runFalAsync('https://fal.run/fal-ai/flux-1/dev/redux', {
        image_url: referenceImageUrl, prompt, image_size: imageSize, num_inference_steps: 28, guidance_scale: 3.5
    });
    return result.images[0].url;
}

export async function generateFluxImageToImage(
    imageUrl: string,
    prompt: string,
    strength: number = 0.35
): Promise<string> {
    const result = await runFalAsync('https://fal.run/fal-ai/flux/dev/image-to-image', {
        image_url: imageUrl, prompt, strength, num_inference_steps: 28, guidance_scale: 3.5
    });
    return result.images[0].url;
}

export async function generateFluxInpaint(
    imageUrl: string,
    maskUrl: string,
    prompt: string,
    strength: number = 0.85
): Promise<string> {
    const result = await runFalAsync('https://fal.run/fal-ai/flux-general/inpainting', {
        image_url: imageUrl, mask_url: maskUrl, prompt, strength, num_inference_steps: 24, guidance_scale: 3.5
    });
    return result.images[0].url;
}

// v45: Native Bria E-Commerce Product Shot Integration
export async function generateBriaProductShot(
    imageBase64: string,
    sceneDescription: string
): Promise<string> {
    const result = await runFalAsync('https://fal.run/fal-ai/bria/product-shot', {
        image_url: imageBase64,
        scene_description: sceneDescription,
        // v45.1: Use manual padding to give the AI space to draw hands/people around the product.
        // "automatic" forces a static centered packshot.
        placement_type: "manual_padding",
        padding: [300, 300, 300, 300], // [left, right, top, bottom] pixels for context
        optimize_description: true,
        num_results: 1
    });
    return result.images[0].url;
}

// v46: Kling AI proxy via Fal.ai
export async function generateFalKlingVideo(
    imageUrl: string,
    prompt: string,
    aspectRatio: "16:9" | "9:16" | "1:1" = "16:9"
): Promise<string> {
    console.log(`🎥 [Fal Kling] Generating premium video via Fal...`);
    const result = await runFalAsync('https://fal.run/fal-ai/kling-video/v1/standard/image-to-video', {
        image_url: imageUrl,
        prompt: prompt,
        aspect_ratio: aspectRatio
    });
    if (!result.video || !result.video.url) {
        throw new Error("Fal.ai returned an empty video URL");
    }
    return result.video.url;
}

