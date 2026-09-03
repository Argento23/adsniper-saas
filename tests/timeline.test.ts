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

import assert from 'node:assert/strict';
import { test, run } from './harness';

import {
    buildTimelineFromScenes,
    recomputeStarts,
    computeTotalDuration,
    validateTimeline,
    emptyTimeline,
    Timeline,
    TimelineClip,
} from '../lib/projects/timeline';
import { Scene } from '../lib/projects/types';

// ── Helpers ──────────────────────────────────────────────────────────────
function scene(id: string, order: number, durationSec: number, transition?: 'cut' | 'fade' | 'dissolve'): Scene {
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
test('timeline: 4 scenes → 4 clips with sequential starts', () => {
    const scenes = [
        scene('s1', 0, 4),
        scene('s2', 1, 5),
        scene('s3', 2, 7),
        scene('s4', 3, 4),
    ];
    const t = buildTimelineFromScenes({
        timelineId: 'tl1',
        projectId: 'p1',
        scenes,
        aspectRatio: '9:16',
    });
    assert.equal(t.clips.length, 4);
    assert.equal(t.clips[0].start, 0);
    assert.equal(t.clips[1].start, 4);
    assert.equal(t.clips[2].start, 9);
    assert.equal(t.clips[3].start, 16);
    assert.equal(t.duration, 20);
});

test('timeline: scenes are ordered by `order` regardless of array order', () => {
    const scenes = [
        scene('s4', 3, 4),
        scene('s2', 1, 5),
        scene('s1', 0, 4),
        scene('s3', 2, 7),
    ];
    const t = buildTimelineFromScenes({ timelineId: 'tl', projectId: 'p1', scenes, aspectRatio: '9:16' });
    assert.deepEqual(t.clips.map(c => c.sceneId), ['s1', 's2', 's3', 's4']);
});

test('timeline: total duration equals sum of valid scene durations', () => {
    const scenes = [
        scene('s1', 0, 4),
        scene('s2', 1, 5),
        scene('s3', 2, 0),  // skipped
        scene('s4', 3, 7),
    ];
    const t = buildTimelineFromScenes({ timelineId: 'tl', projectId: 'p1', scenes, aspectRatio: '9:16' });
    assert.equal(t.duration, 16);
    assert.equal(t.clips.length, 3);
});

test('timeline: sourceUrlFor is applied per scene', () => {
    const scenes = [scene('s1', 0, 4), scene('s2', 1, 5)];
    const t = buildTimelineFromScenes({
        timelineId: 'tl', projectId: 'p1', scenes, aspectRatio: '9:16',
        sourceUrlFor: (id) => id === 's1' ? 'https://cdn/x.mp4' : undefined,
    });
    assert.equal(t.clips[0].sourceUrl, 'https://cdn/x.mp4');
    assert.equal(t.clips[1].sourceUrl, undefined);
});

test('timeline: transitions are preserved', () => {
    const scenes = [
        scene('s1', 0, 4, 'cut'),
        scene('s2', 1, 5, 'fade'),
        scene('s3', 2, 7, 'dissolve'),
    ];
    const t = buildTimelineFromScenes({ timelineId: 'tl', projectId: 'p1', scenes, aspectRatio: '9:16' });
    assert.equal(t.clips[0].transition, 'cut');
    assert.equal(t.clips[1].transition, 'fade');
    assert.equal(t.clips[2].transition, 'dissolve');
});

// ── recomputeStarts ──────────────────────────────────────────────────────
test('recomputeStarts: normalises after editing a clip duration', () => {
    const clips: TimelineClip[] = [
        { id: 'c1', sceneId: 's1', start: 0, duration: 4 },
        { id: 'c2', sceneId: 's2', start: 100, duration: 5 },  // misaligned
        { id: 'c3', sceneId: 's3', start: 200, duration: 7 },
    ];
    const fixed = recomputeStarts(clips);
    assert.deepEqual(fixed.map(c => c.start), [0, 4, 9]);
});

test('recomputeStarts: empty list returns empty', () => {
    assert.deepEqual(recomputeStarts([]), []);
});

// ── computeTotalDuration ─────────────────────────────────────────────────
test('computeTotalDuration: sums durations', () => {
    assert.equal(computeTotalDuration([]), 0);
    assert.equal(computeTotalDuration([
        { id: 'a', sceneId: 's1', start: 0, duration: 4 },
        { id: 'b', sceneId: 's2', start: 4, duration: 5 },
    ]), 9);
});

// ── validateTimeline ─────────────────────────────────────────────────────
test('validate: empty timeline with duration=0 fails', () => {
    const t = emptyTimeline({ timelineId: 'tl', projectId: 'p1', aspectRatio: '9:16' });
    const r = validateTimeline(t);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.kind === 'invalid_duration'));
});

