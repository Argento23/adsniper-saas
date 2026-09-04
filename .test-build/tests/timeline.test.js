"use strict";
/**
 * Unit tests for Phase 6A — Timeline data model baseline.
 *
 * Covers:
 *   - buildTimelineFromScenes produces sequential starts
 *   - total duration equals sum of scene durations
 *   - recomputeStarts normalises starts after edits
 *   - validateTimeline detects: invalid duration, negative start,
 *     invalid clip duration, overlap, duplicate scene
 *   - emptyTimeline returns duration=0 with empty clips
 *   - skipped scenes (duration ≤ 0) do not contribute to duration
 *
 * No real network calls.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const harness_1 = require("./harness");
const timeline_1 = require("../lib/projects/timeline");
// ── Helpers ──────────────────────────────────────────────────────────────
function scene(id, order, durationSec, transition) {
    return {
        id,
        projectId: 'p1',
        order,
        visualPrompt: `prompt for ${id}`,
        durationSec,
        transitionIn: transition,
        timestamps: { createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
        status: 'pending',
    };
}
// ── buildTimelineFromScenes ──────────────────────────────────────────────
(0, harness_1.test)('timeline: 4 scenes → 4 clips with sequential starts', () => {
    const scenes = [
        scene('s1', 0, 4),
        scene('s2', 1, 5),
        scene('s3', 2, 7),
        scene('s4', 3, 4),
    ];
    const t = (0, timeline_1.buildTimelineFromScenes)({
        timelineId: 'tl1',
        projectId: 'p1',
        scenes,
        aspectRatio: '9:16',
    });
    strict_1.default.equal(t.clips.length, 4);
    strict_1.default.equal(t.clips[0].start, 0);
    strict_1.default.equal(t.clips[1].start, 4);
    strict_1.default.equal(t.clips[2].start, 9);
    strict_1.default.equal(t.clips[3].start, 16);
    strict_1.default.equal(t.duration, 20);
});
(0, harness_1.test)('timeline: scenes are ordered by `order` regardless of array order', () => {
    const scenes = [
        scene('s4', 3, 4),
        scene('s2', 1, 5),
        scene('s1', 0, 4),
        scene('s3', 2, 7),
    ];
    const t = (0, timeline_1.buildTimelineFromScenes)({ timelineId: 'tl', projectId: 'p1', scenes, aspectRatio: '9:16' });
    strict_1.default.deepEqual(t.clips.map(c => c.sceneId), ['s1', 's2', 's3', 's4']);
});
(0, harness_1.test)('timeline: total duration equals sum of valid scene durations', () => {
    const scenes = [
        scene('s1', 0, 4),
        scene('s2', 1, 5),
        scene('s3', 2, 0), // skipped
        scene('s4', 3, 7),
    ];
    const t = (0, timeline_1.buildTimelineFromScenes)({ timelineId: 'tl', projectId: 'p1', scenes, aspectRatio: '9:16' });
    strict_1.default.equal(t.duration, 16);
    strict_1.default.equal(t.clips.length, 3);
});
(0, harness_1.test)('timeline: sourceUrlFor is applied per scene', () => {
    const scenes = [scene('s1', 0, 4), scene('s2', 1, 5)];
    const t = (0, timeline_1.buildTimelineFromScenes)({
        timelineId: 'tl', projectId: 'p1', scenes, aspectRatio: '9:16',
        sourceUrlFor: (id) => id === 's1' ? 'https://cdn/x.mp4' : undefined,
    });
    strict_1.default.equal(t.clips[0].sourceUrl, 'https://cdn/x.mp4');
    strict_1.default.equal(t.clips[1].sourceUrl, undefined);
});
(0, harness_1.test)('timeline: transitions are preserved', () => {
    const scenes = [
        scene('s1', 0, 4, 'cut'),
        scene('s2', 1, 5, 'fade'),
        scene('s3', 2, 7, 'dissolve'),
    ];
    const t = (0, timeline_1.buildTimelineFromScenes)({ timelineId: 'tl', projectId: 'p1', scenes, aspectRatio: '9:16' });
    strict_1.default.equal(t.clips[0].transition, 'cut');
    strict_1.default.equal(t.clips[1].transition, 'fade');
    strict_1.default.equal(t.clips[2].transition, 'dissolve');
});
// ── recomputeStarts ──────────────────────────────────────────────────────
(0, harness_1.test)('recomputeStarts: normalises after editing a clip duration', () => {
    const clips = [
        { id: 'c1', sceneId: 's1', start: 0, duration: 4 },
        { id: 'c2', sceneId: 's2', start: 100, duration: 5 }, // misaligned
        { id: 'c3', sceneId: 's3', start: 200, duration: 7 },
    ];
    const fixed = (0, timeline_1.recomputeStarts)(clips);
    strict_1.default.deepEqual(fixed.map(c => c.start), [0, 4, 9]);
});
(0, harness_1.test)('recomputeStarts: empty list returns empty', () => {
    strict_1.default.deepEqual((0, timeline_1.recomputeStarts)([]), []);
});
// ── computeTotalDuration ─────────────────────────────────────────────────
(0, harness_1.test)('computeTotalDuration: sums durations', () => {
    strict_1.default.equal((0, timeline_1.computeTotalDuration)([]), 0);
    strict_1.default.equal((0, timeline_1.computeTotalDuration)([
        { id: 'a', sceneId: 's1', start: 0, duration: 4 },
        { id: 'b', sceneId: 's2', start: 4, duration: 5 },
    ]), 9);
});
// ── validateTimeline ─────────────────────────────────────────────────────
(0, harness_1.test)('validate: empty timeline with duration=0 fails', () => {
    const t = (0, timeline_1.emptyTimeline)({ timelineId: 'tl', projectId: 'p1', aspectRatio: '9:16' });
    const r = (0, timeline_1.validateTimeline)(t);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.errors.some(e => e.kind === 'invalid_duration'));
});
(0, harness_1.test)('validate: clip with duration <= 0 fails', () => {
    const t = {
        id: 'tl', projectId: 'p1', duration: 10,
        clips: [
            { id: 'c1', sceneId: 's1', start: 0, duration: 4 },
            { id: 'c2', sceneId: 's2', start: 4, duration: 0 },
        ],
        aspectRatio: '9:16', fps: 30,
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    const r = (0, timeline_1.validateTimeline)(t);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.errors.some(e => e.kind === 'invalid_duration_clip'));
});
(0, harness_1.test)('validate: negative start fails', () => {
    const t = {
        id: 'tl', projectId: 'p1', duration: 4,
        clips: [{ id: 'c1', sceneId: 's1', start: -1, duration: 4 }],
        aspectRatio: '9:16', fps: 30,
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    const r = (0, timeline_1.validateTimeline)(t);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.errors.some(e => e.kind === 'negative_start'));
});
(0, harness_1.test)('validate: overlapping clips fail', () => {
    const t = {
        id: 'tl', projectId: 'p1', duration: 10,
        clips: [
            { id: 'c1', sceneId: 's1', start: 0, duration: 5 },
            { id: 'c2', sceneId: 's2', start: 4, duration: 5 }, // overlaps c1
        ],
        aspectRatio: '9:16', fps: 30,
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    const r = (0, timeline_1.validateTimeline)(t);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.errors.some(e => e.kind === 'overlap'));
});
(0, harness_1.test)('validate: duplicate sceneId fails', () => {
    const t = {
        id: 'tl', projectId: 'p1', duration: 8,
        clips: [
            { id: 'c1', sceneId: 's1', start: 0, duration: 4 },
            { id: 'c2', sceneId: 's1', start: 4, duration: 4 },
        ],
        aspectRatio: '9:16', fps: 30,
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    const r = (0, timeline_1.validateTimeline)(t);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.errors.some(e => e.kind === 'unknown_scene'));
});
(0, harness_1.test)('validate: back-to-back clips are NOT overlapping', () => {
    const t = {
        id: 'tl', projectId: 'p1', duration: 8,
        clips: [
            { id: 'c1', sceneId: 's1', start: 0, duration: 4 },
            { id: 'c2', sceneId: 's2', start: 4, duration: 4 },
        ],
        aspectRatio: '9:16', fps: 30,
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    const r = (0, timeline_1.validateTimeline)(t);
    strict_1.default.equal(r.ok, true);
});
(0, harness_1.test)('validate: a clean built timeline passes', () => {
    const scenes = [scene('s1', 0, 4), scene('s2', 1, 5), scene('s3', 2, 7)];
    const t = (0, timeline_1.buildTimelineFromScenes)({ timelineId: 'tl', projectId: 'p1', scenes, aspectRatio: '9:16' });
    const r = (0, timeline_1.validateTimeline)(t);
    strict_1.default.equal(r.ok, true);
});
// ── emptyTimeline ────────────────────────────────────────────────────────
(0, harness_1.test)('emptyTimeline: duration 0, no clips', () => {
    const t = (0, timeline_1.emptyTimeline)({ timelineId: 'tl', projectId: 'p1', aspectRatio: '1:1' });
    strict_1.default.equal(t.duration, 0);
    strict_1.default.equal(t.clips.length, 0);
    strict_1.default.equal(t.aspectRatio, '1:1');
    strict_1.default.equal(t.fps, 30);
});
(0, harness_1.test)('emptyTimeline: respects custom fps', () => {
    const t = (0, timeline_1.emptyTimeline)({ timelineId: 'tl', projectId: 'p1', aspectRatio: '9:16', fps: 60 });
    strict_1.default.equal(t.fps, 60);
});
