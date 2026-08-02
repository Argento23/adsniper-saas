import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getClerkUser, updateClerkMetadata } from '@/lib/clerkHelper';
import { generateReplicateImage } from '@/lib/replicate';
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

// GROQ PROMPT ENHANCER — Transforms user scene into hyper-realistic 8K image prompt
async function enhancePromptForStudio(userScene: string, brandName?: string): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{
                    role: "system",
                    content: `You are an expert AI commercial art director. The user wants an ultra-realistic advertising image.
Your job is to expand their scene description into a detailed, photorealistic 8K FLUX image generation prompt.

RULES:
- Write in English
- Describe the subject, people, interaction, lighting, environment, depth of field, and atmosphere in rich detail
- Always specify high-end commercial photo quality: "photorealistic 8k professional advertising photography, soft natural lighting, sharp focus, 35mm lens"
- If children, people or models are mentioned, describe their genuine expressions, posture, and hands holding/interacting with the branded product/item naturally
- Max 60 words
- Return ONLY the prompt text, no intros or quotes

EXAMPLES:
"Unos niños sosteniendo el logo en sus manos" → "Two happy young children tenderly holding a glowing 3D hexagonal branded logo emblem in their hands, sitting together in a bright sunlit park, warm softbox lighting, genuine joyful expressions, soft blurred bokeh background, photorealistic 8k professional advertising photography"
"Producto en cocina moderna" → "The premium product elegantly placed on a white quartz countertop in a modern luxury kitchen, warm ambient lighting, subtle reflections, professional commercial product photography, 8k resolution"`
                }, {
                    role: "user",
                    content: `Brand: ${brandName || 'AdSíntesis'}. Scene desired: ${userScene}`
                }]
            })
        });
        const data = await response.json();
        return data.choices[0].message.content.trim().replace(/^"|"$/g, '');
    } catch {
        return `A photorealistic 8k commercial photo of ${userScene}, professional advertising photography, soft lighting, sharp focus`;
    }
}

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { image_base64, scene_prompt, brand } = body;

        // Credit check
        const { canProceed, isAdmin, meta } = await consumePremiumCredit(userId);
        if (!canProceed) return NextResponse.json({ error: 'NO_PREMIUM_CREDITS' }, { status: 403 });

        // 1. Enhance prompt with Groq
        const enhancedPrompt = await enhancePromptForStudio(
            scene_prompt || "Product on elegant studio pedestal, professional lighting",
            brand?.name
        );
        console.log(`🎯 [Studio Pro API] Enhanced prompt: ${enhancedPrompt}`);

        // 2. Generate scene using Replicate FLUX schnell (super fast & reliable)
        let generatedImageUrl: string | null = null;

        try {
            const replicateRes = await generateReplicateImage(enhancedPrompt, 1024, 1024);
            if (replicateRes && replicateRes.imageUrl) {
                generatedImageUrl = replicateRes.imageUrl;
                console.log(`✅ [Studio Pro API] Replicate FLUX generated successfully: ${generatedImageUrl}`);
            }
        } catch (repErr: any) {
            console.error(`❌ [Studio Pro API] Replicate error:`, repErr.message);
        }

        // Fallback: Pollinations if Replicate is temporarily down
        if (!generatedImageUrl) {
            console.warn('[Studio Pro API] Fallback to Pollinations AI');
            const cleanPrompt = encodeURIComponent(enhancedPrompt.substring(0, 150));
            const seed = Math.floor(Math.random() * 1000000);
            generatedImageUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&nologo=true&seed=${seed}`;
        }

        // 3. Composite brand logo or watermark if available
        let finalUrl = generatedImageUrl;
        if (brand?.logo_url) {
            try {
                finalUrl = await compositeProductAndLogo({
                    sceneImage: generatedImageUrl,
                    productImageBase64: null, // Scene is fully generated by AI (no crude square paste!)
                    logoUrlOrBase64: brand.logo_url,
                    brandName: brand.name,
                    primaryColor: brand.primary_color
                });
            } catch (compErr) {
                console.warn('[Studio Pro API] Watermark composite warning:', compErr);
            }
        }

        return NextResponse.json({
            success: true,
            final_composition: finalUrl,
            original_extracted: image_base64 || '',
            prompt_used: enhancedPrompt
        });

    } catch (error: any) {
        console.error("Studio API Error:", error);
        return NextResponse.json({ error: error.message || 'Error en Inpainting Studio' }, { status: 500 });
    }
}
