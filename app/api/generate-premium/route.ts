import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

// 1. DEDUCT PREMIUM CREDIT LOGIC
async function consumePremiumCredit(userId: string) {
    const user = await clerkClient.users.getUser(userId);
    const meta = user.publicMetadata as any;

    // Si es Lifetime (Admin), pasa gratis
    if (meta.plan === 'lifetime') return true;

    // Verificar si tiene créditos pro
    let premiumCredits = meta.premiumStudioCredits !== undefined ? Number(meta.premiumStudioCredits) : 0;

    // Si no tiene, bloquear rechazo
    if (premiumCredits <= 0) {
        return false;
    }

    // Descontar
    await clerkClient.users.updateUserMetadata(userId, {
        publicMetadata: {
            ...meta,
            premiumStudioCredits: premiumCredits - 1
        }
    });

    return true;
}

// 2. REPLICATE BACKGROUND REMOVAL (Step 1)
async function removeBackground(base64Image: string): Promise<string | null> {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) throw new Error("Missing Replicate Token");

    try {
        const response = await fetch("https://api.replicate.com/v1/models/cjwbw/rembg/predictions", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ input: { image: base64Image } })
        });

        let prediction = await response.json();
        const getUrl = prediction.urls.get;

        let attempts = 0;
        while (prediction.status !== "succeeded" && prediction.status !== "failed" && attempts < 20) {
            await new Promise(r => setTimeout(r, 2000));
            attempts++;
            const poll = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
            prediction = await poll.json();
        }

        if (prediction.status === "succeeded") return prediction.output;
        return null;
    } catch (e) {
        console.error("BG Removal Failed", e);
        return null;
    }
}

// 3. REPLICATE INPAINTING (Step 2)
async function generateProductEnvironment(transparentImageUrl: string, prompt: string): Promise<string | null> {
    const token = process.env.REPLICATE_API_TOKEN;

    try {
        // Using an established model for outpainting/background generation
        // Alternatively we can use 'tencent/background-replacement' which handles both steps natively
        // Since we want standard Inpainting, let's use a specialized model for Product Backgrounds.

        const response = await fetch("https://api.replicate.com/v1/models/logerzhu/ad-inpaint/predictions", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                input: {
                    image_path: transparentImageUrl,
                    prompt: prompt + ", professional studio lighting, 8k resolution, photorealistic",
                    negative_prompt: "bad quality, blurry, distorted product",
                    image_num: 1,
                    product_size: "0.5"
                }
            })
        });

        let prediction = await response.json();
        // If the model is not public or requires a specific version, this will fail.
        // Let's use a more robust generic model if needed, but we'll try ad-inpaint first.
        const getUrl = prediction.urls?.get;
        if (!getUrl) return null;

        let attempts = 0;
        while (prediction.status !== "succeeded" && prediction.status !== "failed" && attempts < 25) {
            await new Promise(r => setTimeout(r, 2000));
            attempts++;
            const poll = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
            prediction = await poll.json();
        }

        if (prediction.status === "succeeded") {
            // output is usually an array of URLs or a single URL depending on model
            return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
        }
        console.error("Inpainting Failed", prediction);
        return null;
    } catch (e) {
        console.error("Inpainting API Failed", e);
        return null;
    }
}

// GROQ LLM FOR PROMPT ENHANCEMENT
async function enhancePrompt(userScene: string) {
    const apiKey = process.env.GROQ_API_KEY;
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{
                    role: "system",
                    content: "You are an expert AI photographer. The user will give you a basic scene for a product. You must describe a highly detailed, photorealistic 8k environment for the product to be placed in. English only. Max 30 words. No intro."
                }, {
                    role: "user",
                    content: userScene
                }]
            })
        });
        const data = await response.json();
        return data.choices[0].message.content.trim();
    } catch (e) {
        return userScene + " breathtaking 8k render, professional photography";
    }
}

export async function POST(req: Request) {
    try {
        const { userId } = auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { image_base64, scene_prompt } = body;

        if (!image_base64) return NextResponse.json({ error: 'Falta la imagen base' }, { status: 400 });

        // 1. Verify and Consume Credit
        const canProceed = await consumePremiumCredit(userId);
        if (!canProceed) {
            return NextResponse.json({ error: 'NO_PREMIUM_CREDITS' }, { status: 403 });
        }

        // 2. Enhance the Prompt via Llama 3
        const enhancedPrompt = await enhancePrompt(scene_prompt || "Studio white pedestal");

        // 3. Remove Background
        const noBgUrl = await removeBackground(image_base64);
        if (!noBgUrl) {
            // Refund credit if processing fails
            const user = await clerkClient.users.getUser(userId);
            const meta = user.publicMetadata as any;
            await clerkClient.users.updateUserMetadata(userId, {
                publicMetadata: { ...meta, premiumStudioCredits: (meta.premiumStudioCredits || 0) + 1 }
            });
            return NextResponse.json({ error: 'Fallo al remover fondo' }, { status: 500 });
        }

        // 4. Inpaint the Product
        const finalImage = await generateProductEnvironment(noBgUrl, enhancedPrompt);
        if (!finalImage) {
            return NextResponse.json({ error: 'Fallo al componer el escenario' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            original_extracted: noBgUrl,
            final_composition: finalImage,
            prompt_used: enhancedPrompt
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
