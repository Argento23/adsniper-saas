import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requireProject } from '@/lib/projects/access';
import { getTimelineStore } from '@/lib/projects/timeline-store';
import { getSceneStore } from '@/lib/projects/scenes';
import { TimelineClip, validateTimeline } from '@/lib/projects/timeline';

export const dynamic = 'force-dynamic';

interface RouteContext {
    params: { projectId: string };
}

interface RawClipBody {
    id?: unknown;
    sceneId?: unknown;
    start?: unknown;
    duration?: unknown;
    sourceUrl?: unknown;
    transition?: unknown;
    volume?: unknown;
    muted?: unknown;
    metadata?: unknown;
}

function sanitizeClip(raw: RawClipBody): { ok: true; value: TimelineClip } | { ok: false; error: string } {
    if (typeof raw.sceneId !== 'string' || raw.sceneId.trim().length === 0) {
        return { ok: false, error: 'sceneId is required' };
    }
    if (typeof raw.start !== 'number' || !Number.isFinite(raw.start) || raw.start < 0) {
        return { ok: false, error: 'start must be a non-negative number' };
    }
    if (typeof raw.duration !== 'number' || !Number.isFinite(raw.duration) || raw.duration <= 0) {
        return { ok: false, error: 'duration must be a positive number' };
    }
    const transition = raw.transition;
    if (transition !== undefined && transition !== 'cut' && transition !== 'fade' && transition !== 'dissolve') {
        return { ok: false, error: 'transition must be cut | fade | dissolve' };
    }
    const volume = raw.volume;
    if (volume !== undefined && (typeof volume !== 'number' || volume < 0 || volume > 1)) {
        return { ok: false, error: 'volume must be a number in [0, 1]' };
    }
    const muted = raw.muted;
    if (muted !== undefined && typeof muted !== 'boolean') {
        return { ok: false, error: 'muted must be a boolean' };
    }

    const clip: TimelineClip = {
        id: typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : `clip_${Math.random().toString(36).slice(2, 10)}`,
        sceneId: raw.sceneId,
        start: raw.start,
        duration: raw.duration,
    };
    if (typeof raw.sourceUrl === 'string') clip.sourceUrl = raw.sourceUrl;
    if (typeof transition === 'string') clip.transition = transition as 'cut' | 'fade' | 'dissolve';
    if (typeof volume === 'number') clip.volume = volume;
    if (typeof muted === 'boolean') clip.muted = muted;
    if (raw.metadata && typeof raw.metadata === 'object') {
        clip.metadata = raw.metadata as Record<string, unknown>;
    }
    return { ok: true, value: clip };
}

export async function POST(request: Request, { params }: RouteContext) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

        const access = requireProject(userId, params.projectId);
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

        let body: RawClipBody;
        try {
            body = (await request.json()) as RawClipBody;
        } catch {
            return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
        }

        const r = sanitizeClip(body);
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });

        if (r.value.sceneId && !getSceneStore().getScene(params.projectId, r.value.sceneId)) {
            return NextResponse.json({ error: 'sceneId does not exist in this project' }, { status: 400 });
        }

        const store = getTimelineStore();
        const existing = store.getTimeline(params.projectId);
        if (!existing) {
            return NextResponse.json({ error: 'timeline not found (POST /timeline first)' }, { status: 404 });
        }

        const updated = store.addClip(params.projectId, r.value);
        if (!updated) return NextResponse.json({ error: 'add failed' }, { status: 500 });

        const v = validateTimeline(updated);
        if (!v.ok) {
            return NextResponse.json({ error: v.errors.map(e => e.message).join('; ') }, { status: 400 });
        }
        return NextResponse.json({ clip: r.value, timeline: updated }, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
}
