import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { generateFalKlingVideo } from '@/lib/fal';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'gustavodornhofer@gmail.com';

async function consumePremiumCredit(userId: string): Promise<{ canProceed: boolean; isAdmin: boolean; meta: any; clerk: any }> {
    const clerk = clerkClient;
    const user = await clerk.users.getUser(userId);
    const meta = user.publicMetadata as any;
    const emails = user.emailAddresses.map((e: any) => e.emailAddress.toLowerCase().trim());
    const isAdmin = emails.some(email => email === ADMIN_EMAIL.toLowerCase().trim());
    
    console.log(`[Premium Video API] User ID: ${userId}`);
    console.log(`[Premium Video API] Detected Emails: ${emails.join(', ')}`);
    console.log(`[Premium Video API] Admin Match: ${isAdmin}`);

    // ADMIN SHIELD: Skip credit deduction entirely for admin
    if (isAdmin) {
        console.log(`[Premium Video API] ADMIN SHIELD ACTIVE - No credits deducted`);
        return { canProceed: true, isAdmin, meta, clerk };
    }

    if (meta.plan === 'Infinity') return { canProceed: true, isAdmin, meta, clerk };

    const credits = meta.premiumStudioCredits !== undefined ? Number(meta.premiumStudioCredits) : 0;
    if (credits <= 0) return { canProceed: false, isAdmin, meta, clerk };

    await clerk.users.updateUserMetadata(userId, {
        publicMetadata: { ...meta, premiumStudioCredits: credits - 1 }
    });
    return { canProceed: true, isAdmin, meta, clerk };
}

async function enhanceVideoPrompt(userContext: string): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{
                    role: "system",
                    content: `You are a video motion director. The user has already created an image of a PROTAGONIST (product or person) in a scene. 
                    Your job is to describe ONLY natural, cinematic camera motion and subtle environmental movement. 
                    The PROTAGONIST must remain absolute and unchanged — just describe how the camera moves around it. 
                    Avoid introducing new elements or modifying the protagonist's anatomy. Max 35 words, English only.`
                }, {
                    role: "user",
                    content: userContext
                }]
            })
        });
        const data = await response.json();
        return data.choices[0].message.content.trim().replace(/^\"|\"$/g, '');
    } catch {
        return `${userContext}, smooth cinematic camera movement, fixed subject center, professional lighting, 8k ultra-realistic commercial`;
    }
}

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { imageUrl, prompt, aspectRatio = "1:1" } = body;

        if (!imageUrl) return NextResponse.json({ error: 'Falta la imagen del producto' }, { status: 400 });

        // Credit check (ADMIN BYPASS for v13 Rescue)
        const { canProceed, isAdmin, meta, clerk } = await consumePremiumCredit(userId);
        if (!canProceed && !isAdmin) return NextResponse.json({ error: 'NO_PREMIUM_CREDITS' }, { status: 403 });

        // Enhance prompt for video
        const enhancedPrompt = await enhanceVideoPrompt(prompt || "Product showcase, professional advertising video");

        console.log(`🎬 Premium Video: Generating for ${userId} with prompt: ${enhancedPrompt}`);

        // Generate Kling Video via Fal.ai
        let videoUrl: string;

        // ADMIN MOCK MODE: Bypass real API calls for testing
        if (isAdmin && process.env.ADMIN_MOCK_MODE === 'true') {
            console.log(`[Premium Video API v21] MOCK MODE ACTIVE - Returning placeholder video`);
            videoUrl = "https://cdn.pixabay.com/video/2016/10/11/5826-185790892_tiny.mp4"; // Generic high-end video placeholder
        } else {
            videoUrl = await generateFalKlingVideo(imageUrl, enhancedPrompt, aspectRatio as any);
        }

        return NextResponse.json({
            success: true,
            videoUrl,
            prompt_used: enhancedPrompt
        });

    } catch (error: any) {
        console.error("Premium Video API Error:", error);

        // Return 500 but try to be descriptive
        return NextResponse.json({
            error: error.message || 'Error al generar video premium'
        }, { status: 500 });
    }
}
