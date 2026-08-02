import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getClerkUser, updateClerkMetadata } from '@/lib/clerkHelper';
import { pollFalResult } from '@/lib/fal';
import { compositeProductAndLogo } from '@/lib/composer';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'gustavodornhofer@gmail.com';

async function consumePremiumCredit(userId: string): Promise<{ canProceed: boolean; isAdmin: boolean; meta: any }> {
    const user = await getClerkUser(userId);
    const meta = (user?.publicMetadata as any) || {};
    const emails = user?.emailAddresses?.map((e: any) => e.emailAddress.toLowerCase().trim()) || [];
    const isAdmin = emails.includes(ADMIN_EMAIL) || meta.plan === 'Infinity';
    if (isAdmin) return { canProceed: true, isAdmin: true, meta };
    const credits = meta.premiumStudioCredits !== undefined ? Number(meta.premiumStudioCredits) : 0;
    if (credits <= 0) return { canProceed: false, isAdmin: false, meta };
    await updateClerkMetadata(userId, { publicMetadata: { ...meta, premiumStudioCredits: credits - 1 } });
    return { canProceed: true, isAdmin: false, meta };
}

// GROQ: Enhance user prompt for Kontext contextual editing
async function enhancePrompt(userScene: string, brandName?: string): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{
                    role: "system",
                    content: `You are an expert AI image editing prompt engineer. The user has uploaded an image (a product, logo, person, or character).
You must write a CONTEXTUAL EDIT INSTRUCTION for Flux Kontext AI. The instruction tells the AI how to TRANSFORM the uploaded image into the desired scene while PRESERVING the identity of the subject in the image.

CRITICAL RULES:
- Write in English
- The instruction must describe HOW to transform/place the subject FROM THE UPLOADED IMAGE into the new scene
- Preserve the original subject's appearance, colors, shape, and identity
- Include lighting, atmosphere, and mood details
- Add: "photorealistic, 8k, professional advertising photography"
- Max 50 words, return ONLY the prompt text

EXAMPLES:
"niños sosteniendo el logo" → "Place the logo from the image into the hands of two smiling children sitting in a sunlit park, the children tenderly holding it, warm natural lighting, photorealistic 8k professional advertising photography"
"producto en mesa elegante" → "Place the product from the image on an elegant marble table with soft bokeh background, warm studio lighting, subtle reflections, photorealistic 8k commercial photography"
"persona en la playa" → "Transform the scene so the person from the image is standing on a beautiful tropical beach at golden hour, ocean waves behind, warm cinematic lighting, photorealistic 8k photography"`
                }, {
                    role: "user",
                    content: `Brand: ${brandName || 'GenerArise'}. Scene: ${userScene}`
                }]
            })
        });
        const data = await response.json();
        return data.choices[0].message.content.trim().replace(/^"|"$/g, '');
    } catch {
        return `Place the subject from the image into this scene: ${userScene}, photorealistic 8k professional advertising photography`;
    }
}

