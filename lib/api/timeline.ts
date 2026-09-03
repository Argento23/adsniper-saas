/**
 * Timeline API client.
 *
 * Thin fetch wrapper for `/api/studio/projects/[projectId]/timeline/*`.
 * Mirrors the inline-fetch pattern used by other Studio components but
 * centralises the URLs and error mapping so the editor stays clean.
 *
 * All calls return a typed result or throw with a normalised Error.
 */

import { Timeline, TimelineClip } from '@/lib/projects/timeline';

interface ApiError extends Error {
    status: number;
}

async function call<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const res = await fetch(input, init);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
        const message = typeof data.error === 'string' ? data.error : `HTTP ${res.status}`;
        const err = new Error(message) as ApiError;
        err.status = res.status;
        throw err;
    }
    return data as T;
}

export async function fetchTimeline(projectId: string): Promise<Timeline | null> {
    const data = await call<{ timeline: Timeline | null }>(
        `/api/studio/projects/${projectId}/timeline`,
    );
    return data.timeline;
}

export async function createTimeline(projectId: string, timeline: Timeline): Promise<Timeline> {
    const data = await call<{ timeline: Timeline }>(
        `/api/studio/projects/${projectId}/timeline`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(timeline),
        },
    );
    return data.timeline;
}

export async function patchTimeline(projectId: string, clips: TimelineClip[]): Promise<Timeline> {
    const data = await call<{ timeline: Timeline }>(
        `/api/studio/projects/${projectId}/timeline`,
        {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clips }),
        },
    );
    return data.timeline;
}

export async function deleteClip(projectId: string, clipId: string): Promise<Timeline> {
    const data = await call<{ timeline: Timeline }>(
        `/api/studio/projects/${projectId}/timeline/clips/${clipId}`,
        { method: 'DELETE' },
    );
    return data.timeline;
}

export async function patchClip(
    projectId: string,
    clipId: string,
    patch: Partial<TimelineClip>,
): Promise<Timeline> {
    const data = await call<{ timeline: Timeline }>(
        `/api/studio/projects/${projectId}/timeline/clips/${clipId}`,
        {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
        },
    );
    return data.timeline;
}
