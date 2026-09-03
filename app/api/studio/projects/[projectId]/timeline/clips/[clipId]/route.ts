import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requireProject } from '@/lib/projects/access';
import { getTimelineStore } from '@/lib/projects/timeline-store';
import { getSceneStore } from '@/lib/projects/scenes';
import { TimelineClip, validateTimeline } from '@/lib/projects/timeline';

export const dynamic = 'force-dynamic';

interface RouteContext {
    params: { projectId: string; clipId: string };
}

interface RawClipPatch {
    sceneId?: unknown;
    start?: unknown;
    duration?: unknown;
    sourceUrl?: unknown;
    transition?: unknown;
    volume?: unknown;
    muted?: unknown;
    metadata?: unknown;
}

export async function PATCH(request: Request, { params }: RouteContext) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

        const access = requireProject(userId, params.projectId);
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

        let body: RawClipPatch;
        try {
            body = (await request.json()) as RawClipPatch;
        } catch {
            return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
        }

        const patch: Partial<TimelineClip> = {};
        if (body.sceneId !== undefined) {
            if (typeof body.sceneId !== 'string' || body.sceneId.trim().length === 0) {
                return NextResponse.json({ error: 'sceneId must be a non-empty string' }, { status: 400 });
            }
            if (!getSceneStore().getScene(params.projectId, body.sceneId)) {
                return NextResponse.json({ error: 'sceneId does not exist in this project' }, { status: 400 });
            }
            patch.sceneId = body.sceneId;
        }
        if (body.start !== undefined) {
            if (typeof body.start !== 'number' || body.start < 0) {
                return NextResponse.json({ error: 'start must be a non-negative number' }, { status: 400 });
            }
            patch.start = body.start;
        }
        if (body.duration !== undefined) {
            if (typeof body.duration !== 'number' || body.duration <= 0) {
                return NextResponse.json({ error: 'duration must be a positive number' }, { status: 400 });
            }
            patch.duration = body.duration;
        }
        if (body.sourceUrl !== undefined) {
            if (typeof body.sourceUrl !== 'string') {
                return NextResponse.json({ error: 'sourceUrl must be a string' }, { status: 400 });
            }
            patch.sourceUrl = body.sourceUrl;
        }
        if (body.transition !== undefined) {
            if (body.transition !== 'cut' && body.transition !== 'fade' && body.transition !== 'dissolve') {
                return NextResponse.json({ error: 'transition must be cut | fade | dissolve' }, { status: 400 });
            }
            patch.transition = body.transition;
        }
        if (body.volume !== undefined) {
            if (typeof body.volume !== 'number' || body.volume < 0 || body.volume > 1) {
                return NextResponse.json({ error: 'volume must be a number in [0, 1]' }, { status: 400 });
            }
            patch.volume = body.volume;
        }
        if (body.muted !== undefined) {
            if (typeof body.muted !== 'boolean') {
                return NextResponse.json({ error: 'muted must be a boolean' }, { status: 400 });
            }
            patch.muted = body.muted;
        }
        if (body.metadata !== undefined) {
            if (typeof body.metadata !== 'object' || body.metadata === null) {
                return NextResponse.json({ error: 'metadata must be an object' }, { status: 400 });
            }
            patch.metadata = body.metadata as Record<string, unknown>;
        }

        const store = getTimelineStore();
        const updated = store.updateClip(params.projectId, params.clipId, patch);
        if (!updated) {
            return NextResponse.json({ error: 'clip not found' }, { status: 404 });
        }

        const v = validateTimeline(updated);
        if (!v.ok) {
            return NextResponse.json({ error: v.errors.map(e => e.message).join('; ') }, { status: 400 });
        }
        return NextResponse.json({ clip: updated.clips.find(c => c.id === params.clipId), timeline: updated });
    } catch {
        return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

        const access = requireProject(userId, params.projectId);
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

        const store = getTimelineStore();
        const updated = store.deleteClip(params.projectId, params.clipId);
        if (!updated) {
            return NextResponse.json({ error: 'clip not found' }, { status: 404 });
        }
        return NextResponse.json({ timeline: updated });
    } catch {
        return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
}
