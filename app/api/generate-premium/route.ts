import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getClerkUser, updateClerkMetadata } from '@/lib/clerkHelper';
import { generateFalImage } from '@/lib/fal';
import { generateReplicateImage } from '@/lib/replicate';
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

// GROQ: Expand user prompt into an 8K Commercial Advertising Art Prompt
async function enhancePromptForStudio8K(userScene: string, brandName?: string): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{
                    role: "system",
                    content: `You are an elite commercial ad photographer and art director.
Your task is to take the user's scene description and transform it into a hyper-realistic 8K FLUX image prompt.

RULES:
- Write in English
- Describe the subjects, action, posture, expressions, lighting, shadows, environment, and camera settings in vivid detail
- ALWAYS specify high-end commercial quality: "photorealistic 8k professional advertising photography, 35mm Hasselblad lens, warm soft natural lighting, sharp focus, cinema depth of field"
- If people or children are in the prompt, describe their authentic happy expressions and how they hold or display the product/brand emblem naturally
- Max 60 words, return ONLY the prompt text, no quotes or intros

EXAMPLES:
"niños sosteniendo el logo" → "Two smiling happy children sitting in a sunlit green park, carefully holding a polished 3D geometric brand emblem in their hands, genuine joyful expressions, warm afternoon sunlight, soft bokeh background, photorealistic 8k professional advertising photography"
"dos emprendedores dándose la mano" → "Two ambitious professionals warmly shaking hands in a modern glass office at sunset, confident smiles, tailored suits, warm golden hour ambient lighting, crisp focus, photorealistic 8k commercial photography"`
                }, {
                    role: "user",
                    content: `Brand: ${brandName || 'GenerArise'}. Desired scene: ${userScene}`
                }]
            })
        });
        const data = await response.json();
        return data.choices[0].message.content.trim().replace(/^"|"$/g, '');
    } catch {
        return `A photorealistic 8k commercial ad photo of ${userScene}, professional advertising photography, soft studio lighting, sharp focus`;
    }
}

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { image_base64, scene_prompt, brand, applyLogo = true, headlineText } = body;

        // Credit check
        const { canProceed } = await consumePremiumCredit(userId);
        if (!canProceed) return NextResponse.json({ error: 'NO_PREMIUM_CREDITS' }, { status: 403 });

        // 1. Expand scene description into 8K Ad Prompt
        const enhancedPrompt = await enhancePromptForStudio8K(
            scene_prompt || "Product displayed on an elegant marble pedestal, studio lighting",
            brand?.name
        );
        console.log(`🎯 [Studio Pro 8K] Prompt: ${enhancedPrompt}`);

        let generatedImageUrl: string | null = null;

        // 2. Strategy 1: Fal.ai FLUX Dev (Highest 8K quality)
        try {
            if (process.env.FAL_KEY || process.env.FAL_API_KEY) {
                console.log('🚀 [Studio Pro 8K] Generating via Fal FLUX Dev...');
                const falResult = await generateFalImage(enhancedPrompt, "square_hd");
                if (falResult && falResult.imageUrl) {
                    generatedImageUrl = falResult.imageUrl;
                    console.log('✅ [Studio Pro 8K] Fal FLUX succeeded');
                }
            }
        } catch (falErr: any) {
            console.warn(`⚠️ [Studio Pro 8K] Fal.ai failed: ${falErr.message}`);
        }

        // 3. Strategy 2: Replicate FLUX Schnell
        if (!generatedImageUrl) {
            try {
                console.log('🚀 [Studio Pro 8K] Fallback to Replicate FLUX...');
                const repResult = await generateReplicateImage(enhancedPrompt, 1024, 1024);
                if (repResult && repResult.imageUrl) {
                    generatedImageUrl = repResult.imageUrl;
                    console.log('✅ [Studio Pro 8K] Replicate FLUX succeeded');
                }
            } catch (repErr: any) {
                console.warn(`⚠️ [Studio Pro 8K] Replicate failed: ${repErr.message}`);
            }
        }

        // 4. Strategy 3: Pollinations AI
        if (!generatedImageUrl) {
            console.warn('⚠️ [Studio Pro 8K] Fallback to Pollinations AI');
            const cleanPrompt = encodeURIComponent(enhancedPrompt.substring(0, 150));
            const seed = Math.floor(Math.random() * 1000000);
            generatedImageUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&nologo=true&seed=${seed}`;
        }

        // 5. Composite logo watermark & headline text
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
            console.warn('[Studio Pro 8K] Composer warning:', compErr);
        }

        return NextResponse.json({
            success: true,
            final_composition: finalUrl,
            original_extracted: image_base64 || '',
            prompt_used: enhancedPrompt
        });

    } catch (error: any) {
        console.error("Studio API Error:", error);
        return NextResponse.json({ error: error.message || 'Error en Studio Pro' }, { status: 500 });
    }
}
