import { auth } from '@clerk/nextjs/server';

interface FalImageResponse {
    imageUrl: string;
    seed: number;
}

export async function generateFalImage(
    prompt: string,
    imageSize: "square" | "portrait" | "landscape" = "square"
): Promise<FalImageResponse> {
    const apiKey = process.env.FAL_API_KEY;

    if (!apiKey) {
        throw new Error('FAL_API_KEY not configured');
    }

    try {
        console.log(`🚀 Fal.ai: Generating premium image with Flux.1 [dev]...`);

        const response = await fetch('https://fal.run/fal-ai/flux/dev', {
            method: 'POST',
            headers: {
                'Authorization': `Key ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: prompt,
                image_size: imageSize,
                num_inference_steps: 28,
                guidance_scale: 3.5,
                num_images: 1,
                enable_safety_checker: true,
                sync_mode: true
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Fal.ai API error (${response.status}): ${errorText}`);
        }

        const result = await response.json();

        if (result.images && result.images[0]) {
            console.log(`✅ Fal.ai: Premium image generated successfully`);
            return {
                imageUrl: result.images[0].url,
                seed: result.seed
            };
        }

        throw new Error('No image URL in Fal.ai output');

    } catch (error: any) {
        console.error('❌ Fal.ai Image Generation Failed:', error.message);
        throw error;
    }
}
