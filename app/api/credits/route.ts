import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

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

        const user = await clerkClient.users.getUser(userId);
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

        // Admin check (Robust email matching across all linked emails)
        const emails = user.emailAddresses.map(e => e.emailAddress.toLowerCase().trim());
        const adminEmail = 'gustavodornhofer@gmail.com';
        const isAdmin = emails.includes(adminEmail);

        console.log(`[Credits API] User Emails: ${emails.join(', ')} | Admin Target: ${adminEmail} | isAdmin: ${isAdmin}`);

        const premiumStudioCredits = typeof metadata.premiumStudioCredits === 'number' ? metadata.premiumStudioCredits : 0;

        return NextResponse.json({
            credits: isAdmin ? 9999 : credits,
            plan: isAdmin ? 'Infinity' : plan,
            videoLimit: isAdmin ? 9999 : videoLimit,
            videosUsed: isAdmin ? 0 : videosUsed,
            videosRemaining: isAdmin ? 9999 : videosRemaining,
            premiumStudioCredits: isAdmin ? 9999 : premiumStudioCredits,
            isAdmin
        });

    } catch (error: any) {
        console.error('Credits API Error:', error);
        return NextResponse.json({ error: 'Error fetching credits' }, { status: 500 });
    }
}
