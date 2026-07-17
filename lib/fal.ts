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
export class FalBalanceExhaustedError extends Error {
    constructor() {
        super('FAL_BALANCE_EXHAUSTED');
        this.name = 'FalBalanceExhaustedError';
    }
}

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
        const errorText = await response.text();
        if (response.status === 403 && errorText.includes('balance')) {
            throw new FalBalanceExhaustedError();
        }
        throw new Error(`Fal.ai Submit Error (${response.status}): ${errorText}`);
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
    const apiKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
    console.log(`[Fal] 🖼️ Generando imagen con Flux Dev...`);

    const response = await fetch('https://fal.run/fal-ai/flux/dev', {
        method: 'POST',
        headers: {
            'Authorization': `Key ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            prompt,
            image_size: imageSize,
            num_inference_steps: 28,
            guidance_scale: 3.5,
            num_images: 1,
            enable_safety_checker: true,
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        if (response.status === 403 && err.includes('balance')) {
            throw new FalBalanceExhaustedError();
        }
        throw new Error(`Fal Flux error (${response.status}): ${err}`);
    }

    const result = await response.json();
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
async function uploadToFalStorage(imageBase64: string, apiKey: string): Promise<string> {
    // Convierte base64 a Buffer y sube a FAL storage
    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const buf = Buffer.from(base64Data, 'base64');

    const uploadRes = await fetch('https://storage.fal.ai/api/upload', {
        method: 'POST',
        headers: {
            'Authorization': `Key ${apiKey}`,
            'Content-Type': 'application/octet-stream',
        },
        body: buf,
    });
    if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Fal storage upload error (${uploadRes.status}): ${errText.substring(0, 200)}`);
    }
    const uploadResult = await uploadRes.json();
    // FAL returns { url: "https://..."} or just the URL string
    if (typeof uploadResult === 'string') return uploadResult;
    return uploadResult.url || uploadResult;
}

export async function generateBriaBackgroundRemoval(
    imageBase64: string
): Promise<string> {
    console.log(`[Fal] ✂️ Solicitando eliminación de fondo para silueta perfecta...`);

    const apiKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
    const dataUri = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;

    // Try data URI first (fast); fallback to upload if model rejects it
    let resultRes = await fetch('https://fal.run/fal-ai/bria/background/remove', {
        method: 'POST',
        headers: { 'Authorization': `Key ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: dataUri }),
    });

    if (!resultRes.ok) {
        console.warn(`[Fal] Data URI rejected (${resultRes.status}), uploading to FAL storage...`);
        const imageUrl = await uploadToFalStorage(imageBase64, apiKey);
        resultRes = await fetch('https://fal.run/fal-ai/bria/background/remove', {
            method: 'POST',
            headers: { 'Authorization': `Key ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_url: imageUrl }),
        });
        if (!resultRes.ok) {
            const errText = await resultRes.text();
            throw new Error(`Fal Bria error (${resultRes.status}): ${errText.substring(0, 200)}`);
        }
    }

    const result = await resultRes.json();
    return result.image.url;
}

export async function generateBriaProductShot(
    imageBase64: string,
    sceneDescription: string
): Promise<string> {
    console.log(`[Fal] 🎬 Bria Product Shot con escena: "${sceneDescription.substring(0, 60)}..."`);

    const apiKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
    const dataUri = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;

    // V65 PARAMS: placement_type "original" + padding mínimo = el producto mantiene
    // su tamaño original, NO se infla. optimize_description:true permite a Bria
    // reinterpretar el prompt para mejor integración. num_results:1 baja el costo.
    let resultRes = await fetch('https://fal.run/fal-ai/bria/product-shot', {
        method: 'POST',
        headers: { 'Authorization': `Key ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image_url: dataUri,
            scene_description: sceneDescription,
            placement_type: 'original',
            padding: [50, 50, 50, 50],
            optimize_description: true,
            num_results: 1,
        }),
    });

    if (!resultRes.ok) {
        console.warn(`[Fal] Data URI rejected (${resultRes.status}), uploading to FAL storage...`);
        const imageUrl = await uploadToFalStorage(imageBase64, apiKey);
        resultRes = await fetch('https://fal.run/fal-ai/bria/product-shot', {
            method: 'POST',
            headers: { 'Authorization': `Key ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_url: imageUrl,
                scene_description: sceneDescription,
                placement_type: 'original',
                padding: [50, 50, 50, 50],
                optimize_description: true,
                num_results: 1,
            }),
        });
        if (!resultRes.ok) {
            const errText = await resultRes.text();
            throw new Error(`Fal Bria error (${resultRes.status}): ${errText.substring(0, 200)}`);
        }
    }

    const result = await resultRes.json();
    return result.images[0].url;
}

// v46: Kling AI proxy via Fal.ai
export async function generateFalKlingVideo(
    imageUrl: string,
    prompt: string,
    aspectRatio: "16:9" | "9:16" | "1:1" = "16:9"
): Promise<string> {
    console.log(`🎥 [Fal Kling] Generating premium video via Fal...`);
    const { fal } = await import('@fal-ai/client');
    fal.config({ credentials: process.env.FAL_KEY || process.env.FAL_API_KEY });

    const result = await fal.subscribe('fal-ai/kling-video/v1/standard/image-to-video', {
        input: {
            image_url: imageUrl,
            prompt: prompt,
            aspect_ratio: aspectRatio,
        },
        logs: true,
        onQueueUpdate: (update) => {
            if (update.status === 'IN_PROGRESS') {
                update.logs.map((log: any) => log.message).forEach(console.log);
            }
        },
    });

    if (!result.data.video || !result.data.video.url) {
        throw new Error("Fal.ai returned an empty video URL");
    }
    return result.data.video.url;
}
