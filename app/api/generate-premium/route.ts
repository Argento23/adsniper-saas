import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { generateBriaProductShot, generateFalImage } from '@/lib/fal';
import { compositeProductAndLogo } from '@/lib/composer';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'gustavodornhofer@gmail.com';

async function consumePremiumCredit(userId: string): Promise<{ canProceed: boolean; isAdmin: boolean; meta: any; clerk: any }> {
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

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { image_base64, scene_prompt, brand } = body;

        if (!image_base64) return NextResponse.json({ error: 'Falta la imagen del producto' }, { status: 400 });

        // Credit check
        const { canProceed, isAdmin, meta, clerk } = await consumePremiumCredit(userId);
        if (!canProceed) return NextResponse.json({ error: 'NO_PREMIUM_CREDITS' }, { status: 403 });

        // Enhance prompt
        const enhancedPrompt = await enhancePrompt(scene_prompt || "Product on elegant studio pedestal, professional lighting");

        let generatedSceneUrl: string | null = null;

        // 1. Try Bria Product Shot for ultra-realistic product integration into scene
        try {
            if (process.env.FAL_KEY || process.env.FAL_API_KEY) {
                console.log('🎨 [Premium Studio] Attempting Bria Product Shot integration...');
                generatedSceneUrl = await generateBriaProductShot(image_base64, enhancedPrompt);
            }
        } catch (briaErr: any) {
            console.warn('⚠️ Bria Product Shot failed, trying Fal Flux Dev fallback:', briaErr.message);
        }

        // 2. Fallback to Fal Flux Dev Text-to-Image scene if Bria is unavailable
        if (!generatedSceneUrl) {
            try {
                if (process.env.FAL_KEY || process.env.FAL_API_KEY) {
                    const falRes = await generateFalImage(enhancedPrompt);
                    if (falRes && falRes.imageUrl) generatedSceneUrl = falRes.imageUrl;
                }
            } catch (falErr: any) {
                console.warn('⚠️ Fal Flux Dev failed:', falErr.message);
            }
        }

        // 3. Final fallback: Pollinations scene background
        if (!generatedSceneUrl) {
            const cleanPrompt = enhancedPrompt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/gi, '').substring(0, 100).trim().replace(/\s+/g, '_');
            const seed = Math.floor(Math.random() * 1000000);
            generatedSceneUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&nologo=true&seed=${seed}`;
        }

        // 4. Composite Product Photo & Brand Logo into scene background realistically
        const finalComposition = await compositeProductAndLogo({
            sceneImage: generatedSceneUrl,
            productImageBase64: generatedSceneUrl.includes('bria') ? null : image_base64, // If Bria already integrated product, just composite logo
            logoUrlOrBase64: brand?.logo_url,
            brandName: brand?.name,
            primaryColor: brand?.primary_color
        });

        return NextResponse.json({
            success: true,
            final_composition: finalComposition,
            original_extracted: image_base64,
            prompt_used: enhancedPrompt
        });

    } catch (error: any) {
        console.error("Studio API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
