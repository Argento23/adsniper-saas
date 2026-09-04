"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateReplicateImage = generateReplicateImage;
exports.generateReplicateFluxDev = generateReplicateFluxDev;
exports.ensurePublicUrl = ensurePublicUrl;
exports.generateReplicateFluxRedux = generateReplicateFluxRedux;
exports.generateReplicateVideo = generateReplicateVideo;
async function generateReplicateImage(prompt, width = 1024, height = 1024, isRetry = false) {
    const apiKey = process.env.REPLICATE_API_KEY || process.env.REPLICATE_API_TOKEN;
    console.log(`🔑 Replicate API Key detected: ${apiKey ? apiKey.substring(0, 5) + '...' : 'MISSING'}`);
    if (!apiKey) {
        throw new Error('REPLICATE_API_KEY not configured');
    }
    try {
        console.log(`🎨 Replicate: Generating image with FLUX schnell...`);
        // Use FLUX schnell model (fastest, cheapest, good quality)
        const response = await fetch('https://api.replicate.com/v1/predictions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'wait' // Wait for completion instead of polling
            },
            body: JSON.stringify({
                version: 'c846a69991daf4c0e5d016514849d14ee5b2e6846ce6b9d6f21369e564cfe51e',
                input: {
                    prompt,
                    width,
                    height,
                    num_outputs: 1,
                    output_format: 'png',
                    output_quality: 90
                }
            })
        });
        if (!response.ok) {
            if (response.status === 429 && !isRetry) {
                console.warn(`⏳ Replicate Limit (429) hit for Flux. Waiting 10s...`);
                await new Promise(r => setTimeout(r, 10500));
                return generateReplicateImage(prompt, width, height, true);
            }
            const errorText = await response.text();
            throw new Error(`Replicate API error (${response.status}): ${errorText}`);
        }
        const prediction = await response.json();
        // If Prefer: wait worked, we get output immediately
        if (prediction.status === 'succeeded' && prediction.output && prediction.output[0]) {
            console.log(`✅ Replicate: Image generated successfully`);
            return {
                imageUrl: prediction.output[0],
                cost: 0.0055 // Approximate cost for FLUX schnell
            };
        }
        // Otherwise, poll for completion
        const predictionId = prediction.id;
        let attempts = 0;
        while (attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });
            if (!statusResponse.ok) {
                throw new Error(`Status check failed: ${statusResponse.statusText}`);
            }
            const statusData = await statusResponse.json();
            if (statusData.status === 'succeeded') {
                if (!statusData.output || !statusData.output[0]) {
                    throw new Error('No image URL in prediction output');
                }
                console.log(`✅ Replicate: Image ready after ${attempts}s`);
                return {
                    imageUrl: statusData.output[0],
                    cost: 0.0055
                };
            }
            if (statusData.status === 'failed') {
                throw new Error(`Replicate prediction failed: ${statusData.error || 'Unknown error'}`);
            }
            attempts++;
        }
        throw new Error('Image generation timeout after 30s');
    }
    catch (error) {
        console.error('❌ Replicate Image Generation Failed:', error.message);
        throw error;
    }
}
/**
 * Generate 8K Photorealistic Commercial Image via Replicate FLUX Dev
 */
