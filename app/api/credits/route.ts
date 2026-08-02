import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getClerkUser } from '@/lib/clerkHelper';

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

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await getClerkUser(userId);
        const metadata = (user?.publicMetadata as any) || {};

        // Admin check
        const emails = user?.emailAddresses?.map((e: any) => e.emailAddress.toLowerCase().trim()) || [];
        const isAdmin = emails.includes(ADMIN_EMAIL) || metadata.plan === 'Infinity';

        console.log(`[Credits API] Emails: ${emails.join(', ')} | isAdmin: ${isAdmin}`);

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
        return NextResponse.json({ error: 'Error fetching credits', details: error.message }, { status: 500 });
    }
}
