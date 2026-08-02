import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getClerkUser, updateClerkMetadata } from '@/lib/clerkHelper';
import { compositeProductAndLogo } from '@/lib/composer';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'gustavodornhofer@gmail.com';

async function consumePremiumCredit(userId: string): Promise<{ canProceed: boolean; isAdmin: boolean; meta: any }> {
    const user = await getClerkUser(userId);
    const meta = (user?.publicMetadata as any) || {};
    const emails = user?.emailAddresses?.map((e: any) => e.emailAddress.toLowerCase().trim()) || [];
    const isAdmin = emails.includes(ADMIN_EMAIL) || meta.plan === 'Infinity';

    console.log(`[Premium API] User: ${userId}, Emails: ${emails.join(', ')}, isAdmin: ${isAdmin}`);

    if (isAdmin) return { canProceed: true, isAdmin: true, meta };

    const credits = meta.premiumStudioCredits !== undefined ? Number(meta.premiumStudioCredits) : 0;
    if (credits <= 0) return { canProceed: false, isAdmin: false, meta };

    await updateClerkMetadata(userId, {
        publicMetadata: { ...meta, premiumStudioCredits: credits - 1 }
    });
    return { canProceed: true, isAdmin: false, meta };
}

// GROQ PROMPT ENHANCER — Creates a precise edit instruction for Kontext
async function enhancePromptForKontext(userScene: string): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{
                    role: "system",
                    content: `You are an expert AI image editing prompt engineer. The user has uploaded an image (product, logo, person, or character).
Your job is to write a precise EDIT INSTRUCTION that tells the AI to place/integrate the subject from the uploaded image into the described scene.

RULES:
- Write in English
- Be specific about HOW the subject should appear in the scene (held by someone, displayed on a surface, worn, floating, etc.)
- Include lighting, atmosphere and mood details
- Add: photorealistic, 8k quality, professional advertising photography
- The instruction should describe the FINAL desired result, not the editing process
- Max 50 words
- No intro text, just the prompt

EXAMPLES:
"niños sosteniendo el logo" → "Children happily holding the branded object in their hands in a warm sunlit park, genuine smiles, photorealistic 8k professional advertising photography, natural lighting"
"producto en mesa elegante" → "The product elegantly displayed on a marble table with soft bokeh background, warm studio lighting, photorealistic 8k commercial product photography"`
                }, {
                    role: "user",
                    content: userScene
                }]
            })
        });
        const data = await response.json();
        return data.choices[0].message.content.trim().replace(/^"|"$/g, '');
    } catch {
        return `The subject from the image integrated into the scene: ${userScene}, photorealistic 8k professional advertising photography`;
    }
}