async function generateReplicateFluxDev(prompt, width = 1024, height = 1024) {
    const apiKey = process.env.REPLICATE_API_KEY || process.env.REPLICATE_API_TOKEN;
    if (!apiKey)
        throw new Error('REPLICATE_API_KEY not configured');
    console.log(`🚀 Replicate: Generating 8K Commercial render with FLUX Dev...`);
    const response = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-dev/predictions', {
        method: 'POST',
        headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait'
        },
        body: JSON.stringify({
            input: {
                prompt,
                aspect_ratio: '1:1',
                output_format: 'jpg',
                output_quality: 92,
                guidance: 3.5,
                num_inference_steps: 28
            }
        })
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Replicate FLUX Dev failed (${response.status}): ${errText}`);
    }
    let prediction = await response.json();
    if (prediction.status === 'succeeded' && prediction.output && prediction.output[0]) {
        return { imageUrl: prediction.output[0], cost: 0.025 };
    }
    // Poll if needed
    let attempts = 0;
    while (attempts < 30) {
        await new Promise(r => setTimeout(r, 1500));
        const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
            headers: { 'Authorization': `Token ${apiKey}` }
        });
        prediction = await statusRes.json();
        if (prediction.status === 'succeeded' && prediction.output && prediction.output[0]) {
            return { imageUrl: prediction.output[0], cost: 0.025 };
        }
        if (prediction.status === 'failed') {
            throw new Error(`Replicate FLUX Dev failed: ${prediction.error}`);
        }
        attempts++;
    }
    throw new Error('Replicate FLUX Dev timeout');
}
async function ensurePublicUrl(src) {
    if (!src)
        throw new Error('Empty image input');
    if (src.startsWith('http://') || src.startsWith('https://')) {
        return src;
    }
    const cleanBase64 = src.includes(',') ? src.split(',')[1] : src;
    const mimeType = src.includes('data:image/jpeg') ? 'image/jpeg' : (src.includes('data:image/webp') ? 'image/webp' : 'image/png');
    const ext = mimeType === 'image/jpeg' ? 'jpg' : (mimeType === 'image/webp' ? 'webp' : 'png');
    // 1. Try FreeImageHost (fast, free public API, accepts base64)
    try {
        const formData = new FormData();
        formData.append('key', '6d207e6419d15d40e5d84d1947234430'); // public API key
        formData.append('action', 'upload');
        formData.append('source', cleanBase64);
        formData.append('format', 'json');
        const res = await fetch('https://freeimage.host/api/1/upload', {
            method: 'POST',
            body: formData,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        if (res.ok) {
            const data = await res.json();
            if (data?.image?.url) {
                console.log(`✅ [ensurePublicUrl] Uploaded image to FreeImageHost: ${data.image.url}`);
                return data.image.url;
            }
        }
    }
    catch (e) {
        console.warn('⚠️ [ensurePublicUrl] FreeImageHost upload error:', e.message);
    }
    // 2. Try Catbox upload fallback
    try {
        const buffer = Buffer.from(cleanBase64, 'base64');
        const blob = new Blob([buffer], { type: mimeType });
        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        formData.append('fileToUpload', blob, `image.${ext}`);
        const res = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: formData });
        if (res.ok) {
            const url = (await res.text()).trim();
            if (url.startsWith('http')) {
                console.log(`✅ [ensurePublicUrl] Uploaded image to Catbox: ${url}`);
                return url;
            }
        }
    }
    catch (e) {
        console.warn('⚠️ [ensurePublicUrl] Catbox upload error:', e.message);
    }
    // 3. Fallback to tmpfiles.org
    try {
        const buffer = Buffer.from(cleanBase64, 'base64');
        const blob = new Blob([buffer], { type: 'image/png' });
        const formData = new FormData();
        formData.append('file', blob, 'product_image.png');
        const res = await fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: formData });
        if (res.ok) {
            const data = await res.json();
            if (data?.data?.url) {
                const directUrl = data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
                console.log(`✅ [ensurePublicUrl] Uploaded image to tmpfiles: ${directUrl}`);
                return directUrl;
            }
        }
    }
    catch (e) {
        console.warn('⚠️ [ensurePublicUrl] tmpfiles upload error:', e.message);
    }
    return src;
}
/**
 * Generate 3D Scene Synthesis guided by an uploaded logo via Replicate FLUX Redux
 */
async function generateReplicateFluxRedux(referenceImageUrl, prompt) {
    const apiKey = process.env.REPLICATE_API_KEY || process.env.REPLICATE_API_TOKEN;
    if (!apiKey)
        return null;
    try {
        console.log(`🎨 Replicate: Synthesizing 3D Scene guided by logo via FLUX Redux...`);
        const publicUrl = await ensurePublicUrl(referenceImageUrl);
        const response = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-redux-dev/predictions', {
            method: 'POST',
            headers: {
                'Authorization': `Token ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: {
                    redux_image: publicUrl,
                    prompt: prompt,
                    aspect_ratio: '1:1',
                    output_format: 'jpg',
                    output_quality: 92
                }
            })
        });
        if (!response.ok) {
            const errText = await response.text();
            console.warn(`⚠️ FLUX Redux initial call error (${response.status}): ${errText}`);
            return null;
        }
        let prediction = await response.json();
        if (prediction.status === 'succeeded' && prediction.output && prediction.output[0]) {
            return prediction.output[0];
        }
        let attempts = 0;
        while (attempts < 35) {
            await new Promise(r => setTimeout(r, 1800));
            const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
                headers: { 'Authorization': `Token ${apiKey}` }
            });
            prediction = await statusRes.json();
            if (prediction.status === 'succeeded' && prediction.output && prediction.output[0]) {
                console.log(`✅ FLUX Redux succeeded in ${attempts * 1.8}s`);
                return prediction.output[0];
            }
            if (prediction.status === 'failed') {
                console.warn(`⚠️ FLUX Redux prediction failed: ${prediction.error}`);
                break;
            }
            attempts++;
        }
        return null;
    }
    catch (err) {
        console.warn('⚠️ FLUX Redux on Replicate error:', err);
        return null;
    }
}
// Video generation using Wan 2.5 image-to-video (modern, reliable)
async function generateReplicateVideo(imageUrl, prompt = "Smooth cinematic motion, professional product showcase, subtle camera movement, high quality 4K", isRetry = false) {
    const apiKey = process.env.REPLICATE_API_KEY || process.env.REPLICATE_API_TOKEN;
    if (!apiKey) {
        throw new Error('REPLICATE_API_KEY not configured');
    }
    try {
        console.log(`🎥 Replicate: Resolving public URL for video generation...`);
        const validPublicUrl = await ensurePublicUrl(imageUrl);
        console.log(`🎥 Replicate: Generating video from image with Wan 2.5 (URL: ${validPublicUrl.substring(0, 40)}...)...`);
        // Use official model API (no version hash needed)
        const response = await fetch('https://api.replicate.com/v1/models/wan-video/wan-2.5-i2v/predictions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: {
                    image: validPublicUrl,
                    prompt: prompt,
                    max_frames: 81,
                    enable_safety_checker: true
                }
            })
        });
        if (!response.ok) {
            if (response.status === 429 && !isRetry) {
                console.warn(`⏳ Replicate Limit (429) hit for Video. Waiting 10s...`);
                await new Promise(r => setTimeout(r, 10500));
                return generateReplicateVideo(imageUrl, prompt, true);
            }
            const errorText = await response.text();
            throw new Error(`Replicate Video API error (${response.status}): ${errorText}`);
        }
        const prediction = await response.json();
        const predictionId = prediction.id;
        // Poll for video (takes longer than images)
        let attempts = 0;
        while (attempts < 90) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });
            if (!statusResponse.ok) {
                throw new Error(`Video status check failed: ${statusResponse.statusText}`);
            }
            const statusData = await statusResponse.json();
            if (statusData.status === 'succeeded') {
                const videoUrl = Array.isArray(statusData.output) ? statusData.output[0] : statusData.output;
                if (!videoUrl) {
                    throw new Error('No video URL in prediction output');
                }
                console.log(`✅ Replicate: Video ready after ${attempts * 2}s`);
                return videoUrl;
            }
            if (statusData.status === 'failed') {
                throw new Error(`Video generation failed: ${statusData.error || 'Unknown error'}`);
            }
            attempts++;
        }
        throw new Error('Video generation timeout after 180s');
    }
    catch (error) {
        console.error('❌ Replicate Video Generation Failed:', error.message);
        throw error;
    }
}
