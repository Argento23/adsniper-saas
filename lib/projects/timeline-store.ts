/**
 * Timeline persistence layer — Phase 6B.
 *
 * Stores the new `Timeline` model (Phase 6A) in a dedicated localStorage
 * key, OUTSIDE `Project.timeline` (which still hosts the legacy
 * `TimelineState` from Phase 1).
 *
 * Pattern mirrors `localStorageSceneStore`: in-process singleton keyed
 * by `projectId`. Browser-safe (no-op when `window` is undefined so
 * that route handlers can be imported server-side without crashing).
 */

import { Timeline, TimelineClip } from './timeline';

const STORAGE_KEY = 'AdSíntesisStudio.timelines';

export interface TimelineStore {
    getTimeline(projectId: string): Timeline | null;
    upsertTimeline(timeline: Timeline): Timeline;
    deleteTimeline(projectId: string): boolean;

    addClip(projectId: string, clip: TimelineClip): Timeline | null;
    updateClip(projectId: string, clipId: string, patch: Partial<TimelineClip>): Timeline | null;
    deleteClip(projectId: string, clipId: string): Timeline | null;
}

function readRaw(): Record<string, Timeline> {
    if (typeof window === 'undefined') return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed as Record<string, Timeline>;
        return {};
    } catch {
        return {};
    }
}

function writeRaw(map: Record<string, Timeline>): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch {
        /* quota exceeded: ignored for MVP */
    }
}

function nowIso(): string {
    return new Date().toISOString();
}

export const localStorageTimelineStore: TimelineStore = {
    getTimeline(projectId: string): Timeline | null {
        const map = readRaw();
        return map[projectId] ?? null;
    },

    upsertTimeline(timeline: Timeline): Timeline {
        const map = readRaw();
        const existing = map[timeline.projectId];
        const stamped: Timeline = {
            ...timeline,
            createdAt: existing?.createdAt ?? timeline.createdAt ?? nowIso(),
            updatedAt: nowIso(),
        };
        map[timeline.projectId] = stamped;
        writeRaw(map);
        return stamped;
    },

    deleteTimeline(projectId: string): boolean {
        const map = readRaw();
        if (!(projectId in map)) return false;
        delete map[projectId];
        writeRaw(map);
        return true;
    },

    addClip(projectId: string, clip: TimelineClip): Timeline | null {
        const map = readRaw();
        const t = map[projectId];
        if (!t) return null;
        const next: Timeline = {
            ...t,
            clips: [...t.clips, clip],
            duration: t.clips.reduce((acc, c) => acc + c.duration, 0) + clip.duration,
            updatedAt: nowIso(),
        };
        map[projectId] = next;
        writeRaw(map);
        return next;
    },

    updateClip(projectId: string, clipId: string, patch: Partial<TimelineClip>): Timeline | null {
        const map = readRaw();
        const t = map[projectId];
        if (!t) return null;
        const idx = t.clips.findIndex(c => c.id === clipId);
        if (idx === -1) return null;
        const merged: TimelineClip = { ...t.clips[idx], ...patch, id: t.clips[idx].id };
        const clips = [...t.clips];
        clips[idx] = merged;
        const next: Timeline = {
            ...t,
            clips,
            duration: clips.reduce((acc, c) => acc + c.duration, 0),
            updatedAt: nowIso(),
        };
        map[projectId] = next;
        writeRaw(map);
        return next;
    },

    deleteClip(projectId: string, clipId: string): Timeline | null {
        const map = readRaw();
        const t = map[projectId];
        if (!t) return null;
        const clips = t.clips.filter(c => c.id !== clipId);
        if (clips.length === t.clips.length) return null;
        const next: Timeline = {
            ...t,
            clips,
            duration: clips.reduce((acc, c) => acc + c.duration, 0),
            updatedAt: nowIso(),
        };
        map[projectId] = next;
        writeRaw(map);
        return next;
    },
};

export function getTimelineStore(): TimelineStore {
    return localStorageTimelineStore;
}
