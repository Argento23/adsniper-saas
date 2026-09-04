"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.localStorageTimelineStore = void 0;
exports.getTimelineStore = getTimelineStore;
const STORAGE_KEY = 'AdSíntesisStudio.timelines';
function readRaw() {
    if (typeof window === 'undefined')
        return {};
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return {};
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object')
            return parsed;
        return {};
    }
    catch {
        return {};
    }
}
function writeRaw(map) {
    if (typeof window === 'undefined')
        return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    }
    catch {
        /* quota exceeded: ignored for MVP */
    }
}
function nowIso() {
    return new Date().toISOString();
}
exports.localStorageTimelineStore = {
    getTimeline(projectId) {
        const map = readRaw();
        return map[projectId] ?? null;
    },
    upsertTimeline(timeline) {
        const map = readRaw();
        const existing = map[timeline.projectId];
        const stamped = {
            ...timeline,
            createdAt: existing?.createdAt ?? timeline.createdAt ?? nowIso(),
            updatedAt: nowIso(),
        };
        map[timeline.projectId] = stamped;
        writeRaw(map);
        return stamped;
    },
    deleteTimeline(projectId) {
        const map = readRaw();
        if (!(projectId in map))
            return false;
        delete map[projectId];
        writeRaw(map);
        return true;
    },
    addClip(projectId, clip) {
        const map = readRaw();
        const t = map[projectId];
        if (!t)
            return null;
        const next = {
            ...t,
            clips: [...t.clips, clip],
            duration: t.clips.reduce((acc, c) => acc + c.duration, 0) + clip.duration,
            updatedAt: nowIso(),
        };
        map[projectId] = next;
        writeRaw(map);
        return next;
    },
    updateClip(projectId, clipId, patch) {
        const map = readRaw();
        const t = map[projectId];
        if (!t)
            return null;
        const idx = t.clips.findIndex(c => c.id === clipId);
        if (idx === -1)
            return null;
        const merged = { ...t.clips[idx], ...patch, id: t.clips[idx].id };
        const clips = [...t.clips];
        clips[idx] = merged;
        const next = {
            ...t,
            clips,
            duration: clips.reduce((acc, c) => acc + c.duration, 0),
            updatedAt: nowIso(),
        };
        map[projectId] = next;
        writeRaw(map);
        return next;
    },
    deleteClip(projectId, clipId) {
        const map = readRaw();
        const t = map[projectId];
        if (!t)
            return null;
        const clips = t.clips.filter(c => c.id !== clipId);
        if (clips.length === t.clips.length)
            return null;
        const next = {
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
function getTimelineStore() {
    return exports.localStorageTimelineStore;
}
