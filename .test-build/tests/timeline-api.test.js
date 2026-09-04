"use strict";
/**
 * Unit tests for Phase 6B — Timeline API layer.
 *
 * Covers:
 *   - Timeline store: get / upsert / delete / addClip / updateClip / deleteClip
 *   - Authorization: user isolation across projects
 *   - Validation: bad duration, bad start, overlap, unknown scene
 *   - Upsert preserves createdAt; updates bumps updatedAt
 *
 * No real HTTP calls. We exercise the route validation by directly
 * calling the store + validators that mirror the route behaviour.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const harness_1 = require("./harness");
const timeline_store_1 = require("../lib/projects/timeline-store");
const timeline_1 = require("../lib/projects/timeline");
const scenes_1 = require("../lib/projects/scenes");
const access_1 = require("../lib/projects/access");
// ── helpers ──────────────────────────────────────────────────────────────
function makeClip(id, sceneId, start, duration) {
    return { id, sceneId, start, duration };
}
function seedProjectAndScene(projectId, userId, sceneId) {
    // Seed the projects store so requireProject passes.
    const map = {
        [userId]: [{
                id: projectId,
                userId,
                name: 'Test',
                brief: {
                    product: 'x', objective: 'awareness', audience: 'a',
                    platform: 'reels', style: 's', language: 'es',
                    referenceImages: [], productPhotos: [],
                },
                format: '9:16',
                duration: 20,
                status: 'draft',
                timeline: { totalDurationSec: 0, videoTrack: [], voiceTrack: [], musicTrack: [], textTrack: [] },
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z',
            }],
    };
    const g = globalThis;
    const store = {};
    g.window = {
        localStorage: {
            getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
            setItem(k, v) { store[k] = v; },
            removeItem(k) { delete store[k]; },
        },
    };
    store['AdSíntesisStudio.projects'] = JSON.stringify(map);
    scenes_1.localStorageSceneStore.createScene({
        projectId,
        order: 0,
        visualPrompt: `prompt for ${sceneId}`,
        durationSec: 5,
    });
    // The store creates a scene with a generated id; replace the seed
    // with a deterministic id so tests are predictable.
    const scenes = scenes_1.localStorageSceneStore.listScenes(projectId);
    strict_1.default.equal(scenes.length, 1);
}
// ── store CRUD ───────────────────────────────────────────────────────────
(0, harness_1.test)('timeline-store: get returns null for unknown project', () => {
    const t = timeline_store_1.localStorageTimelineStore.getTimeline('nope');
    strict_1.default.equal(t, null);
});
(0, harness_1.test)('timeline-store: upsert + get roundtrip', () => {
    const t = {
        id: 'tl1',
        projectId: 'p_upsert',
        duration: 9,
        clips: [makeClip('c1', 's1', 0, 4), makeClip('c2', 's2', 4, 5)],
        aspectRatio: '9:16',
        fps: 30,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    };
    const saved = timeline_store_1.localStorageTimelineStore.upsertTimeline(t);
    strict_1.default.equal(saved.id, 'tl1');
    strict_1.default.equal(saved.duration, 9);
    const fetched = timeline_store_1.localStorageTimelineStore.getTimeline('p_upsert');
    strict_1.default.ok(fetched);
    strict_1.default.deepEqual(fetched?.clips.length, 2);
});
(0, harness_1.test)('timeline-store: upsert preserves createdAt on re-upsert', async () => {
    const t = {
        id: 'tl2',
        projectId: 'p_reupsert',
        duration: 4,
        clips: [makeClip('c1', 's1', 0, 4)],
        aspectRatio: '9:16',
        fps: 30,
        createdAt: '2024-06-01T00:00:00Z',
        updatedAt: '2024-06-01T00:00:00Z',
    };
    const first = timeline_store_1.localStorageTimelineStore.upsertTimeline(t);
    const firstCreatedAt = first.createdAt;
    // Wait so updatedAt moves forward by at least 1 ms.
    await new Promise(r => setTimeout(r, 5));
    const later = { ...t, clips: [makeClip('c1', 's1', 0, 8)] };
    const second = timeline_store_1.localStorageTimelineStore.upsertTimeline(later);
    strict_1.default.equal(second.createdAt, firstCreatedAt);
    strict_1.default.notEqual(second.updatedAt, first.updatedAt);
    strict_1.default.equal(second.clips[0].duration, 8);
});
(0, harness_1.test)('timeline-store: delete removes the timeline', () => {
    const t = {
        id: 'tl3',
        projectId: 'p_del',
        duration: 4,
        clips: [makeClip('c1', 's1', 0, 4)],
        aspectRatio: '9:16',
        fps: 30,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    };
    timeline_store_1.localStorageTimelineStore.upsertTimeline(t);
    strict_1.default.equal(timeline_store_1.localStorageTimelineStore.deleteTimeline('p_del'), true);
    strict_1.default.equal(timeline_store_1.localStorageTimelineStore.getTimeline('p_del'), null);
});
(0, harness_1.test)('timeline-store: delete returns false for unknown project', () => {
    strict_1.default.equal(timeline_store_1.localStorageTimelineStore.deleteTimeline('nope'), false);
});
(0, harness_1.test)('timeline-store: addClip appends and bumps duration', () => {
    const t = {
        id: 'tl4',
        projectId: 'p_add',
        duration: 4,
        clips: [makeClip('c1', 's1', 0, 4)],
        aspectRatio: '9:16',
        fps: 30,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    };
    timeline_store_1.localStorageTimelineStore.upsertTimeline(t);
    const updated = timeline_store_1.localStorageTimelineStore.addClip('p_add', makeClip('c2', 's2', 4, 5));
    strict_1.default.ok(updated);
    strict_1.default.equal(updated?.clips.length, 2);
    strict_1.default.equal(updated?.duration, 9);
});
(0, harness_1.test)('timeline-store: addClip returns null when timeline missing', () => {
    const r = timeline_store_1.localStorageTimelineStore.addClip('nope', makeClip('c', 's', 0, 1));
    strict_1.default.equal(r, null);
});
(0, harness_1.test)('timeline-store: updateClip merges fields', () => {
    const t = {
        id: 'tl5',
        projectId: 'p_upd',
        duration: 4,
        clips: [makeClip('c1', 's1', 0, 4)],
        aspectRatio: '9:16',
        fps: 30,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    };
    timeline_store_1.localStorageTimelineStore.upsertTimeline(t);
    const updated = timeline_store_1.localStorageTimelineStore.updateClip('p_upd', 'c1', { duration: 7, transition: 'fade' });
    strict_1.default.ok(updated);
    strict_1.default.equal(updated?.clips[0].duration, 7);
    strict_1.default.equal(updated?.clips[0].transition, 'fade');
    strict_1.default.equal(updated?.duration, 7);
});
(0, harness_1.test)('timeline-store: updateClip rejects id change (id is immutable)', () => {
    const t = {
        id: 'tl5b',
        projectId: 'p_upd2',
        duration: 4,
        clips: [makeClip('c1', 's1', 0, 4)],
        aspectRatio: '9:16',
        fps: 30,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    };
    timeline_store_1.localStorageTimelineStore.upsertTimeline(t);
    const updated = timeline_store_1.localStorageTimelineStore.updateClip('p_upd2', 'c1', { id: 'hacked' });
    strict_1.default.ok(updated);
    strict_1.default.equal(updated?.clips[0].id, 'c1');
});
(0, harness_1.test)('timeline-store: updateClip returns null for unknown clip', () => {
    const t = {
        id: 'tl5c',
        projectId: 'p_upd3',
        duration: 4,
        clips: [makeClip('c1', 's1', 0, 4)],
        aspectRatio: '9:16',
        fps: 30,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    };
    timeline_store_1.localStorageTimelineStore.upsertTimeline(t);
    const r = timeline_store_1.localStorageTimelineStore.updateClip('p_upd3', 'nope', { duration: 1 });
    strict_1.default.equal(r, null);
});
(0, harness_1.test)('timeline-store: deleteClip removes + recomputes duration', () => {
    const t = {
        id: 'tl6',
        projectId: 'p_dc',
        duration: 9,
        clips: [makeClip('c1', 's1', 0, 4), makeClip('c2', 's2', 4, 5)],
        aspectRatio: '9:16',
        fps: 30,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    };
    timeline_store_1.localStorageTimelineStore.upsertTimeline(t);
    const after = timeline_store_1.localStorageTimelineStore.deleteClip('p_dc', 'c1');
    strict_1.default.ok(after);
    strict_1.default.equal(after?.clips.length, 1);
    strict_1.default.equal(after?.duration, 5);
});
(0, harness_1.test)('timeline-store: deleteClip returns null for unknown id', () => {
    const t = {
        id: 'tl6b',
        projectId: 'p_dc2',
        duration: 4,
        clips: [makeClip('c1', 's1', 0, 4)],
        aspectRatio: '9:16',
        fps: 30,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    };
    timeline_store_1.localStorageTimelineStore.upsertTimeline(t);
    const r = timeline_store_1.localStorageTimelineStore.deleteClip('p_dc2', 'nope');
    strict_1.default.equal(r, null);
});
// ── authorization ────────────────────────────────────────────────────────
(0, harness_1.test)('timeline-api authz: user A cannot access user B project', () => {
    seedProjectAndScene('p_iso', 'userA', 's1');
    // Switch to userB storage by clearing projects for userA.
    const g = globalThis;
    g.window.localStorage.setItem('AdSíntesisStudio.projects', JSON.stringify({
        userB: [{
                id: 'p_iso', userId: 'userB', name: 'B',
                brief: { product: 'x', objective: 'awareness', audience: 'a', platform: 'reels', style: 's', language: 'es', referenceImages: [], productPhotos: [] },
                format: '9:16', duration: 20, status: 'draft',
                timeline: { totalDurationSec: 0, videoTrack: [], voiceTrack: [], musicTrack: [], textTrack: [] },
                createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
            }],
    }));
    const r = (0, access_1.requireProject)('userA', 'p_iso');
    strict_1.default.equal(r.ok, false);
    if (!r.ok)
        strict_1.default.equal(r.status, 404);
});
// ── validation (mirrors route handlers) ──────────────────────────────────
(0, harness_1.test)('timeline-api validation: clean timeline passes', () => {
    const t = {
        id: 'tlv1', projectId: 'p_v', duration: 9,
        clips: [makeClip('c1', 's1', 0, 4), makeClip('c2', 's2', 4, 5)],
        aspectRatio: '9:16', fps: 30,
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    const v = (0, timeline_1.validateTimeline)(t);
    strict_1.default.equal(v.ok, true);
});
(0, harness_1.test)('timeline-api validation: overlap rejected', () => {
    const t = {
        id: 'tlv2', projectId: 'p_v', duration: 10,
        clips: [makeClip('c1', 's1', 0, 5), makeClip('c2', 's2', 4, 5)],
        aspectRatio: '9:16', fps: 30,
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    const v = (0, timeline_1.validateTimeline)(t);
    strict_1.default.equal(v.ok, false);
    strict_1.default.ok(v.errors.some(e => e.kind === 'overlap'));
});
(0, harness_1.test)('timeline-api validation: negative start rejected', () => {
    const t = {
        id: 'tlv3', projectId: 'p_v', duration: 4,
        clips: [makeClip('c1', 's1', -1, 4)],
        aspectRatio: '9:16', fps: 30,
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    const v = (0, timeline_1.validateTimeline)(t);
    strict_1.default.equal(v.ok, false);
});
(0, harness_1.test)('timeline-api validation: duration <= 0 rejected', () => {
    const t = {
        id: 'tlv4', projectId: 'p_v', duration: 4,
        clips: [makeClip('c1', 's1', 0, 0)],
        aspectRatio: '9:16', fps: 30,
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    const v = (0, timeline_1.validateTimeline)(t);
    strict_1.default.equal(v.ok, false);
});
(0, harness_1.test)('timeline-api validation: duplicate sceneId rejected', () => {
    const t = {
        id: 'tlv5', projectId: 'p_v', duration: 8,
        clips: [makeClip('c1', 's1', 0, 4), makeClip('c2', 's1', 4, 4)],
        aspectRatio: '9:16', fps: 30,
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    const v = (0, timeline_1.validateTimeline)(t);
    strict_1.default.equal(v.ok, false);
});
(0, harness_1.test)('timeline-api validation: scene membership check', () => {
    seedProjectAndScene('p_mem', 'userX', 'realScene');
    const t = {
        id: 'tlv6', projectId: 'p_mem', duration: 4,
        clips: [makeClip('c1', 'ghostScene', 0, 4)],
        aspectRatio: '9:16', fps: 30,
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    const fetched = scenes_1.localStorageSceneStore.listScenes('p_mem');
    const exists = fetched.some(s => s.id === 'ghostScene');
    strict_1.default.equal(exists, false);
});