// Upload base64 image to a temporary public URL via fal.ai storage
async function uploadToFalStorage(base64Data: string): Promise<string> {
    const apiKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
    if (!apiKey) throw new Error('FAL_KEY not configured');

    // Convert base64 to buffer
    const cleanBase64 = base64Data.replace(/^data:image\/[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const response = await fetch('https://fal.run/fal-ai/any-llm/storage/upload', {
        method: 'PUT',
        headers: {
            'Authorization': `Key ${apiKey}`,
            'Content-Type': 'image/png'
        },
        body: buffer
    });

    if (!response.ok) {
        // Fallback: use base64 data URI directly
        console.warn('[Upload] Fal storage upload failed, using data URI fallback');
        return `data:image/png;base64,${cleanBase64}`;
    }

    const data = await response.json();
    return data.url || data.file_url || `data:image/png;base64,${cleanBase64}`;
}

// Primary: Flux Kontext Dev — contextual image editing that integrates the subject into the scene
async function generateWithFluxKontext(imageUrl: string, editPrompt: string): Promise<string> {
    const apiKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
    if (!apiKey) throw new Error('FAL_KEY not configured');

    console.log('🎨 [Premium Studio] Using Flux Kontext Dev for contextual integration...');

    const payload = {
        prompt: editPrompt,
        image_url: imageUrl,
        guidance_scale: 3.5,
        num_inference_steps: 28,
        image_size: "square_hd"
    };

    // Submit async
    const response = await fetch('https://fal.run/fal-ai/flux-1/kontext/dev', {
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
        throw new Error(`Flux Kontext submit failed (${response.status}): ${error}`);
    }

    const submitData = await response.json();
    const requestId = submitData.request_id;

    if (!requestId) {
        // Synchronous response
        if (submitData.images && submitData.images[0]) return submitData.images[0].url;
        throw new Error('No request_id or images in Kontext response');
    }

    // Poll for result
    const modelName = 'fal-ai/flux-1/kontext/dev';
    const statusUrl = `https://queue.fal.run/${modelName}/requests/${requestId}/status`;
    const resultUrl = `https://queue.fal.run/${modelName}/requests/${requestId}`;

    for (let i = 0; i < 90; i++) {
        await new Promise(r => setTimeout(r, 3000));

        try {
            const statusRes = await fetch(statusUrl, {
                headers: { 'Authorization': `Key ${apiKey}` }
            });

            if (!statusRes.ok) continue;
            const status = await statusRes.json();

            if (status.status === 'COMPLETED') {
                const resultRes = await fetch(resultUrl, {
                    headers: { 'Authorization': `Key ${apiKey}` }
                });
                const result = await resultRes.json();
                if (result.images && result.images[0]) return result.images[0].url;
                throw new Error('Kontext completed but no images returned');
            }

            if (status.status === 'FAILED') {
                throw new Error(`Kontext generation failed: ${status.error || 'Unknown'}`);
            }

            console.log(`[Kontext Poll] [${i + 1}/90] Status: ${status.status}`);
        } catch (e: any) {
            if (e.message.includes('failed') || e.message.includes('Failed')) throw e;
        }
    }

    throw new Error('Kontext generation timed out');
}

// Fallback: Flux Redux — uses the image as style/subject reference  
async function generateWithFluxRedux(imageUrl: string, prompt: string): Promise<string> {
    const apiKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
    if (!apiKey) throw new Error('FAL_KEY not configured');

    console.log('🎨 [Premium Studio] Fallback to Flux Redux for reference-based generation...');

    const response = await fetch('https://fal.run/fal-ai/flux-1/dev/redux', {
        method: 'POST',
        headers: {
            'Authorization': `Key ${apiKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'respond-async'
        },
        body: JSON.stringify({
            image_url: imageUrl,
            prompt,
            image_size: "square_hd",
            num_inference_steps: 28,
            guidance_scale: 3.5
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Flux Redux failed (${response.status}): ${error}`);
    }

    const submitData = await response.json();
    const requestId = submitData.request_id;

    if (!requestId) {
        if (submitData.images && submitData.images[0]) return submitData.images[0].url;
        throw new Error('No request_id or images in Redux response');
    }

    const modelName = 'fal-ai/flux-1/dev/redux';
    const statusUrl = `https://queue.fal.run/${modelName}/requests/${requestId}/status`;
    const resultUrl = `https://queue.fal.run/${modelName}/requests/${requestId}`;

    for (let i = 0; i < 90; i++) {
        await new Promise(r => setTimeout(r, 3000));

        try {
            const statusRes = await fetch(statusUrl, {
                headers: { 'Authorization': `Key ${apiKey}` }
            });
            if (!statusRes.ok) continue;
            const status = await statusRes.json();

            if (status.status === 'COMPLETED') {
                const resultRes = await fetch(resultUrl, {
                    headers: { 'Authorization': `Key ${apiKey}` }
                });
                const result = await resultRes.json();
                if (result.images && result.images[0]) return result.images[0].url;
            }

            if (status.status === 'FAILED') throw new Error(`Redux failed: ${status.error}`);
        } catch (e: any) {
            if (e.message.includes('failed') || e.message.includes('Failed')) throw e;
        }
    }

    throw new Error('Redux generation timed out');
}

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { image_base64, scene_prompt, brand } = body;

        if (!image_base64) return NextResponse.json({ error: 'Falta la imagen del producto' }, { status: 400 });

        // Credit check
        const { canProceed, isAdmin, meta } = await consumePremiumCredit(userId);
        if (!canProceed) return NextResponse.json({ error: 'NO_PREMIUM_CREDITS' }, { status: 403 });

        // Enhance prompt for contextual editing
        const enhancedPrompt = await enhancePromptForKontext(scene_prompt || "Product on elegant studio pedestal, professional lighting");
        console.log(`🎯 [Premium Studio] Enhanced prompt: ${enhancedPrompt}`);

        // Upload user image to get a URL (Kontext needs a URL, not base64)
        let imageUrl: string;
        if (image_base64.startsWith('http')) {
            imageUrl = image_base64;
        } else {
            // Use data URI directly — fal.ai accepts data URIs
            const cleanBase64 = image_base64.replace(/^data:image\/[^;]+;base64,/, '');
            imageUrl = `data:image/png;base64,${cleanBase64}`;
        }

        let generatedImageUrl: string | null = null;

        // Strategy 1: Flux Kontext Dev — best for contextual image editing
        try {
            generatedImageUrl = await generateWithFluxKontext(imageUrl, enhancedPrompt);
            console.log('✅ [Premium Studio] Kontext generation succeeded');
        } catch (kontextErr: any) {
            console.warn(`⚠️ Kontext failed: ${kontextErr.message}`);
        }

        // Strategy 2: Flux Redux — reference-based generation
        if (!generatedImageUrl) {
            try {
                generatedImageUrl = await generateWithFluxRedux(imageUrl, enhancedPrompt);
                console.log('✅ [Premium Studio] Redux generation succeeded');
            } catch (reduxErr: any) {
                console.warn(`⚠️ Redux failed: ${reduxErr.message}`);
            }
        }

        // Strategy 3: Bria Product Shot
        if (!generatedImageUrl) {
            try {
                const { generateBriaProductShot } = await import('@/lib/fal');
                generatedImageUrl = await generateBriaProductShot(image_base64, enhancedPrompt);
                console.log('✅ [Premium Studio] Bria Product Shot succeeded');
            } catch (briaErr: any) {
                console.warn(`⚠️ Bria failed: ${briaErr.message}`);
            }
        }

        if (!generatedImageUrl) {
            throw new Error('Todos los servicios de generación fallaron. Intente nuevamente.');
        }

        // Optional: Add discrete brand logo watermark (NOT the product overlay — product is already IN the scene)
        let finalUrl = generatedImageUrl;
        if (brand?.logo_url) {
            try {
                finalUrl = await compositeProductAndLogo({
                    sceneImage: generatedImageUrl,
                    productImageBase64: null, // NO product overlay — it's already integrated by AI
                    logoUrlOrBase64: brand.logo_url,
                    brandName: brand.name,
                    primaryColor: brand.primary_color
                });
            } catch (compErr) {
                console.warn('[Premium Studio] Logo watermark failed, using raw AI output:', compErr);
                finalUrl = generatedImageUrl;
            }
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
