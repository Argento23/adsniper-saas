import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { generateReplicateVideo } from '@/lib/replicate';

export const dynamic = 'force-dynamic';

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
        const { imageUrl } = body;

        if (!imageUrl) {
            return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
        }

        // Clerk v5: clerkClient must be called as a function
        const clerk = await clerkClient();
        const user = await clerk.users.getUser(userId);
        const metadata = user.publicMetadata as any;
        const plan = metadata.plan || 'free';

        // Admin bypass
        const isAdmin = user.emailAddresses.some(e => e.emailAddress.toLowerCase().trim() === ADMIN_EMAIL);

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

        const videoUrl = await generateReplicateVideo(imageUrl);

        // Track usage (admin skips tracking)
        if (!isAdmin) {
            await clerk.users.updateUserMetadata(userId, {
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

