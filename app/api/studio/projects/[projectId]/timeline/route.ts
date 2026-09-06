import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { requireProject } from '@/lib/projects/access';
import { getTimelineStore } from '@/lib/projects/timeline-store';
import { getSceneStore } from '@/lib/projects/scenes';
import {
    Timeline,
    TimelineClip,
    validateTimeline,
} from '@/lib/projects/timeline';
import { AspectRatio } from '@/lib/projects/types';

export const dynamic = 'force-dynamic';

interface RouteContext {
    params: { projectId: string };
}

const VALID_ASPECTS: AspectRatio[] = ['9:16', '1:1', '16:9', '4:5'];

interface RawClip {
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

interface RawTimelineBody {
    id?: unknown;
    aspectRatio?: unknown;
    fps?: unknown;
    clips?: unknown;
}

function sanitizeClip(raw: RawClip, index: number): { ok: true; value: TimelineClip } | { ok: false; error: string } {
    if (typeof raw.sceneId !== 'string' || raw.sceneId.trim().length === 0) {
        return { ok: false, error: `clips[${index}].sceneId is required` };
    }
    if (typeof raw.start !== 'number' || !Number.isFinite(raw.start) || raw.start < 0) {
        return { ok: false, error: `clips[${index}].start must be a non-negative number` };
    }
    if (typeof raw.duration !== 'number' || !Number.isFinite(raw.duration) || raw.duration <= 0) {
        return { ok: false, error: `clips[${index}].duration must be a positive number` };
    }
    const transition = raw.transition;
    if (transition !== undefined && transition !== 'cut' && transition !== 'fade' && transition !== 'dissolve') {
        return { ok: false, error: `clips[${index}].transition must be cut | fade | dissolve` };
    }
    const volume = raw.volume;
    if (volume !== undefined && (typeof volume !== 'number' || volume < 0 || volume > 1)) {
        return { ok: false, error: `clips[${index}].volume must be a number in [0, 1]` };
    }
    const muted = raw.muted;
    if (muted !== undefined && typeof muted !== 'boolean') {
        return { ok: false, error: `clips[${index}].muted must be a boolean` };
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

function allScenesExist(projectId: string, clips: TimelineClip[]): boolean {
    const store = getSceneStore();
    for (const c of clips) {
        if (c.sceneId && !store.getScene(projectId, c.sceneId)) return false;
    }
    return true;
}

function buildTimelineFromBody(projectId: string, body: RawTimelineBody): { ok: true; value: Timeline } | { ok: false; error: string } {
    if (!Array.isArray(body.clips)) {
        return { ok: false, error: 'clips must be an array' };
    }
    if (body.aspectRatio !== undefined && !VALID_ASPECTS.includes(body.aspectRatio as AspectRatio)) {
        return { ok: false, error: 'aspectRatio invalid' };
    }
    if (body.fps !== undefined && (typeof body.fps !== 'number' || body.fps <= 0)) {
        return { ok: false, error: 'fps must be a positive number' };
    }

    const clips: TimelineClip[] = [];
    for (let i = 0; i < body.clips.length; i++) {
        const r = sanitizeClip(body.clips[i] as RawClip, i);
        if (!r.ok) return r;
        clips.push(r.value);
    }

    if (!allScenesExist(projectId, clips)) {
        return { ok: false, error: 'one or more clip.sceneId do not exist in this project' };
    }

    const fps = typeof body.fps === 'number' ? body.fps : 30;
    const aspectRatio = typeof body.aspectRatio === 'string' ? body.aspectRatio : '9:16';

    const timeline: Timeline = {
        id: typeof body.id === 'string' ? body.id : `tl_${projectId}`,
        projectId,
        duration: clips.reduce((acc, c) => acc + c.duration, 0),
        clips,
        aspectRatio,
        fps,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    const v = validateTimeline(timeline);
    if (!v.ok) {
        return { ok: false, error: v.errors.map(e => e.message).join('; ') };
    }
    return { ok: true, value: timeline };
}

// GET — return the stored timeline (or null when not built yet).
export async function GET(_request: Request, { params }: RouteContext) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

        const access = requireProject(userId, params.projectId);
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

        const timeline = getTimelineStore().getTimeline(params.projectId);
        return NextResponse.json({ timeline });
    } catch {
        return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
}

// POST — upsert the full timeline. Validates clips + scene membership.
export async function POST(request: Request, { params }: RouteContext) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

        const access = requireProject(userId, params.projectId);
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

        let body: RawTimelineBody;
        try {
            body = (await request.json()) as RawTimelineBody;
        } catch {
            return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
        }

        const v = buildTimelineFromBody(params.projectId, body);
        if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

        const saved = getTimelineStore().upsertTimeline(v.value);
        return NextResponse.json({ timeline: saved }, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
}

// PATCH — replace the clips array (or update fps/aspectRatio metadata).
export async function PATCH(request: Request, { params }: RouteContext) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

        const access = requireProject(userId, params.projectId);
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

        let body: RawTimelineBody;
        try {
            body = (await request.json()) as RawTimelineBody;
        } catch {
            return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
        }

        const store = getTimelineStore();
        const existing = store.getTimeline(params.projectId);
        if (!existing) {
            return NextResponse.json({ error: 'timeline not found (use POST to create)' }, { status: 404 });
        }

        let clips: TimelineClip[] = existing.clips;
        if (body.clips !== undefined) {
            if (!Array.isArray(body.clips)) {
                return NextResponse.json({ error: 'clips must be an array' }, { status: 400 });
            }
            const sanitized: TimelineClip[] = [];
            for (let i = 0; i < body.clips.length; i++) {
                const r = sanitizeClip(body.clips[i] as RawClip, i);
                if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
                sanitized.push(r.value);
            }
            if (!allScenesExist(params.projectId, sanitized)) {
                return NextResponse.json({ error: 'one or more clip.sceneId do not exist in this project' }, { status: 400 });
            }
            clips = sanitized;
        }

        const next: Timeline = {
            ...existing,
            clips,
            duration: clips.reduce((acc, c) => acc + c.duration, 0),
            aspectRatio: typeof body.aspectRatio === 'string' && VALID_ASPECTS.includes(body.aspectRatio as AspectRatio)
                ? (body.aspectRatio as AspectRatio)
                : existing.aspectRatio,
            fps: typeof body.fps === 'number' && body.fps > 0 ? body.fps : existing.fps,
        };

        const v = validateTimeline(next);
        if (!v.ok) {
            return NextResponse.json({ error: v.errors.map(e => e.message).join('; ') }, { status: 400 });
        }

        const saved = store.upsertTimeline(next);
        return NextResponse.json({ timeline: saved });
    } catch {
        return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
}
