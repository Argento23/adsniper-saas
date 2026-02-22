interface ReplicateImageResponse {
    imageUrl: string;
    cost: number; // Costo en USD
}

export async function generateReplicateImage(
    prompt: string,
    width: number = 1024,
    height: number = 1024
): Promise<ReplicateImageResponse> {
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

            const statusResponse = await fetch(
                `https://api.replicate.com/v1/predictions/${predictionId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`
                    }
                }
            );

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

    } catch (error: any) {
        console.error('❌ Replicate Image Generation Failed:', error.message);
        throw error;
    }
}

// Video generation using Wan 2.5 image-to-video (modern, reliable)
export async function generateReplicateVideo(
    imageUrl: string
): Promise<string> {
    const apiKey = process.env.REPLICATE_API_KEY || process.env.REPLICATE_API_TOKEN;

    if (!apiKey) {
        throw new Error('REPLICATE_API_KEY not configured');
    }

    try {
        console.log(`🎥 Replicate: Generating video from image with Wan 2.5...`);

        // Use official model API (no version hash needed)
        const response = await fetch('https://api.replicate.com/v1/models/wan-video/wan-2.5-i2v/predictions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: {
                    image: imageUrl,
                    prompt: "Smooth cinematic motion, professional product showcase, subtle camera movement, high quality 4K",
                    max_frames: 81,
                    enable_safety_checker: true
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Replicate Video API error (${response.status}): ${errorText}`);
        }

        const prediction = await response.json();
        const predictionId = prediction.id;

        // Poll for video (takes longer than images)
        let attempts = 0;
        while (attempts < 90) {
            await new Promise(resolve => setTimeout(resolve, 2000));

            const statusResponse = await fetch(
                `https://api.replicate.com/v1/predictions/${predictionId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`
                    }
                }
            );

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

    } catch (error: any) {
        console.error('❌ Replicate Video Generation Failed:', error.message);
        throw error;
    }
}
