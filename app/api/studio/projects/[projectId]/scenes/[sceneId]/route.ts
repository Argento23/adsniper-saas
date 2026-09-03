import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSceneStore, UpdateScenePatch } from '@/lib/projects/scenes';
import { requireScene } from '@/lib/projects/access';

export const dynamic = 'force-dynamic';

interface RouteContext {
    params: { projectId: string; sceneId: string };
}

export async function GET(_request: Request, { params }: RouteContext) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

        const access = requireScene(userId, params.projectId, params.sceneId);
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

        return NextResponse.json({ scene: access.value.scene });
    } catch {
        return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
}

export async function PATCH(request: Request, { params }: RouteContext) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

        const access = requireScene(userId, params.projectId, params.sceneId);
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

        let body: Record<string, unknown>;
        try {
            body = (await request.json()) as Record<string, unknown>;
        } catch {
            return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
        }

        const patch: UpdateScenePatch = {};
        const allowedStrings = ['title', 'description', 'prompt', 'visualPrompt', 'negativePrompt', 'camera', 'voiceover', 'onScreenText', 'aspectRatio', 'transitionIn'];
        for (const k of allowedStrings) {
            if (typeof body[k] === 'string') (patch as Record<string, unknown>)[k] = body[k];
        }
        if (typeof body.durationSec === 'number' && body.durationSec >= 1 && body.durationSec <= 60) {
            patch.durationSec = Math.floor(body.durationSec);
        }
        if (typeof body.order === 'number') {
            patch.order = Math.floor(body.order);
        }
        if (typeof body.videoProviderId === 'string') {
            patch.videoProviderId = body.videoProviderId as 'wan' | 'kling' | 'veo';
        }
        if (typeof body.keyframeAssetId === 'string') patch.keyframeAssetId = body.keyframeAssetId;
        if (typeof body.videoAssetId === 'string') patch.videoAssetId = body.videoAssetId;
        if (typeof body.metadata === 'object' && body.metadata !== null) {
            patch.metadata = body.metadata as Record<string, unknown>;
        }
        if (typeof body.status === 'string') {
            patch.status = body.status as UpdateScenePatch['status'];
        }

        const updated = getSceneStore().updateScene(params.projectId, params.sceneId, patch);
        if (!updated) return NextResponse.json({ error: 'update failed' }, { status: 500 });
        return NextResponse.json({ scene: updated });
    } catch {
        return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

        const access = requireScene(userId, params.projectId, params.sceneId);
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

        const ok = getSceneStore().deleteScene(params.projectId, params.sceneId);
        if (!ok) return NextResponse.json({ error: 'delete failed' }, { status: 500 });
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
}
