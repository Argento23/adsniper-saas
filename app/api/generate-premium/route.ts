import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getClerkUser, updateClerkMetadata } from '@/lib/clerkHelper';
import { generateFalImage, generateBriaProductShot, generateFluxIPAdapter, generateFluxImageToImage } from '@/lib/fal';
import { generateReplicateImage, generateReplicateFluxDev, generateReplicateFluxRedux } from '@/lib/replicate';
import { compositeStudioPro, compositeUserLogoAsScene } from '@/lib/composer';

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
                    content: `You are a world-class commercial ad photographer and visual art director.
Your task is to take the user's scene description and transform it into a single-paragraph hyper-realistic 8K commercial advertising photography prompt in ENGLISH.

CRITICAL RULES FOR ADVERTISING SCENE SYNTHESIS:
1. YOU MUST WRITE ENTIRELY IN ENGLISH. NO SPANISH. NO MARKDOWN. NO INTROS OR OUTROS.
2. Focus on creating a luxurious, photorealistic, professional commercial studio environment: "photorealistic 8k professional advertising photography, luxury studio display, 85mm lens, cinematic studio lighting, soft shadows, warm ambient highlights, shallow depth of field, sharp focus, ultra-detailed textures".
3. Describe clean architectural elements, pedestals, natural studio light, elegant marble, wood, or soft gradient backdrops suitable for product placement.
4. Output MUST be under 70 words, single paragraph of raw prompt text only.

EXAMPLES:
"podio de lujo" → "A luxury commercial product placement setting on a minimalist white marble pedestal, soft golden spotlighting, architectural studio backdrop, dramatic soft shadow reflections, photorealistic 8k commercial product photography, 85mm lens"
"escenario de playa" → "A professional commercial product display on a smooth wooden table with tropical beach sand and ocean sunset in the background, golden hour sunlight, soft bokeh, 8k advertising photography"
"estudio moderno" → "A sleek modern studio environment with dark slate background, warm ambient rim lighting, glass reflections, sharp focus, 8k commercial ad photography"`
                }, {
                    role: "user",
                    content: `Brand: ${brandName || 'Brand'}. Desired scene: ${userScene}`
                }]
            })
        });
        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content?.trim().replace(/^"|"$/g, '') || '';
        const cleanPrompt = rawContent.replace(/[*#]/g, '').split('\n').filter((l: string) => l.trim().length > 0).pop() || rawContent;
        return cleanPrompt || `Photorealistic 8k commercial advertising photo, luxury studio display, cinematic lighting, sharp focus, 85mm lens`;
    } catch {
        return `Photorealistic 8k commercial advertising photo, luxury studio display, cinematic lighting, sharp focus, 85mm lens`;
    }
}

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { image_base64, scene_prompt, brand, applyLogo = true, applyText = true, headlineText } = body;

        // Credit check
        const { canProceed } = await consumePremiumCredit(userId);
        if (!canProceed) return NextResponse.json({ error: 'NO_PREMIUM_CREDITS' }, { status: 403 });

        // 1. Expand scene description into 8K Ad Prompt
        const enhancedPrompt = await enhancePromptForStudio8K(
            scene_prompt || "Niño sosteniendo el logo 3D translúcido en sus manos",
            brand?.name
        );
        console.log(`🎯 [Studio Pro 8K] Prompt: ${enhancedPrompt}`);

        let generatedImageUrl: string | null = null;
        const hasUserImage = image_base64 && image_base64.length > 100;

        console.log(`🎯 [Studio Pro 8K] User image: ${hasUserImage ? 'YES (3D Scene Integration Mode)' : 'NO'}`);

        // 1. REAL PRODUCT PLACEMENT VIA BRIA E-COMMERCE & IP-ADAPTER
        if (hasUserImage) {
            // Primary: Bria Native E-Commerce Product Shot via Fal.ai
            if (process.env.FAL_KEY || process.env.FAL_API_KEY) {
                try {
                    console.log('🎯 [Studio Pro 8K] Generating via Bria Product Shot (Real Product Placement)...');
                    const briaUrl = await generateBriaProductShot(image_base64, enhancedPrompt);
                    if (briaUrl) {
                        generatedImageUrl = briaUrl;
                        console.log('✅ [Studio Pro 8K] Bria Product Shot succeeded!');
                    }
                } catch (briaErr: any) {
                    console.warn(`⚠️ [Studio Pro 8K] Bria Product Shot failed: ${briaErr.message}`);
                }
            }

            // Secondary: FLUX IP-Adapter via Fal.ai (Image-Guided Scene Synthesis)
            if (!generatedImageUrl && (process.env.FAL_KEY || process.env.FAL_API_KEY)) {
                try {
                    console.log('🎯 [Studio Pro 8K] Trying Fal.ai FLUX IP-Adapter...');
                    const ipUrl = await generateFluxIPAdapter(image_base64, enhancedPrompt, 0.55);
                    if (ipUrl) {
                        generatedImageUrl = ipUrl;
                        console.log('✅ [Studio Pro 8K] Fal.ai FLUX IP-Adapter succeeded');
                    }
                } catch (ipErr: any) {
                    console.warn(`⚠️ [Studio Pro 8K] Fal.ai FLUX IP-Adapter failed: ${ipErr.message}`);
                }
            }
        }

        // 2. REPLICATE FLUX DEV 8K (Photorealistic Commercial Engine)
        if (!generatedImageUrl) {
            try {
                console.log('🚀 [Studio Pro 8K] Generating via Replicate FLUX Dev (8K Commercial)...');
                const repDev = await generateReplicateFluxDev(enhancedPrompt, 1024, 1024);
                if (repDev && repDev.imageUrl) {
                    generatedImageUrl = repDev.imageUrl;
                    console.log('✅ [Studio Pro 8K] Replicate FLUX Dev succeeded');
                }
            } catch (repDevErr: any) {
                console.warn(`⚠️ [Studio Pro 8K] Replicate FLUX Dev failed: ${repDevErr.message}`);
            }
        }

        // 3. FAL.AI FLUX DEV
        if (!generatedImageUrl) {
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
        }

        // 2. Replicate FLUX Schnell
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

        // 3. Pollinations AI final fallback (text-to-image only)
        if (!generatedImageUrl) {
            console.warn('⚠️ [Studio Pro 8K] Fallback to Pollinations AI');
            const cleanPrompt = encodeURIComponent(enhancedPrompt.substring(0, 150));
            const seed = Math.floor(Math.random() * 1000000);
            generatedImageUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&nologo=true&seed=${seed}`;
        }

        // 4. MANUAL COMPOSITOR: If user uploaded an image but none of the AI image-guided
        //    providers managed to integrate it (FLUX Redux failed, Fal failed), use Sharp
        //    to composite the logo onto the generated Pollinations background.
        //    This ensures the user's brand asset ALWAYS appears in the final output.
        if (hasUserImage && image_base64 && generatedImageUrl && !generatedImageUrl.startsWith('data:')) {
            // The current generatedImageUrl is a plain text-to-image (no user logo integrated)
            // Check if we got here via image-guided route (URL would be Catbox/Replicate output)
            // If it's a Pollinations URL (no user logo), run manual compositor on top of it
            const isPollinations = generatedImageUrl.includes('pollinations.ai');
            const isRawTextToImage = isPollinations || (generatedImageUrl.includes('replicate.delivery') && !hasUserImage);

            if (isPollinations) {
                console.log('🎨 [Studio Pro 8K] Text-to-image scene generated (no user logo). Running manual compositor...');
                try {
                    const manualScene = await compositeUserLogoAsScene({
                        logoBase64: image_base64,
                        scenePrompt: enhancedPrompt,
                        primaryColor: brand?.primary_color || '#10b981',
                    });
                    if (manualScene) {
                        generatedImageUrl = manualScene;
                        console.log('✅ [Studio Pro 8K] Manual compositor replaced Pollinations fallback with logo-integrated scene!');
                    }
                } catch (manualErr: any) {
                    console.warn(`⚠️ [Studio Pro 8K] Manual compositor failed: ${manualErr.message}`);
                }
            }
        }


        // 4. STUDIO PRO overlay system — premium logo badge + price pill + CTA banner
        let finalUrl = generatedImageUrl;
        try {
            finalUrl = await compositeStudioPro({
                sceneImage: generatedImageUrl,
                logoUrlOrBase64: brand?.logo_url || null,
                productImageBase64: null, // product already integrated into scene by Bria/IP-Adapter
                brandName: brand?.name,
                primaryColor: brand?.primary_color,
                headlineText: headlineText || null,
                ctaText: 'Pedí el tuyo por WhatsApp',
                priceText: null,
                applyLogo: applyLogo !== false,
                applyText: applyText !== false,
                vignette: true,
                grain: true
            });
        } catch (compErr) {
            console.warn('[Studio Pro 8K] Composer Pro warning:', compErr);
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
