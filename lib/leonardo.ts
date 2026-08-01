interface LeonardoImageResponse {
    imageUrl: string;
    tokensUsed: number;
}

interface LeonardoVideoResponse {
    videoUrl: string;
    tokensUsed: number;
}

export async function generateLeonardoImage(
    prompt: string,
    width: number = 1024,
    height: number = 1024
): Promise<LeonardoImageResponse> {
    const apiKey = process.env.LEONARDO_API_KEY;

    if (!apiKey) {
        throw new Error('LEONARDO_API_KEY not configured');
    }

    try {
        console.log(`🎨 Leonardo: Generating image...`);

        // Step 1: Create generation job
        const createResponse = await fetch('https://cloud.leonardo.ai/api/rest/v1/generations', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt,
                modelId: 'b24e16ff-06e3-43eb-8d33-4416c2d75876', // Leonardo Phoenix (best for products)
                width,
                height,
                num_images: 1,
                guidance_scale: 7,
                promptMagic: true, // Better quality
                photoReal: true // Realistic style
            })
        });

        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error(`Leonardo API error (${createResponse.status}): ${errorText}`);
        }

        const createData = await createResponse.json();
        const generationId = createData.sdGenerationJob?.generationId;

        if (!generationId) {
            throw new Error('No generationId returned from Leonardo');
        }

        console.log(`🔄 Leonardo: Polling generation ${generationId}...`);

        // Step 2: Poll for completion (max 30s)
        let attempts = 0;
        while (attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 1000));

            const statusResponse = await fetch(
                `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`,
                {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                }
            );

            if (!statusResponse.ok) {
                throw new Error(`Status check failed: ${statusResponse.statusText}`);
            }

            const statusData = await statusResponse.json();
            const generation = statusData.generations_by_pk;

            if (generation?.status === 'COMPLETE') {
                const imageUrl = generation.generated_images[0]?.url;

                if (!imageUrl) {
                    throw new Error('No image URL in completed generation');
                }

                console.log(`✅ Leonardo: Image generated successfully`);

                return {
                    imageUrl,
                    tokensUsed: 10 // Standard cost for 1024x1024
                };
            }

            if (generation?.status === 'FAILED') {
                throw new Error('Leonardo generation failed');
            }

            attempts++;
        }

        throw new Error('Generation timeout after 30s');

    } catch (error: any) {
        console.error('❌ Leonardo Image Generation Failed:', error.message);
        throw error;
    }
}

export async function generateLeonardoVideo(
    imageId: string
): Promise<LeonardoVideoResponse> {
    const apiKey = process.env.LEONARDO_API_KEY;

    if (!apiKey) {
        throw new Error('LEONARDO_API_KEY not configured');
    }

    try {
        console.log(`🎥 Leonardo: Generating video from image...`);

        // Create motion video from image
        const response = await fetch('https://cloud.leonardo.ai/api/rest/v1/generations-motion-svd', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                imageId,
                motionStrength: 5 // 1-10, higher = more motion
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Leonardo Motion API error (${response.status}): ${errorText}`);
        }

        const createData = await response.json();
        const generationId = createData.motionSvdGenerationJob?.generationId;

        if (!generationId) {
            throw new Error('No generationId returned for video');
        }

        console.log(`🔄 Leonardo: Polling video generation ${generationId}...`);

        // Poll for completion (videos take longer, max 60s)
        let attempts = 0;
        while (attempts < 60) {
            await new Promise(resolve => setTimeout(resolve, 2000));

            const statusResponse = await fetch(
                `https://cloud.leonardo.ai/api/rest/v1/generations-motion/${generationId}`,
                {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                }
            );

            if (!statusResponse.ok) {
                throw new Error(`Video status check failed: ${statusResponse.statusText}`);
            }

            const statusData = await statusResponse.json();
            const motion = statusData.motion_generation;

            if (motion?.status === 'COMPLETE') {
                const videoUrl = motion.motionMP4URL;

                if (!videoUrl) {
                    throw new Error('No video URL in completed generation');
                }

                console.log(`✅ Leonardo: Video generated successfully`);

                return {
                    videoUrl,
                    tokensUsed: 25 // Standard cost for motion video
                };
            }

            if (motion?.status === 'FAILED') {
                throw new Error('Leonardo video generation failed');
            }

            attempts++;
        }

        throw new Error('Video generation timeout after 60s');

    } catch (error: any) {
        console.error('❌ Leonardo Video Generation Failed:', error.message);
        throw error;
    }
}
