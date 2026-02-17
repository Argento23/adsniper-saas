import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { generateReplicateVideo } from '@/lib/replicate';

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

        const client = await clerkClient();
        const user = await client.users.getUser(userId);
        const plan = (user.publicMetadata as any).plan || 'free';

        // Restriction: Video only for Pro and Enterprise (or Admin)
        const isAdmin = user.emailAddresses.some(e => e.emailAddress === 'gustavodornhofer@gmail.com');
        if (plan !== 'pro' && plan !== 'enterprise' && !isAdmin) {
            return NextResponse.json({
                error: 'PLAN_RESTRICTION',
                message: 'La generación de video requiere un plan Pro o superior.'
            }, { status: 403 });
        }

        console.log(`🎬 API: Generating video for user ${userId} from image: ${imageUrl.substring(0, 50)}...`);

        const videoUrl = await generateReplicateVideo(imageUrl);

        return NextResponse.json({ videoUrl });

    } catch (error: any) {
        console.error('Video Generation API Error:', error);
        return NextResponse.json({ error: error.message || 'Error interno al generar video' }, { status: 500 });
    }
}

