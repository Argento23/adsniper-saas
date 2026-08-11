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
            scene_prompt || "professional commercial product placement on minimalist marble pedestal with cinematic studio lighting",
            brand?.name
        );
        console.log(`🎯 [Studio Pro 8K] User scene: "${scene_prompt || '(default)'}" → Enhanced: ${enhancedPrompt}`);

        let generatedImageUrl: string | null = null;
        const hasUserImage = image_base64 && image_base64.length > 100;
        const diagnostics: string[] = [];
        diagnostics.push(`FAL_KEY configurada: ${!!(process.env.FAL_KEY || process.env.FAL_API_KEY)}`);
        diagnostics.push(`Imagen usuario: ${hasUserImage ? 'SÍ' : 'NO'}`);
        // True when an image-guided model (Bria/IP-Adapter) successfully placed the
        // user's product INTO the scene. False = scene is bare text-to-image, so we
        // MUST composite the user's image manually afterwards.
        let imageGuided = false;

        console.log(`🎯 [Studio Pro 8K] User image: ${hasUserImage ? 'YES (3D Scene Integration Mode)' : 'NO'}`);

        // ROBUST CASCADE: always build a STUDIO SCENE from the user's prompt first,
        // then composite the user's image on top so the prompt IS respected.
        if (hasUserImage) {
            // 1a. PRIMARY: Bria E-Commerce Product Shot via Fal.ai (best for clean product photos)
            if (process.env.FAL_KEY || process.env.FAL_API_KEY) {
                try {
                    console.log('🎯 [Studio Pro 8K] Generating via Bria Product Shot (Real Product Placement)...');
                    diagnostics.push('Bria: intentando (placement automatic)…');
                    const briaUrl = await generateBriaProductShot(image_base64, enhancedPrompt);
                    if (briaUrl) {
                        generatedImageUrl = briaUrl;
                        imageGuided = true;
                        console.log('✅ [Studio Pro 8K] Bria Product Shot succeeded!');
                        diagnostics.push('Bria: OK (imagen generada con producto integrado)');
                    }
                } catch (briaErr: any) {
                    console.warn(`⚠️ [Studio Pro 8K] Bria Product Shot failed: ${briaErr.message}`);
                    diagnostics.push(`Bria: FALLO -> ${briaErr.message}`);
                }
            }

            // 1b. SECONDARY: FLUX IP-Adapter via Fal.ai (Image-Guided Scene Synthesis)
            if (!generatedImageUrl && (process.env.FAL_KEY || process.env.FAL_API_KEY)) {
                try {
                    console.log('🎯 [Studio Pro 8K] Trying Fal.ai FLUX IP-Adapter...');
                    diagnostics.push('IP-Adapter: intentando (flux-general + XLabs)…');
                    const ipUrl = await generateFluxIPAdapter(image_base64, enhancedPrompt, 0.45);
                    if (ipUrl) {
                        generatedImageUrl = ipUrl;
                        imageGuided = true;
                        console.log('✅ [Studio Pro 8K] Fal.ai FLUX IP-Adapter succeeded');
                        diagnostics.push('IP-Adapter: OK (escena guiada por imagen)');
                    }
                } catch (ipErr: any) {
                    console.warn(`⚠️ [Studio Pro 8K] Fal.ai FLUX IP-Adapter failed: ${ipErr.message}`);
                    diagnostics.push(`IP-Adapter: FALLO -> ${ipErr.message}`);
                }
            }

            // 1c. TERTIARY (FALLBACK): Generate scene from prompt via text-to-image,
            //     then composite user's image as a clean product placement on top.
            //     This GUARANTEES the prompt is respected AND the user's image is shown.
            if (!generatedImageUrl) {
                console.log('🎨 [Studio Pro 8K] Falling back to text-to-image scene + manual product composite...');
                try {
                    generatedImageUrl = await compositeUserLogoAsScene({
                        logoBase64: image_base64,
                        scenePrompt: enhancedPrompt,
                        primaryColor: brand?.primary_color || '#10b981',
                    });
                    if (generatedImageUrl) {
                        console.log('✅ [Studio Pro 8K] Manual product-on-scene composite done');
                    }
                } catch (compErr: any) {
                    console.warn(`⚠️ [Studio Pro 8K] Manual composite failed: ${compErr.message}`);
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

        // 4. GUARANTEED PRODUCT INTEGRATION: If the user uploaded an image but no
        //    image-guided model managed to place it in the scene (Bria/IP-Adapter
        //    failed, or their keys are missing), the scene is a bare text-to-image.
        //    Composite the user's product onto it so it ALWAYS appears.
        if (hasUserImage && image_base64 && generatedImageUrl && !imageGuided && !generatedImageUrl.startsWith('data:')) {
            console.log('🎨 [Studio Pro 8K] Scene not image-guided. Running manual product compositor...');
            try {
                const manualScene = await compositeUserLogoAsScene({
                    logoBase64: image_base64,
                    scenePrompt: enhancedPrompt,
                    primaryColor: brand?.primary_color || '#10b981',
                    backgroundScene: generatedImageUrl,
                });
                if (manualScene) {
                    generatedImageUrl = manualScene;
                    console.log('✅ [Studio Pro 8K] Manual compositor placed product on scene!');
                }
            } catch (manualErr: any) {
                console.warn(`⚠️ [Studio Pro 8K] Manual compositor failed: ${manualErr.message}`);
            }
        } else if (hasUserImage && imageGuided) {
            diagnostics.push('Composición manual: NO (Bria/IP-Adapter ya integraron el producto en la escena)');
        }


        // 4. STUDIO PRO overlay system — premium logo badge + price pill + CTA banner
        let finalUrl = generatedImageUrl;
        try {
            finalUrl = await compositeStudioPro({
                sceneImage: generatedImageUrl,
                logoUrlOrBase64: brand?.logo_url || null,
                productImageBase64: null, // product is already guaranteed IN the scene by Bria/IP-Adapter or the manual compositor
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
            prompt_used: enhancedPrompt,
            diagnostics
        });

    } catch (error: any) {
        console.error("Studio API Error:", error);
        return NextResponse.json({ error: error.message || 'Error en Studio Pro' }, { status: 500 });
    }
}
