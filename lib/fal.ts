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
/**
 * Uploads a base64 image (data URI or raw base64) to FAL storage
 * and returns a public HTTP URL that FAL AI models can consume.
 */
export async function uploadBase64ToFalStorage(imageBase64: string): Promise<string> {
    if (imageBase64.startsWith('http://') || imageBase64.startsWith('https://')) {
        return imageBase64;
    }

    const apiKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
    if (!apiKey) throw new Error('FAL_KEY not configured');

    const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const buffer = Buffer.from(base64Data, 'base64');
    const contentType = imageBase64.startsWith('data:image/jpeg') ? 'image/jpeg' : (imageBase64.startsWith('data:image/webp') ? 'image/webp' : 'image/png');
    const fileName = contentType === 'image/jpeg' ? 'product.jpg' : 'product.png';

    console.log('📤 [Fal Storage] Initiating image upload...');

    const initiateResponse = await fetch('https://rest.fal.ai/storage/upload/initiate', {
        method: 'POST',
        headers: {
            'Authorization': `Key ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            file_name: fileName,
            content_type: contentType
        })
    });

    if (!initiateResponse.ok) {
        const errText = await initiateResponse.text();
        throw new Error(`FAL storage initiate failed (${initiateResponse.status}): ${errText}`);
    }

    const initiateData = await initiateResponse.json();
    const { upload_url, file_url } = initiateData;

    if (!upload_url || !file_url) {
        throw new Error('FAL storage initiate: missing upload_url/file_url in response');
    }

    const putResponse = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: new Uint8Array(buffer)
    });

    if (!putResponse.ok) {
        const errText = await putResponse.text();
        throw new Error(`FAL storage PUT failed (${putResponse.status}): ${errText}`);
    }

    console.log(`✅ [Fal Storage] Image uploaded successfully: ${file_url}`);
    return file_url;
}

export async function generateFluxReduxImage(
    referenceImageUrl: string,
    prompt: string,
    imageSize: "square_hd" | "portrait_hd" | "landscape_hd" = "square_hd"
): Promise<string> {
    const httpUrl = referenceImageUrl.startsWith('data:') ? await uploadBase64ToFalStorage(referenceImageUrl) : referenceImageUrl;
    const result = await runFalAsync('https://fal.run/fal-ai/flux-1/dev/redux', {
        image_url: httpUrl, prompt, image_size: imageSize, num_inference_steps: 28, guidance_scale: 3.5
    });
    return result.images[0].url;
}

/**
 * IP-Adapter integration: Generates an image where a reference image (logo/product)
 * is organically integrated into a generated scene as described by the prompt.
 * Uses FLUX Dev IP-Adapter for style/subject transfer with configurable influence.
 */
export async function generateFluxIPAdapter(
    referenceImageUrl: string,
    prompt: string,
    ipAdapterScale: number = 0.7,
    imageSize: "square_hd" | "square" | "portrait_4_3" | "landscape_4_3" = "square_hd"
): Promise<string> {
    console.log(`🎨 [Fal IP-Adapter] Integrating reference image into scene...`);
    const httpUrl = referenceImageUrl.startsWith('data:') ? await uploadBase64ToFalStorage(referenceImageUrl) : referenceImageUrl;
    const result = await runFalAsync('https://fal.run/fal-ai/flux-general', {
        prompt,
        image_size: imageSize,
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        enable_safety_checker: true,
        ip_adapter: [{
            ip_adapter_image_url: httpUrl,
            ip_adapter_scale: ipAdapterScale,
            ip_adapter_model: "ip-adapter-faceid" // General subject adapter
        }]
    });
    return result.images[0].url;
}

export async function generateFluxImageToImage(
    imageUrl: string,
    prompt: string,
    strength: number = 0.45
): Promise<string> {
    const httpUrl = imageUrl.startsWith('data:') ? await uploadBase64ToFalStorage(imageUrl) : imageUrl;
    const result = await runFalAsync('https://fal.run/fal-ai/flux/dev/image-to-image', {
        image_url: httpUrl, prompt, strength, num_inference_steps: 28, guidance_scale: 3.5
    });
    return result.images[0].url;
}

export async function generateFluxInpaint(
    imageUrl: string,
    maskUrl: string,
    prompt: string,
    strength: number = 0.85
): Promise<string> {
    const httpUrl = imageUrl.startsWith('data:') ? await uploadBase64ToFalStorage(imageUrl) : imageUrl;
    const httpMaskUrl = maskUrl.startsWith('data:') ? await uploadBase64ToFalStorage(maskUrl) : maskUrl;
    const result = await runFalAsync('https://fal.run/fal-ai/flux-general/inpainting', {
        image_url: httpUrl, mask_url: httpMaskUrl, prompt, strength, num_inference_steps: 24, guidance_scale: 3.5
    });
    return result.images[0].url;
}

// v45: Native Bria E-Commerce Product Shot Integration
export async function generateBriaProductShot(
    imageBase64: string,
    sceneDescription: string
): Promise<string> {
    const httpUrl = imageBase64.startsWith('data:') ? await uploadBase64ToFalStorage(imageBase64) : imageBase64;
    const result = await runFalAsync('https://fal.run/fal-ai/bria/product-shot', {
        image_url: httpUrl,
        scene_description: sceneDescription,
        placement_type: "manual_padding",
        padding: [300, 300, 300, 300],
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

