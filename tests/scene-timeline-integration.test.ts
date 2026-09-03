/**
 * Unit tests for Phase 6D — Scene ↔ Timeline integration.
 *
 * Covers:
 *   - Scenes → Timeline (buildTimelineFromProjectScenes)
 *   - Durations propagate from Scene.durationSec into clip.duration
 *   - sourceUrl resolution via injected assetLookup
 *   - status mapping: Scene.status → UI display bucket
 *   - missing video: clips without videoAssetId get no sourceUrl
 *   - reorder: clip order is preserved through sync
 *   - recalculation: clip.starts + timeline.duration are recomputed
 *   - syncTimelineWithScenes drops clips whose scene was deleted
 */

import assert from 'node:assert/strict';
import { test } from './harness';

import { Scene } from '../lib/projects/types';
import { Timeline, TimelineClip } from '../lib/projects/timeline';
import {
    getSceneVideoStatus,
    getSceneStatusLabel,
    resolveSceneVideoUrl,
    buildSourceUrlFor,
    buildTimelineFromProjectScenes,
    syncTimelineWithScenes,
    type AssetLookup,
} from '../lib/projects/scene-integration';

// ── helpers ──────────────────────────────────────────────────────────────
function mkScene(over: Partial<Scene> & { id: string }): Scene {
    return {
        projectId: 'p1',
        order: 0,
        visualPrompt: 'p',
        durationSec: 5,
        timestamps: { createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
        status: 'pending',
        ...over,
    };
}

// ── status mapping ───────────────────────────────────────────────────────
test('integration: status maps pending → pending', () => {
    assert.equal(getSceneVideoStatus(mkScene({ id: 's1', status: 'pending' })), 'pending');
});
test('integration: status maps prompt_ready → generating', () => {
    assert.equal(getSceneVideoStatus(mkScene({ id: 's1', status: 'prompt_ready' })), 'generating');
});
test('integration: status maps generating_keyframe → generating', () => {
    assert.equal(getSceneVideoStatus(mkScene({ id: 's1', status: 'generating_keyframe' })), 'generating');
});
test('integration: status maps keyframe_ready → generating', () => {
    assert.equal(getSceneVideoStatus(mkScene({ id: 's1', status: 'keyframe_ready' })), 'generating');
});
test('integration: status maps generating_video → generating', () => {
    assert.equal(getSceneVideoStatus(mkScene({ id: 's1', status: 'generating_video' })), 'generating');
});
test('integration: status maps video_ready → ready', () => {
    assert.equal(getSceneVideoStatus(mkScene({ id: 's1', status: 'video_ready' })), 'ready');
});
test('integration: status maps ready → ready', () => {
    assert.equal(getSceneVideoStatus(mkScene({ id: 's1', status: 'ready' })), 'ready');
});
test('integration: status maps failed → failed', () => {
    assert.equal(getSceneVideoStatus(mkScene({ id: 's1', status: 'failed' })), 'failed');
});

test('integration: status labels include the icon glyph', () => {
    assert.equal(getSceneStatusLabel(mkScene({ id: 's1', status: 'ready' })), '✓ Ready');
    assert.equal(getSceneStatusLabel(mkScene({ id: 's1', status: 'pending' })), '○ Pending');
    assert.equal(getSceneStatusLabel(mkScene({ id: 's1', status: 'generating_video' })), '⏳ Generating');
    assert.equal(getSceneStatusLabel(mkScene({ id: 's1', status: 'failed' })), '⚠ Failed');
});

// ── resolveSceneVideoUrl ─────────────────────────────────────────────────
test('integration: resolveSceneVideoUrl returns undefined without assetLookup', () => {
    const scene = mkScene({ id: 's1', videoAssetId: 'asset_abc' });
    assert.equal(resolveSceneVideoUrl(scene), undefined);
});

test('integration: resolveSceneVideoUrl returns undefined without videoAssetId', () => {
    const scene = mkScene({ id: 's1' });
    const lookup: AssetLookup = () => 'https://cdn/x.mp4';
    assert.equal(resolveSceneVideoUrl(scene, lookup), undefined);
});

test('integration: resolveSceneVideoUrl returns URL via lookup when bound', () => {
    const scene = mkScene({ id: 's1', videoAssetId: 'asset_abc' });
    const lookup: AssetLookup = (id) => id === 'asset_abc' ? 'https://cdn/x.mp4' : undefined;
    assert.equal(resolveSceneVideoUrl(scene, lookup), 'https://cdn/x.mp4');
});

test('integration: resolveSceneVideoUrl returns undefined when lookup misses', () => {
    const scene = mkScene({ id: 's1', videoAssetId: 'asset_abc' });
    const lookup: AssetLookup = () => undefined;
    assert.equal(resolveSceneVideoUrl(scene, lookup), undefined);
});

// ── buildSourceUrlFor ────────────────────────────────────────────────────
test('integration: buildSourceUrlFor returns URLs for known scene ids', () => {
    const scenes = [
        mkScene({ id: 's1', videoAssetId: 'a1' }),
        mkScene({ id: 's2', videoAssetId: 'a2' }),
        mkScene({ id: 's3' }),
    ];
    const lookup: AssetLookup = (id) => id === 'a1' ? 'https://cdn/a1.mp4' : id === 'a2' ? 'https://cdn/a2.mp4' : undefined;
    const fn = buildSourceUrlFor(scenes, lookup);
    assert.equal(fn('s1'), 'https://cdn/a1.mp4');
    assert.equal(fn('s2'), 'https://cdn/a2.mp4');
    assert.equal(fn('s3'), undefined);
    assert.equal(fn('unknown'), undefined);
});

// ── buildTimelineFromProjectScenes ───────────────────────────────────────
test('integration: 4 scenes 4s+5s+7s+4s → clips with sequential starts', () => {
    const scenes = [
        mkScene({ id: 's1', order: 0, durationSec: 4 }),
        mkScene({ id: 's2', order: 1, durationSec: 5 }),
        mkScene({ id: 's3', order: 2, durationSec: 7 }),
        mkScene({ id: 's4', order: 3, durationSec: 4 }),
    ];
    const t = buildTimelineFromProjectScenes({
        timelineId: 'tl1',
        projectId: 'p1',
        scenes,
        aspectRatio: '9:16',
    });
    assert.equal(t.clips.length, 4);
    assert.deepEqual(t.clips.map(c => c.start), [0, 4, 9, 16]);
    assert.deepEqual(t.clips.map(c => c.duration), [4, 5, 7, 4]);
    assert.equal(t.duration, 20);
});

test('integration: durations propagate from scenes to clips', () => {
    const scenes = [
        mkScene({ id: 's1', order: 0, durationSec: 3 }),
        mkScene({ id: 's2', order: 1, durationSec: 8 }),
    ];
    const t = buildTimelineFromProjectScenes({
        timelineId: 'tl', projectId: 'p', scenes, aspectRatio: '1:1',
    });
    assert.equal(t.clips[0].duration, 3);
    assert.equal(t.clips[1].duration, 8);
    assert.equal(t.duration, 11);
});

test('integration: sourceUrl is injected per clip via assetLookup', () => {
    const scenes = [
        mkScene({ id: 's1', order: 0, durationSec: 4, videoAssetId: 'a1' }),
        mkScene({ id: 's2', order: 1, durationSec: 5, videoAssetId: 'a2' }),
        mkScene({ id: 's3', order: 2, durationSec: 4 }), // no asset
    ];
    const lookup: AssetLookup = (id) => id === 'a1' ? 'https://cdn/a1.mp4' : id === 'a2' ? 'https://cdn/a2.mp4' : undefined;
    const t = buildTimelineFromProjectScenes({
        timelineId: 'tl', projectId: 'p', scenes, aspectRatio: '9:16',
        assetLookup: lookup,
    });
    assert.equal(t.clips[0].sourceUrl, 'https://cdn/a1.mp4');
    assert.equal(t.clips[1].sourceUrl, 'https://cdn/a2.mp4');
    assert.equal(t.clips[2].sourceUrl, undefined);
});

test('integration: missing video → no sourceUrl on the clip', () => {
    const scenes = [mkScene({ id: 's1', order: 0, durationSec: 5 })];
    const t = buildTimelineFromProjectScenes({
        timelineId: 'tl', projectId: 'p', scenes, aspectRatio: '9:16',
    });
    assert.equal(t.clips[0].sourceUrl, undefined);
});

test('integration: transition follows scene.transitionIn', () => {
    const scenes = [
        mkScene({ id: 's1', order: 0, durationSec: 4, transitionIn: 'fade' }),
        mkScene({ id: 's2', order: 1, durationSec: 5, transitionIn: 'dissolve' }),
        mkScene({ id: 's3', order: 2, durationSec: 4 }),
    ];
    const t = buildTimelineFromProjectScenes({
        timelineId: 'tl', projectId: 'p', scenes, aspectRatio: '9:16',
    });
    assert.equal(t.clips[0].transition, 'fade');
    assert.equal(t.clips[1].transition, 'dissolve');
    assert.equal(t.clips[2].transition, undefined);
});

test('integration: scene order is preserved regardless of array order', () => {
    const scenes = [
        mkScene({ id: 's4', order: 3, durationSec: 4 }),
        mkScene({ id: 's2', order: 1, durationSec: 5 }),
        mkScene({ id: 's1', order: 0, durationSec: 4 }),
        mkScene({ id: 's3', order: 2, durationSec: 7 }),
    ];
    const t = buildTimelineFromProjectScenes({
        timelineId: 'tl', projectId: 'p', scenes, aspectRatio: '9:16',
    });
    assert.deepEqual(t.clips.map(c => c.sceneId), ['s1', 's2', 's3', 's4']);
});

// ── syncTimelineWithScenes ───────────────────────────────────────────────
function mkTimeline(): Timeline {
    const clips: TimelineClip[] = [
        { id: 'c1', sceneId: 's1', start: 0, duration: 4 },
        { id: 'c2', sceneId: 's2', start: 4, duration: 5 },
        { id: 'c3', sceneId: 's3', start: 9, duration: 7 },
    ];
    return {
        id: 'tl', projectId: 'p', duration: 16, clips,
        aspectRatio: '9:16', fps: 30,
        createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
    };
}

test('integration: sync refreshes durations from scenes and recomputes starts', () => {
    const timeline = mkTimeline();
    const scenes = [
        mkScene({ id: 's1', durationSec: 6 }), // was 4
        mkScene({ id: 's2', durationSec: 5 }),
        mkScene({ id: 's3', durationSec: 9 }), // was 7
    ];
    const next = syncTimelineWithScenes({ timeline, scenes });
    assert.deepEqual(next.clips.map(c => c.duration), [6, 5, 9]);
    assert.deepEqual(next.clips.map(c => c.start), [0, 6, 11]);
    assert.equal(next.duration, 20);
});

test('integration: sync propagates new sourceUrls when scenes gain videoAssetId', () => {
    const timeline = mkTimeline();
    const lookup: AssetLookup = (id) => id === 'a1' ? 'https://cdn/a1.mp4' : id === 'a2' ? 'https://cdn/a2.mp4' : undefined;
    const scenes = [
        mkScene({ id: 's1', durationSec: 4, videoAssetId: 'a1' }),
        mkScene({ id: 's2', durationSec: 5 }),
        mkScene({ id: 's3', durationSec: 7, videoAssetId: 'a2' }),
    ];
    const next = syncTimelineWithScenes({ timeline, scenes, assetLookup: lookup });
    assert.equal(next.clips[0].sourceUrl, 'https://cdn/a1.mp4');
    assert.equal(next.clips[1].sourceUrl, undefined);
    assert.equal(next.clips[2].sourceUrl, 'https://cdn/a2.mp4');
});

test('integration: sync removes sourceUrl when scene loses its asset', () => {
    const timeline: Timeline = {
        ...mkTimeline(),
        clips: [
            { id: 'c1', sceneId: 's1', start: 0, duration: 4, sourceUrl: 'https://old/1.mp4' },
            { id: 'c2', sceneId: 's2', start: 4, duration: 5, sourceUrl: 'https://old/2.mp4' },
        ],
    };
    const scenes = [mkScene({ id: 's1', durationSec: 4 }), mkScene({ id: 's2', durationSec: 5 })];
    const next = syncTimelineWithScenes({ timeline, scenes });
    assert.equal(next.clips[0].sourceUrl, undefined);
    assert.equal(next.clips[1].sourceUrl, undefined);
});

test('integration: sync drops clips whose scene no longer exists', () => {
    const timeline = mkTimeline(); // s1, s2, s3
    const scenes = [mkScene({ id: 's1', durationSec: 4 }), mkScene({ id: 's3', durationSec: 7 })]; // s2 removed
    const next = syncTimelineWithScenes({ timeline, scenes });
    assert.deepEqual(next.clips.map(c => c.sceneId), ['s1', 's3']);
    assert.deepEqual(next.clips.map(c => c.start), [0, 4]);
    assert.equal(next.duration, 11);
});

test('integration: sync preserves the user-chosen clip order', () => {
    const timeline: Timeline = {
        ...mkTimeline(),
        clips: [
            { id: 'c3', sceneId: 's3', start: 0, duration: 7 },
            { id: 'c1', sceneId: 's1', start: 7, duration: 4 },
            { id: 'c2', sceneId: 's2', start: 11, duration: 5 },
        ],
    };
    const scenes = [
        mkScene({ id: 's1', durationSec: 4 }),
        mkScene({ id: 's2', durationSec: 5 }),
        mkScene({ id: 's3', durationSec: 7 }),
    ];
    const next = syncTimelineWithScenes({ timeline, scenes });
    assert.deepEqual(next.clips.map(c => c.sceneId), ['s3', 's1', 's2']);
    assert.deepEqual(next.clips.map(c => c.start), [0, 7, 11]);
    assert.equal(next.duration, 16);
});

test('integration: sync refreshes transition from scene.transitionIn', () => {
    const timeline: Timeline = {
        ...mkTimeline(),
        clips: [
            { id: 'c1', sceneId: 's1', start: 0, duration: 4, transition: 'cut' },
        ],
    };
    const scenes = [mkScene({ id: 's1', durationSec: 4, transitionIn: 'fade' })];
    const next = syncTimelineWithScenes({ timeline, scenes });
    assert.equal(next.clips[0].transition, 'fade');
});

test('integration: empty scenes produces an empty timeline', () => {
    const timeline = mkTimeline();
    const next = syncTimelineWithScenes({ timeline, scenes: [] });
    assert.equal(next.clips.length, 0);
    assert.equal(next.duration, 0);
});

test('integration: buildTimelineFromProjectScenes with empty scenes → empty timeline', () => {
    const t = buildTimelineFromProjectScenes({
        timelineId: 'tl', projectId: 'p', scenes: [], aspectRatio: '9:16',
    });
    assert.equal(t.clips.length, 0);
    assert.equal(t.duration, 0);
});

// ── end-to-end ───────────────────────────────────────────────────────────
test('integration: end-to-end Creative Director output (4 scenes 20s) maps to 4 clips 20s', () => {
    // Mirror the Phase 5 brief-parser output shape.
    const scenes: Scene[] = [
        mkScene({ id: 's1', order: 0, durationSec: 4, status: 'ready', videoAssetId: 'a1', transitionIn: 'cut' }),
        mkScene({ id: 's2', order: 1, durationSec: 5, status: 'generating_video', videoAssetId: 'a2', transitionIn: 'cut' }),
        mkScene({ id: 's3', order: 2, durationSec: 7, status: 'prompt_ready' }),
        mkScene({ id: 's4', order: 3, durationSec: 4, status: 'failed' }),
    ];
    const lookup: AssetLookup = (id) => id === 'a1' ? 'https://cdn/a1.mp4' : id === 'a2' ? 'https://cdn/a2.mp4' : undefined;
    const t = buildTimelineFromProjectScenes({
        timelineId: 'tl', projectId: 'p', scenes, aspectRatio: '9:16', assetLookup: lookup,
    });

    // Duration math
    assert.equal(t.duration, 20);
    assert.deepEqual(t.clips.map(c => c.start), [0, 4, 9, 16]);

    // Source URLs: only s1 and s2 have assets
    assert.equal(t.clips[0].sourceUrl, 'https://cdn/a1.mp4');
    assert.equal(t.clips[1].sourceUrl, 'https://cdn/a2.mp4');
    assert.equal(t.clips[2].sourceUrl, undefined);
    assert.equal(t.clips[3].sourceUrl, undefined);

    // Status mapping for legend
    assert.equal(getSceneVideoStatus(scenes[0]), 'ready');
    assert.equal(getSceneVideoStatus(scenes[1]), 'generating');
    assert.equal(getSceneVideoStatus(scenes[2]), 'generating');
    assert.equal(getSceneVideoStatus(scenes[3]), 'failed');
});

export {};
