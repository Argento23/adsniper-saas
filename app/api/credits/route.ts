import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { peekCredits } from '@/lib/credits';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const check = await peekCredits(userId);

        return NextResponse.json({
            credits: check.remaining,
            plan: check.plan === 'agency' ? 'Infinity' : check.plan,
            limit: check.limit,
            remaining: check.remaining,
            resetDate: check.resetDate,
            isAdmin: check.remaining === 999 // hack: peekCredits returns 999 for admin
        });

    } catch (error: any) {
        console.error('Credits API Error:', error);
        return NextResponse.json({ error: 'Error fetching credits', details: error.message }, { status: 500 });
    }
}
