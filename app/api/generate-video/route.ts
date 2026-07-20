import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { generateReplicateVideo } from '@/lib/replicate';
import { consumeCredits } from '@/lib/credits';

export const dynamic = 'force-dynamic';

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

        // Call unified credit system with a cost of 50 credits for standard video
        const check = await consumeCredits(userId, 50, 'video');
        
        if (!check.canProceed) {
            return NextResponse.json({
                error: 'VIDEO_LIMIT',
                message: check.reason || 'La generación de video requiere un plan Premium (Studio Pro o superior).'
            }, { status: 403 });
        }

        console.log(`🎬 API: Generating video for user ${userId} (Remaining credits: ${check.remaining})`);

        const videoUrl = await generateReplicateVideo(imageUrl);

        return NextResponse.json({
            videoUrl,
            videosRemaining: Math.floor(check.remaining / 50)
        });

    } catch (error: any) {
        console.error('Video Generation API Error:', error);
        return NextResponse.json({ error: error.message || 'Error interno al generar video' }, { status: 500 });
    }
}

