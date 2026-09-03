import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSceneStore } from '@/lib/projects/scenes';
import { requireScene } from '@/lib/projects/access';
import { buildVisualContext } from '@/lib/projects/visualContext';
import { generateKeyframe } from '@/lib/providers/image/engine';
import { newProjectId } from '@/lib/projects/id';

export const dynamic = 'force-dynamic';

interface RouteContext {
    params: { projectId: string; sceneId: string };
}

export async function POST(request: Request, { params }: RouteContext) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

        const access = requireScene(userId, params.projectId, params.sceneId);
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

        let body: Record<string, unknown> = {};
        try {
            const ct = request.headers.get('content-type') ?? '';
            if (ct.includes('application/json')) body = (await request.json()) as Record<string, unknown>;
        } catch {
            /* empty body is OK */
        }

        const { project, scene } = access.value;
        const ctx = buildVisualContext(project);
        const extraStyle = ctx.visualStyle ? `, ${ctx.visualStyle}` : '';
        const brand = ctx.brandSnapshot?.name ? `, ${ctx.brandSnapshot.name} brand` : '';
        const fullPrompt = `${scene.visualPrompt}${extraStyle}${brand}`;

        const requestedRatio = (body.aspectRatio as string | undefined) ?? scene.aspectRatio ?? project.format;
        const dims = dimensionsFor(requestedRatio);

        getSceneStore().updateScene(params.projectId, params.sceneId, {
            status: 'generating_keyframe',
            timestamps: { keyframeRequestedAt: new Date().toISOString() },
        });

        const result = await generateKeyframe({
            prompt: fullPrompt,
            width: dims.width,
            height: dims.height,
            negativePrompt: scene.negativePrompt,
            referenceImageUrl: undefined,
        });

        if (!result.output) {
            getSceneStore().updateScene(params.projectId, params.sceneId, {
                status: 'failed',
            });
            return NextResponse.json(
                {
                    success: false,
                    error: 'all image providers failed',
                    attempts: result.attempts,
                },
                { status: 502 },
            );
        }

        const assetId = `asset_${newProjectId()}`;
        getSceneStore().updateScene(params.projectId, params.sceneId, {
            status: 'keyframe_ready',
            keyframeAssetId: assetId,
            timestamps: { keyframeReadyAt: new Date().toISOString() },
        });

        return NextResponse.json({
            success: true,
            keyframe: {
                assetId,
                url: result.output.imageUrl,
                providerId: result.providerId,
                prompt: fullPrompt,
            },
            attempts: result.attempts,
        });
    } catch {
        return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
}

function dimensionsFor(ratio: string | undefined): { width: number; height: number } {
    if (ratio === '9:16') return { width: 768, height: 1360 };
    if (ratio === '16:9') return { width: 1360, height: 768 };
    if (ratio === '4:5') return { width: 1024, height: 1280 };
    return { width: 1024, height: 1024 };
}