test('validate: clip with duration <= 0 fails', () => {
    const t: Timeline = {
        id: 'tl', projectId: 'p1', duration: 10,
        clips: [
            { id: 'c1', sceneId: 's1', start: 0, duration: 4 },
            { id: 'c2', sceneId: 's2', start: 4, duration: 0 },
        ],
        aspectRatio: '9:16', fps: 30,
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    const r = validateTimeline(t);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.kind === 'invalid_duration_clip'));
});

test('validate: negative start fails', () => {
    const t: Timeline = {
        id: 'tl', projectId: 'p1', duration: 4,
        clips: [{ id: 'c1', sceneId: 's1', start: -1, duration: 4 }],
        aspectRatio: '9:16', fps: 30,
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    const r = validateTimeline(t);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.kind === 'negative_start'));
});

test('validate: overlapping clips fail', () => {
    const t: Timeline = {
        id: 'tl', projectId: 'p1', duration: 10,
        clips: [
            { id: 'c1', sceneId: 's1', start: 0, duration: 5 },
            { id: 'c2', sceneId: 's2', start: 4, duration: 5 },  // overlaps c1
        ],
        aspectRatio: '9:16', fps: 30,
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    const r = validateTimeline(t);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.kind === 'overlap'));
});

test('validate: duplicate sceneId fails', () => {
    const t: Timeline = {
        id: 'tl', projectId: 'p1', duration: 8,
        clips: [
            { id: 'c1', sceneId: 's1', start: 0, duration: 4 },
            { id: 'c2', sceneId: 's1', start: 4, duration: 4 },
        ],
        aspectRatio: '9:16', fps: 30,
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    const r = validateTimeline(t);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.kind === 'unknown_scene'));
});

test('validate: back-to-back clips are NOT overlapping', () => {
    const t: Timeline = {
        id: 'tl', projectId: 'p1', duration: 8,
        clips: [
            { id: 'c1', sceneId: 's1', start: 0, duration: 4 },
            { id: 'c2', sceneId: 's2', start: 4, duration: 4 },
        ],
        aspectRatio: '9:16', fps: 30,
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
    const r = validateTimeline(t);
    assert.equal(r.ok, true);
});

test('validate: a clean built timeline passes', () => {
    const scenes = [scene('s1', 0, 4), scene('s2', 1, 5), scene('s3', 2, 7)];
    const t = buildTimelineFromScenes({ timelineId: 'tl', projectId: 'p1', scenes, aspectRatio: '9:16' });
    const r = validateTimeline(t);
    assert.equal(r.ok, true);
});

// ── emptyTimeline ────────────────────────────────────────────────────────
test('emptyTimeline: duration 0, no clips', () => {
    const t = emptyTimeline({ timelineId: 'tl', projectId: 'p1', aspectRatio: '1:1' });
    assert.equal(t.duration, 0);
    assert.equal(t.clips.length, 0);
    assert.equal(t.aspectRatio, '1:1');
    assert.equal(t.fps, 30);
});

test('emptyTimeline: respects custom fps', () => {
    const t = emptyTimeline({ timelineId: 'tl', projectId: 'p1', aspectRatio: '9:16', fps: 60 });
    assert.equal(t.fps, 60);
});

export {};
