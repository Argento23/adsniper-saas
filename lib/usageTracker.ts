import { clerkClient } from '@clerk/nextjs/server';

export interface UsageResult {
    canProceed: boolean;
    remaining: number;
    limit: number;
    resetDate: Date;
}

const ADMIN_EMAIL = 'gustavodornhofer@gmail.com';

export async function checkAndTrackUsage(
    userId: string,
    incrementBy: number = 1
): Promise<UsageResult> {
    const clerk = await clerkClient();
    const user = await clerk.users.getUser(userId);

    const metadata = user.publicMetadata as any;
    const plan = metadata.plan || 'free';
    const emails = user.emailAddresses.map(e => e.emailAddress.toLowerCase().trim());
    const isAdmin = emails.includes(ADMIN_EMAIL) || plan === 'Infinity';

    if (isAdmin) {
        console.log(`👑 UsageTracker: Admin bypass for ${ADMIN_EMAIL}`);
        return {
            canProceed: true,
            remaining: 9999,
            limit: 9999,
            resetDate: getNextMonthStart()
        };
    }

    const limit = getPlanLimit(plan);

    // Check if month changed
    const lastReset = metadata.lastResetDate
        ? new Date(metadata.lastResetDate)
        : new Date();
    const now = new Date();
    const shouldReset = now.getMonth() !== lastReset.getMonth() ||
        now.getFullYear() !== lastReset.getFullYear();

    let currentUsage = shouldReset ? 0 : (metadata.currentMonthUsage || 0);

    // Check limit
    if (currentUsage + incrementBy > limit) {
        return {
            canProceed: false,
            remaining: Math.max(0, limit - currentUsage),
            limit,
            resetDate: getNextMonthStart()
        };
    }

    // Update usage
    await clerk.users.updateUserMetadata(userId, {
        publicMetadata: {
            ...metadata,
            currentMonthUsage: currentUsage + incrementBy,
            lastResetDate: shouldReset ? now.toISOString() : metadata.lastResetDate,
            totalGenerations: (metadata.totalGenerations || 0) + incrementBy
        }
    });

    return {
        canProceed: true,
        remaining: limit - (currentUsage + incrementBy),
        limit,
        resetDate: getNextMonthStart()
    };
}

function getPlanLimit(plan: string): number {
    const limits: Record<string, number> = {
        free: parseInt(process.env.PLAN_FREE_LIMIT || '15'),
        basic: parseInt(process.env.PLAN_BASIC_LIMIT || '50'),
        pro: parseInt(process.env.PLAN_PRO_LIMIT || '200'),
        enterprise: parseInt(process.env.PLAN_ENTERPRISE_LIMIT || '500'),
        lifetime: 999
    };
    return limits[plan] || limits.free;
}

function getNextMonthStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}
