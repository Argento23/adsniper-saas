import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getClerkUser, updateClerkMetadata } from '@/lib/clerkHelper';
import { generateReplicateVideo } from '@/lib/replicate';
import { generateFalKlingVideo } from '@/lib/fal';
import { compositeStudioPro } from '@/lib/composer';
import sharp from 'sharp';

export const dynamic = 'force-dynamic';

const VIDEO_LIMIT_MAX = 4;

// Video limits per plan (monthly)
const VIDEO_LIMITS: Record<string, number> = {
    free: 0,
    basic: 2,
    pro: 5,
    enterprise: 10,
    lifetime: 10
};

const ADMIN_EMAIL = 'gustavodornhofer@gmail.com';

export async function POST(request: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { imageUrl, prompt, brand } = body;

        if (!imageUrl) {
            return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
        }

        const user = await getClerkUser(userId);
        const metadata = (user?.publicMetadata as any) || {};
        const plan = metadata.plan || 'free';

        // Admin bypass
        const emails = user?.emailAddresses?.map((e: any) => e.emailAddress.toLowerCase().trim()) || [];
        const isAdmin = emails.includes(ADMIN_EMAIL) || plan === 'Infinity';

        // Get video limit for plan
        const videoLimit = VIDEO_LIMITS[plan] || 0;

        // Check monthly video reset
        const now = new Date();
        const lastVideoReset = metadata.lastVideoResetDate
            ? new Date(metadata.lastVideoResetDate)
            : new Date(0);
        const shouldReset = now.getMonth() !== lastVideoReset.getMonth() ||
            now.getFullYear() !== lastVideoReset.getFullYear();

        const videosUsed = shouldReset ? 0 : (metadata.videosUsedThisMonth || 0);
        const videosRemaining = Math.max(0, videoLimit - videosUsed);

        // Check limit (admin bypasses)
        if (!isAdmin && videosRemaining <= 0) {
            return NextResponse.json({
                error: 'VIDEO_LIMIT',
                message: videoLimit === 0
                    ? 'La generación de video requiere un plan Pro o superior.'
                    : `Has alcanzado tu límite de ${videoLimit} videos este mes. Se reinicia el próximo mes.`,
                videosUsed,
                videoLimit,
                videosRemaining: 0,
                plan
            }, { status: 403 });
        }

        console.log(`🎬 API: Generating video for user ${userId} (${plan} plan, admin: ${isAdmin})`);

        // 1. Optionally enrich the input frame with the user's brand before sending it to the video model.
        //    This guarantees the resulting video carries the user's branding throughout every frame.
        let brandedImageUrl = imageUrl;
        if (brand && (brand.logo_url || brand.name || brand.primary_color)) {
            try {
                console.log('🎨 [Video] Compositing brand onto input frame...');
                const composed = await compositeStudioPro({
                    sceneImage: imageUrl,
                    logoUrlOrBase64: brand.logo_url || null,
                    brandName: brand.name,
                    primaryColor: brand.primary_color || '#10b981',
                    headlineText: prompt || null,
                    ctaText: 'Pedí el tuyo por WhatsApp',
                    applyLogo: true,
                    applyText: true,
                    vignette: true,
                    grain: false
                });
                brandedImageUrl = composed;
                console.log('✅ [Video] Brand overlay applied to input frame');
            } catch (compErr) {
                console.warn('⚠️ [Video] Brand overlay failed, using original frame:', (compErr as Error).message);
            }
        }

        // 2. Try Replicate Wan 2.5 first, then Fal.ai Kling as a fallback (premium-quality models).
        let videoUrl: string;
        try {
            videoUrl = await generateReplicateVideo(brandedImageUrl, prompt || "Smooth cinematic motion, professional product showcase, subtle camera movement, high quality 4K");
        } catch (repErr: any) {
            console.warn(`⚠️ Replicate Wan 2.5 failed, falling back to Fal Kling: ${repErr.message}`);
            try {
                videoUrl = await generateFalKlingVideo(brandedImageUrl, prompt || "Smooth cinematic motion, professional product showcase, subtle camera movement, high quality 4K", "1:1");
            } catch (klingErr: any) {
                throw new Error(`Video generation failed (Replicate + Kling): ${repErr.message} / ${klingErr.message}`);
            }
        }

        // Track usage (admin skips tracking)
        if (!isAdmin) {
            await updateClerkMetadata(userId, {
                publicMetadata: {
                    ...metadata,
                    videosUsedThisMonth: videosUsed + 1,
                    lastVideoResetDate: shouldReset ? now.toISOString() : metadata.lastVideoResetDate || now.toISOString(),
                    totalVideosGenerated: (metadata.totalVideosGenerated || 0) + 1
                }
            });
        }

        const newRemaining = isAdmin ? 9999 : videosRemaining - 1;

        return NextResponse.json({
            videoUrl,
            videosRemaining: newRemaining,
            videoLimit
        });

    } catch (error: any) {
        console.error('Video Generation API Error:', error);
        return NextResponse.json({ error: error.message || 'Error interno al generar video' }, { status: 500 });
    }
}

