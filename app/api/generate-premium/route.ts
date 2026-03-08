import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'gustavodornhofer@gmail.com';

async function consumePremiumCredit(userId: string): Promise<{ canProceed: boolean; isAdmin: boolean; meta: any; clerk: any }> {
    // Clerk v5: clerkClient must be called as a function
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);
    const meta = user.publicMetadata as any;
    const emails = user.emailAddresses.map(e => e.emailAddress.toLowerCase().trim());
    const isAdmin = emails.includes(ADMIN_EMAIL);
    console.log(`[Premium API] Emails: ${emails.join(', ')}, isAdmin: ${isAdmin}`);
    if (meta.plan === 'Infinity' || isAdmin) return { canProceed: true, isAdmin, meta, clerk };
    const credits = meta.premiumStudioCredits !== undefined ? Number(meta.premiumStudioCredits) : 0;
    if (credits <= 0) return { canProceed: false, isAdmin, meta, clerk };
    await clerk.users.updateUserMetadata(userId, {
        publicMetadata: { ...meta, premiumStudioCredits: credits - 1 }
    });
    return { canProceed: true, isAdmin, meta, clerk };
}

// GROQ PROMPT ENHANCER — Preserves people + scene context
async function enhancePrompt(userScene: string): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{
                    role: "system",
                    content: `You are a product photography art director. Generate a short detailed English image generation prompt for AI.
The image shows a real product being used/held in a scene.
RULES:
- Preserve people mentioned (smiling girl, chef, athlete, child) — they directly interact with the product
- The product should be CLEARLY VISIBLE in the person's hands or the scene
- Keep the setting and mood the user described
- Add: photorealistic, 8k, professional advertising photography, sharp focus on product
- Max 40 words, English only, no intro text
EXAMPLE: "niña sonriente sostiene paquete galletitas en cocina" → "smiling young girl holding a cookie snack package in a bright modern kitchen, warm natural light, sharp product detail, photorealistic 8k advertising photography"`
                }, {
                    role: "user",
                    content: userScene
                }]
            })
        });
        const data = await response.json();
        return data.choices[0].message.content.trim().replace(/^\"|\"$/g, '');
    } catch {
        return `${userScene}, product clearly visible, photorealistic 8k professional advertising photography`;
    }
}

// FAL.ai FLUX Redux — Image Conditioning
async function falFluxRedux(
    base64Image: string,
    prompt: string
): Promise<{ success: boolean; url?: string; error?: string }> {
    const apiKey = process.env.FAL_KEY;
    if (!apiKey) return { success: false, error: "Missing FAL_KEY — get $2 free at fal.ai" };

    try {
        const response = await fetch("https://fal.run/fal-ai/flux-pro/v1.1-ultra-redux", {
            method: "POST",
            headers: {
                "Authorization": `Key ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                image_url: base64Image,
                prompt: prompt,
                image_prompt_strength: 0.12,
                num_images: 1,
                output_format: "png",
                safety_tolerance: "5"
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("FAL FLUX ERROR:", response.status, errorText);
            return { success: false, error: `FAL Error ${response.status}: ${errorText}` };
        }

        const data = await response.json();
        const imageUrl = data.images?.[0]?.url;
        if (!imageUrl) {
            console.error("FAL no returned image URL:", JSON.stringify(data));
            return { success: false, error: "FAL no devolvió imagen" };
        }

        const imgResponse = await fetch(imageUrl);
        const imgBuffer = await imgResponse.arrayBuffer();
        const base64Result = Buffer.from(imgBuffer).toString('base64');
        const dataUri = `data:image/png;base64,${base64Result}`;

        return { success: true, url: dataUri };
    } catch (e: any) {
        console.error("FAL Exception:", e);
        return { success: false, error: e.message };
    }
}

export async function POST(req: Request) {
    try {
        // Clerk v5: auth() must be awaited
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { image_base64, scene_prompt } = body;

        if (!image_base64) return NextResponse.json({ error: 'Falta la imagen del producto' }, { status: 400 });

        // Credit check
        const { canProceed, isAdmin, meta, clerk } = await consumePremiumCredit(userId);
        if (!canProceed) return NextResponse.json({ error: 'NO_PREMIUM_CREDITS' }, { status: 403 });

        // Enhance prompt
        const enhancedPrompt = await enhancePrompt(scene_prompt || "Product on elegant studio pedestal, professional lighting");

        // FLUX Redux — generate scene with product as image reference
        const result = await falFluxRedux(image_base64, enhancedPrompt);

        if (!result.success) {
            // Refund credit on failure
            if (!isAdmin && meta.plan !== 'lifetime') {
                await clerk.users.updateUserMetadata(userId, {
                    publicMetadata: { ...meta, premiumStudioCredits: (meta.premiumStudioCredits || 0) + 1 }
                });
            }
            return NextResponse.json({ error: `Studio AI falló: ${result.error}` }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            final_composition: result.url,
            original_extracted: image_base64,
            prompt_used: enhancedPrompt
        });

    } catch (error: any) {
        console.error("Studio API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
