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

// Ad generation limits per plan (monthly) — matches usageTracker.ts
const AD_LIMITS: Record<string, number> = {
    free: 15,
    basic: 50,
    pro: 200,
    enterprise: 500,
    lifetime: 999
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

        const plan = metadata.plan || 'free';

        // Monthly ad usage tracking
        const now = new Date();
        const lastReset = metadata.lastResetDate ? new Date(metadata.lastResetDate) : new Date(0);
        const shouldResetAds = now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear();
        const adLimit = AD_LIMITS[plan] || 15;
        const adsUsed = shouldResetAds ? 0 : (metadata.currentMonthUsage || 0);
        const credits = Math.max(0, adLimit - adsUsed);

        // Video tracking
        const lastVideoReset = metadata.lastVideoResetDate ? new Date(metadata.lastVideoResetDate) : new Date(0);
        const shouldResetVideos = now.getMonth() !== lastVideoReset.getMonth() || now.getFullYear() !== lastVideoReset.getFullYear();
        const videoLimit = VIDEO_LIMITS[plan] || 0;
        const videosUsed = shouldResetVideos ? 0 : (metadata.videosUsedThisMonth || 0);
        const videosRemaining = Math.max(0, videoLimit - videosUsed);

        // Admin check
        const isAdmin = user.emailAddresses.some(e => e.emailAddress === 'gustavodornhofer@gmail.com');

        return NextResponse.json({
            credits: isAdmin ? 999 : credits,
            plan,
            adLimit,
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


