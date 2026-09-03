import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSceneStore } from '@/lib/projects/scenes';
import { requireScene } from '@/lib/projects/access';
import { getJobQueue } from '@/lib/jobs/queue';
import { runChain } from '@/lib/providers/video/chain';
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

        const { project, scene } = access.value;

        // Keyframe is required for image-to-video. The Scene-level video
        // generation reuses the Video Provider Engine created in Phase 3
        // and the Job Queue from Phase 1.
        const keyframeUrl = (scene.keyframeAssetId && (request as unknown as { __keyframeUrl?: string }).__keyframeUrl) || undefined;
        // Note: the keyframe URL is recovered from the scene metadata in a
        // future iteration when assets live in a store. For now we rely
        // on the client sending `imageUrl` in the body.

        let body: { imageUrl?: unknown; prompt?: unknown; chain?: unknown } = {};
        try {
            const ct = request.headers.get('content-type') ?? '';
            if (ct.includes('application/json')) body = (await request.json()) as typeof body;
        } catch {
            /* empty */
        }

        const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : keyframeUrl;
        if (!imageUrl) {
            return NextResponse.json(
                { error: 'imageUrl required (generate the keyframe first or pass it explicitly)' },
                { status: 400 },
            );
        }

        const prompt = typeof body.prompt === 'string' && body.prompt.trim().length > 0
            ? body.prompt
            : scene.visualPrompt;

        getSceneStore().updateScene(params.projectId, params.sceneId, {
            status: 'generating_video',
            timestamps: { videoRequestedAt: new Date().toISOString() },
        });

        const result = await runChain(
            {
                prompt,
                imageUrl,
                aspectRatio: scene.aspectRatio ?? project.format,
                durationSec: scene.durationSec,
            },
        );

        if (!result.handle) {
            getSceneStore().updateScene(params.projectId, params.sceneId, { status: 'failed' });
            return NextResponse.json(
                {
                    success: false,
                    error: 'all video providers failed',
                    attempts: result.attempts.map(a => ({
                        providerId: a.providerId,
                        status: a.status,
                        errorKind: a.errorKind,
                        error: a.error,
                        durationMs: a.durationMs,
                    })),
                },
                { status: 502 },
            );
        }

        const job = getJobQueue().enqueue({
            userId,
            projectId: params.projectId,
            sceneId: params.sceneId,
            type: 'video',
            provider: result.handle.providerId,
            input: {
                prompt,
                imageUrl,
                aspectRatio: scene.aspectRatio ?? project.format,
                durationSec: scene.durationSec,
                externalJobId: result.handle.externalJobId,
            },
            estimatedCostUsd: result.handle.estimatedCostUsd,
        });

        // Provisional assetId binding — the real videoAssetId will be set
        // when the job completes (polled by /api/studio/jobs/[jobId]).
        const provisionalAssetId = `asset_${newProjectId()}`;
        getSceneStore().updateScene(params.projectId, params.sceneId, {
            videoAssetId: provisionalAssetId,
            videoProviderId: result.handle.providerId as 'wan' | 'kling' | 'veo',
        });

        return NextResponse.json({
            success: true,
            provider: result.handle.providerId,
            job: { id: job.id, status: job.status },
            externalJobId: result.handle.externalJobId,
            assetId: provisionalAssetId,
        });
    } catch {
        return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
}
