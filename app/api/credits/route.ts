import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const client = await clerkClient();
        const user = await client.users.getUser(userId);

        const credits = typeof user.publicMetadata.credits === 'number' ? user.publicMetadata.credits : 3;
        const plan = (user.publicMetadata as any).plan || 'free';

        return NextResponse.json({ credits, plan });

    } catch (error: any) {
        console.error('Credits API Error:', error);
        return NextResponse.json({ error: 'Error fetching credits' }, { status: 500 });
    }
}