// Flux Kontext Dev — contextual image editing (takes user image + prompt → transforms it)
async function generateWithKontext(imageDataUri: string, editPrompt: string): Promise<string> {
    const apiKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
    if (!apiKey) throw new Error('FAL_KEY not configured');

    console.log('🎨 [Kontext] Starting contextual image integration...');
    console.log('🎨 [Kontext] Prompt:', editPrompt);

    const response = await fetch('https://fal.run/fal-ai/flux-1/kontext/dev', {
        method: 'POST',
        headers: {
            'Authorization': `Key ${apiKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'respond-async'
        },
        body: JSON.stringify({
            prompt: editPrompt,
            image_url: imageDataUri,
            num_inference_steps: 28,
            guidance_scale: 3.5
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Kontext submit failed (${response.status}): ${error}`);
    }

    const data = await response.json();

    // Synchronous response
    if (data.images && data.images[0]) return data.images[0].url;

    // Async — poll
    const requestId = data.request_id;
    if (!requestId) throw new Error('No request_id from Kontext');

    const result = await pollFalResult(requestId, apiKey, 'fal-ai/flux-1/kontext/dev');
    if (result.images && result.images[0]) return result.images[0].url;
    throw new Error('Kontext completed but no images returned');
}

// Flux Redux fallback — uses image as visual reference for generation
async function generateWithRedux(imageDataUri: string, prompt: string): Promise<string> {
    const apiKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
    if (!apiKey) throw new Error('FAL_KEY not configured');

    console.log('🎨 [Redux] Fallback: reference-based generation...');

    const response = await fetch('https://fal.run/fal-ai/flux-1/dev/redux', {
        method: 'POST',
        headers: {
            'Authorization': `Key ${apiKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'respond-async'
        },
        body: JSON.stringify({
            image_url: imageDataUri,
            prompt,
            image_size: "square_hd",
            num_inference_steps: 28,
            guidance_scale: 3.5
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Redux failed (${response.status}): ${error}`);
    }

    const data = await response.json();
    if (data.images && data.images[0]) return data.images[0].url;

    const requestId = data.request_id;
    if (!requestId) throw new Error('No request_id from Redux');

    const result = await pollFalResult(requestId, apiKey, 'fal-ai/flux-1/dev/redux');
    if (result.images && result.images[0]) return result.images[0].url;
    throw new Error('Redux completed but no images returned');
}

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { image_base64, scene_prompt, brand, applyLogo = true, headlineText } = body;

        if (!image_base64) return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 });

        // Credit check
        const { canProceed } = await consumePremiumCredit(userId);
        if (!canProceed) return NextResponse.json({ error: 'NO_PREMIUM_CREDITS' }, { status: 403 });

        // Enhance prompt
        const enhancedPrompt = await enhancePrompt(
            scene_prompt || "Product on elegant studio pedestal, professional lighting",
            brand?.name
        );
        console.log(`🎯 [Studio Pro] Enhanced prompt: ${enhancedPrompt}`);

        // Prepare image data URI
        const imageDataUri = image_base64.startsWith('data:')
            ? image_base64
            : image_base64.startsWith('http')
                ? image_base64
                : `data:image/png;base64,${image_base64}`;

        let generatedImageUrl: string | null = null;

        // Strategy 1: Flux Kontext Dev (contextual image editing — integrates uploaded image into scene)
        try {
            generatedImageUrl = await generateWithKontext(imageDataUri, enhancedPrompt);
            console.log('✅ [Studio Pro] Kontext succeeded:', generatedImageUrl?.substring(0, 80));
        } catch (err: any) {
            console.warn(`⚠️ Kontext failed: ${err.message}`);
        }

        // Strategy 2: Flux Redux (reference-based generation)
        if (!generatedImageUrl) {
            try {
                generatedImageUrl = await generateWithRedux(imageDataUri, enhancedPrompt);
                console.log('✅ [Studio Pro] Redux succeeded');
            } catch (err: any) {
                console.warn(`⚠️ Redux failed: ${err.message}`);
            }
        }

        // Strategy 3: Replicate FLUX text-only (last resort)
        if (!generatedImageUrl) {
            try {
                const { generateReplicateImage } = await import('@/lib/replicate');
                const res = await generateReplicateImage(enhancedPrompt, 1024, 1024);
                if (res?.imageUrl) generatedImageUrl = res.imageUrl;
            } catch (err: any) {
                console.warn(`⚠️ Replicate fallback failed: ${err.message}`);
            }
        }

        if (!generatedImageUrl) {
            throw new Error('Todos los servicios de generación fallaron. Intente nuevamente.');
        }

        // Optional: Logo badge & text overlay via composer
        let finalUrl = generatedImageUrl;
        try {
            finalUrl = await compositeProductAndLogo({
                sceneImage: generatedImageUrl,
                logoUrlOrBase64: brand?.logo_url,
                brandName: brand?.name,
                primaryColor: brand?.primary_color,
                headlineText: headlineText || null,
                applyLogo: applyLogo !== false
            });
        } catch (compErr) {
            console.warn('[Studio Pro] Composer warning:', compErr);
        }

        return NextResponse.json({
            success: true,
            final_composition: finalUrl,
            original_extracted: image_base64,
            prompt_used: enhancedPrompt
        });

    } catch (error: any) {
        console.error("Studio API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
