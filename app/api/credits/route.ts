import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

// Video limits per plan (monthly)
const VIDEO_LIMITS: Record<string, number> = {
    free: 0,
    basic: 2,
    pro: 5,
    enterprise: 10,
    lifetime: 10
};

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        const metadata = user.publicMetadata as any;

        // Simple credit system: starts at 3, deducted per generation
        const credits = typeof metadata.credits === 'number' ? metadata.credits : 3;
        const plan = metadata.plan || 'free';

        // Video tracking (monthly reset)
        const now = new Date();
        const lastVideoReset = metadata.lastVideoResetDate
            ? new Date(metadata.lastVideoResetDate)
            : new Date(0);
        const shouldResetVideos = now.getMonth() !== lastVideoReset.getMonth() ||
            now.getFullYear() !== lastVideoReset.getFullYear();

        const videoLimit = VIDEO_LIMITS[plan] || 0;
        const videosUsed = shouldResetVideos ? 0 : (metadata.videosUsedThisMonth || 0);
        const videosRemaining = Math.max(0, videoLimit - videosUsed);

        // Admin check
        const isAdmin = user.emailAddresses.some(e => e.emailAddress === 'gustavodornhofer@gmail.com');

        return NextResponse.json({
            credits: isAdmin ? 999 : credits,
            plan,
            videoLimit,
            videosUsed,
            videosRemaining: isAdmin ? 999 : videosRemaining,
            isAdmin
        });

    } catch (error: any) {
        console.error('Credits API Error:', error);
        return NextResponse.json({ error: 'Error fetching credits' }, { status: 500 });
    }
}
