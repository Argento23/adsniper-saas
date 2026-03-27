import jwt from 'jsonwebtoken';

/**
 * Generates a standard JWT token for Kling AI API authentication.
 * It uses the HS256 algorithm and encodes the issuer and expiration time.
 */
export function generateKlingJWT(): string {
    const accessKey = process.env.KLING_ACCESS_KEY;
    const secretKey = process.env.KLING_SECRET_KEY;

    if (!accessKey || !secretKey) {
        throw new Error('Kling API keys (KLING_ACCESS_KEY or KLING_SECRET_KEY) are missing in environment variables.');
    }

    const payload = {
        iss: accessKey,
        nbf: Math.floor(Date.now() / 1000) - 5, // Not before (5 seconds ago to avoid sync issues)
        exp: Math.floor(Date.now() / 1000) + 1800 // Valid for 30 minutes
    };

    const token = jwt.sign(payload, secretKey, { algorithm: 'HS256' });
    return token;
}

/**
 * Sleep utility
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Submits an image-to-video task to Kling AI
 */
export async function submitKlingVideoJob(imageUrl: string, prompt: string, aspectRatio: string = '16:9'): Promise<string> {
    const token = generateKlingJWT();

    // Map common aspect ratios to Kling AI expected values
    const validRatios = ['16:9', '9:16', '1:1'];
    const finalRatio = validRatios.includes(aspectRatio) ? aspectRatio : '16:9';

    const response = await fetch('https://api.klingai.com/v1/videos/image2video', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'kling-v1', // standard image to video model
            image: imageUrl,
            prompt: prompt,
            duration: '5' // We start with a 5 second video as default minimum unless requested differently
        })
    });

    if (!response.ok) {
        let errorText = await response.text();
        console.error(`[Kling API] Submit error (${response.status}):`, errorText);
        throw new Error(`Kling API Failed to submit task: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    // Check if the business logic inside the 200 OK has an error
    if (data.code !== 0) {
        throw new Error(`Kling API Internal Error: ${data.message} (code: ${data.code})`);
    }

    // task_id is returned in the data
    const taskId = data.data.task_id;
    console.log(`[Kling API] Task submitted successfully: ${taskId}`);
    return taskId;
}

/**
 * Polling function to wait until the video generation is completed
 */
export async function pollKlingVideoJob(taskId: string): Promise<string> {
    const maxAttempts = 60; // 60 attempts * 5 seconds = 5 minutes timeout
    const pollInterval = 5000;

    for (let i = 0; i < maxAttempts; i++) {
        // Need to generate a fresh token just in case
        const token = generateKlingJWT();

        const response = await fetch(`https://api.klingai.com/v1/videos/image2video/${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            console.warn(`[Kling API] Poll error (${response.status}) on attempt ${i + 1}`);
            if (response.status >= 500) {
                // Server issue, retry
                await sleep(pollInterval);
                continue;
            }
            throw new Error(`Kling poll request failed with status: ${response.status}`);
        }

        const data = await response.json();

        if (data.code !== 0) {
            throw new Error(`Kling API Error during polling: ${data.message}`);
        }

        const status = data.data.task_status;
        console.log(`[Kling API] Task ${taskId} status: ${status}`);

        if (status === 'succeed') {
            console.log(`[Kling API] Task ${taskId} COMPLETED`);
            return data.data.task_result.videos[0].url;
        }

        if (status === 'failed') {
            const failReason = data.data.task_status_msg || 'Unknown failure';
            throw new Error(`Kling compilation failed: ${failReason}`);
        }

        // status is 'submitted' or 'processing'
        await sleep(pollInterval);
    }

    throw new Error('Kling video generation timed out after 5 minutes.');
}

/**
 * Universal Wrapper for end-to-end video generation
 */
export async function generateNativeKlingVideo(
    imageUrl: string, 
    prompt: string, 
    aspectRatio: string = '16:9'
): Promise<string> {
    console.log(`🎥 [Native Kling] Generating premium video...`);
    
    const taskId = await submitKlingVideoJob(imageUrl, prompt, aspectRatio);
    const videoUrl = await pollKlingVideoJob(taskId);
    
    return videoUrl;
}
