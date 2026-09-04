"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const harness_1 = require("./harness");
const scene_integration_1 = require("../lib/projects/scene-integration");
// ── helpers ──────────────────────────────────────────────────────────────
function mkScene(over) {
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
(0, harness_1.test)('integration: status maps pending → pending', () => {
    strict_1.default.equal((0, scene_integration_1.getSceneVideoStatus)(mkScene({ id: 's1', status: 'pending' })), 'pending');
});
(0, harness_1.test)('integration: status maps prompt_ready → generating', () => {
    strict_1.default.equal((0, scene_integration_1.getSceneVideoStatus)(mkScene({ id: 's1', status: 'prompt_ready' })), 'generating');
});
(0, harness_1.test)('integration: status maps generating_keyframe → generating', () => {
    strict_1.default.equal((0, scene_integration_1.getSceneVideoStatus)(mkScene({ id: 's1', status: 'generating_keyframe' })), 'generating');
});
(0, harness_1.test)('integration: status maps keyframe_ready → generating', () => {
    strict_1.default.equal((0, scene_integration_1.getSceneVideoStatus)(mkScene({ id: 's1', status: 'keyframe_ready' })), 'generating');
});
(0, harness_1.test)('integration: status maps generating_video → generating', () => {
    strict_1.default.equal((0, scene_integration_1.getSceneVideoStatus)(mkScene({ id: 's1', status: 'generating_video' })), 'generating');
});
(0, harness_1.test)('integration: status maps video_ready → ready', () => {
    strict_1.default.equal((0, scene_integration_1.getSceneVideoStatus)(mkScene({ id: 's1', status: 'video_ready' })), 'ready');
});
(0, harness_1.test)('integration: status maps ready → ready', () => {
    strict_1.default.equal((0, scene_integration_1.getSceneVideoStatus)(mkScene({ id: 's1', status: 'ready' })), 'ready');
});
(0, harness_1.test)('integration: status maps failed → failed', () => {
    strict_1.default.equal((0, scene_integration_1.getSceneVideoStatus)(mkScene({ id: 's1', status: 'failed' })), 'failed');
});
(0, harness_1.test)('integration: status labels include the icon glyph', () => {
    strict_1.default.equal((0, scene_integration_1.getSceneStatusLabel)(mkScene({ id: 's1', status: 'ready' })), '✓ Ready');
    strict_1.default.equal((0, scene_integration_1.getSceneStatusLabel)(mkScene({ id: 's1', status: 'pending' })), '○ Pending');
    strict_1.default.equal((0, scene_integration_1.getSceneStatusLabel)(mkScene({ id: 's1', status: 'generating_video' })), '⏳ Generating');
    strict_1.default.equal((0, scene_integration_1.getSceneStatusLabel)(mkScene({ id: 's1', status: 'failed' })), '⚠ Failed');
});
// ── resolveSceneVideoUrl ─────────────────────────────────────────────────
(0, harness_1.test)('integration: resolveSceneVideoUrl returns undefined without assetLookup', () => {
    const scene = mkScene({ id: 's1', videoAssetId: 'asset_abc' });
    strict_1.default.equal((0, scene_integration_1.resolveSceneVideoUrl)(scene), undefined);
});
(0, harness_1.test)('integration: resolveSceneVideoUrl returns undefined without videoAssetId', () => {
    const scene = mkScene({ id: 's1' });
    const lookup = () => 'https://cdn/x.mp4';
    strict_1.default.equal((0, scene_integration_1.resolveSceneVideoUrl)(scene, lookup), undefined);
});
(0, harness_1.test)('integration: resolveSceneVideoUrl returns URL via lookup when bound', () => {
    const scene = mkScene({ id: 's1', videoAssetId: 'asset_abc' });
    const lookup = (id) => id === 'asset_abc' ? 'https://cdn/x.mp4' : undefined;
    strict_1.default.equal((0, scene_integration_1.resolveSceneVideoUrl)(scene, lookup), 'https://cdn/x.mp4');
});
(0, harness_1.test)('integration: resolveSceneVideoUrl returns undefined when lookup misses', () => {
    const scene = mkScene({ id: 's1', videoAssetId: 'asset_abc' });
    const lookup = () => undefined;
    strict_1.default.equal((0, scene_integration_1.resolveSceneVideoUrl)(scene, lookup), undefined);
});
// ── buildSourceUrlFor ────────────────────────────────────────────────────
(0, harness_1.test)('integration: buildSourceUrlFor returns URLs for known scene ids', () => {
    const scenes = [
        mkScene({ id: 's1', videoAssetId: 'a1' }),
        mkScene({ id: 's2', videoAssetId: 'a2' }),
        mkScene({ id: 's3' }),
    ];
    const lookup = (id) => id === 'a1' ? 'https://cdn/a1.mp4' : id === 'a2' ? 'https://cdn/a2.mp4' : undefined;
    const fn = (0, scene_integration_1.buildSourceUrlFor)(scenes, lookup);
    strict_1.default.equal(fn('s1'), 'https://cdn/a1.mp4');
    strict_1.default.equal(fn('s2'), 'https://cdn/a2.mp4');
    strict_1.default.equal(fn('s3'), undefined);
    strict_1.default.equal(fn('unknown'), undefined);
});
// ── buildTimelineFromProjectScenes ───────────────────────────────────────
(0, harness_1.test)('integration: 4 scenes 4s+5s+7s+4s → clips with sequential starts', () => {
    const scenes = [
        mkScene({ id: 's1', order: 0, durationSec: 4 }),
        mkScene({ id: 's2', order: 1, durationSec: 5 }),
        mkScene({ id: 's3', order: 2, durationSec: 7 }),
        mkScene({ id: 's4', order: 3, durationSec: 4 }),
    ];
    const t = (0, scene_integration_1.buildTimelineFromProjectScenes)({
        timelineId: 'tl1',
        projectId: 'p1',
        scenes,
        aspectRatio: '9:16',
    });
    strict_1.default.equal(t.clips.length, 4);
    strict_1.default.deepEqual(t.clips.map(c => c.start), [0, 4, 9, 16]);
    strict_1.default.deepEqual(t.clips.map(c => c.duration), [4, 5, 7, 4]);
    strict_1.default.equal(t.duration, 20);
});
(0, harness_1.test)('integration: durations propagate from scenes to clips', () => {
    const scenes = [
        mkScene({ id: 's1', order: 0, durationSec: 3 }),
        mkScene({ id: 's2', order: 1, durationSec: 8 }),
    ];
    const t = (0, scene_integration_1.buildTimelineFromProjectScenes)({
        timelineId: 'tl', projectId: 'p', scenes, aspectRatio: '1:1',
    });
    strict_1.default.equal(t.clips[0].duration, 3);
    strict_1.default.equal(t.clips[1].duration, 8);
    strict_1.default.equal(t.duration, 11);
});
(0, harness_1.test)('integration: sourceUrl is injected per clip via assetLookup', () => {
    const scenes = [
        mkScene({ id: 's1', order: 0, durationSec: 4, videoAssetId: 'a1' }),
        mkScene({ id: 's2', order: 1, durationSec: 5, videoAssetId: 'a2' }),
        mkScene({ id: 's3', order: 2, durationSec: 4 }), // no asset
    ];
    const lookup = (id) => id === 'a1' ? 'https://cdn/a1.mp4' : id === 'a2' ? 'https://cdn/a2.mp4' : undefined;
    const t = (0, scene_integration_1.buildTimelineFromProjectScenes)({
        timelineId: 'tl', projectId: 'p', scenes, aspectRatio: '9:16',
        assetLookup: lookup,
    });
    strict_1.default.equal(t.clips[0].sourceUrl, 'https://cdn/a1.mp4');
    strict_1.default.equal(t.clips[1].sourceUrl, 'https://cdn/a2.mp4');
    strict_1.default.equal(t.clips[2].sourceUrl, undefined);
});
(0, harness_1.test)('integration: missing video → no sourceUrl on the clip', () => {
    const scenes = [mkScene({ id: 's1', order: 0, durationSec: 5 })];
    const t = (0, scene_integration_1.buildTimelineFromProjectScenes)({
        timelineId: 'tl', projectId: 'p', scenes, aspectRatio: '9:16',
    });
    strict_1.default.equal(t.clips[0].sourceUrl, undefined);
});
(0, harness_1.test)('integration: transition follows scene.transitionIn', () => {
    const scenes = [
        mkScene({ id: 's1', order: 0, durationSec: 4, transitionIn: 'fade' }),
        mkScene({ id: 's2', order: 1, durationSec: 5, transitionIn: 'dissolve' }),
        mkScene({ id: 's3', order: 2, durationSec: 4 }),
    ];
    const t = (0, scene_integration_1.buildTimelineFromProjectScenes)({
        timelineId: 'tl', projectId: 'p', scenes, aspectRatio: '9:16',
    });
    strict_1.default.equal(t.clips[0].transition, 'fade');
    strict_1.default.equal(t.clips[1].transition, 'dissolve');
    strict_1.default.equal(t.clips[2].transition, undefined);
});
(0, harness_1.test)('integration: scene order is preserved regardless of array order', () => {
    const scenes = [
        mkScene({ id: 's4', order: 3, durationSec: 4 }),
        mkScene({ id: 's2', order: 1, durationSec: 5 }),
        mkScene({ id: 's1', order: 0, durationSec: 4 }),
        mkScene({ id: 's3', order: 2, durationSec: 7 }),
    ];
    const t = (0, scene_integration_1.buildTimelineFromProjectScenes)({
        timelineId: 'tl', projectId: 'p', scenes, aspectRatio: '9:16',
    });
    strict_1.default.deepEqual(t.clips.map(c => c.sceneId), ['s1', 's2', 's3', 's4']);
});
// ── syncTimelineWithScenes ───────────────────────────────────────────────
function mkTimeline() {
    const clips = [
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
(0, harness_1.test)('integration: sync refreshes durations from scenes and recomputes starts', () => {
    const timeline = mkTimeline();
    const scenes = [
        mkScene({ id: 's1', durationSec: 6 }), // was 4
        mkScene({ id: 's2', durationSec: 5 }),
        mkScene({ id: 's3', durationSec: 9 }), // was 7
    ];
    const next = (0, scene_integration_1.syncTimelineWithScenes)({ timeline, scenes });
    strict_1.default.deepEqual(next.clips.map(c => c.duration), [6, 5, 9]);
    strict_1.default.deepEqual(next.clips.map(c => c.start), [0, 6, 11]);
    strict_1.default.equal(next.duration, 20);
});
(0, harness_1.test)('integration: sync propagates new sourceUrls when scenes gain videoAssetId', () => {
    const timeline = mkTimeline();
    const lookup = (id) => id === 'a1' ? 'https://cdn/a1.mp4' : id === 'a2' ? 'https://cdn/a2.mp4' : undefined;
    const scenes = [
        mkScene({ id: 's1', durationSec: 4, videoAssetId: 'a1' }),
        mkScene({ id: 's2', durationSec: 5 }),
        mkScene({ id: 's3', durationSec: 7, videoAssetId: 'a2' }),
    ];
    const next = (0, scene_integration_1.syncTimelineWithScenes)({ timeline, scenes, assetLookup: lookup });
    strict_1.default.equal(next.clips[0].sourceUrl, 'https://cdn/a1.mp4');
    strict_1.default.equal(next.clips[1].sourceUrl, undefined);
    strict_1.default.equal(next.clips[2].sourceUrl, 'https://cdn/a2.mp4');
});
(0, harness_1.test)('integration: sync removes sourceUrl when scene loses its asset', () => {
    const timeline = {
        ...mkTimeline(),
        clips: [
            { id: 'c1', sceneId: 's1', start: 0, duration: 4, sourceUrl: 'https://old/1.mp4' },
            { id: 'c2', sceneId: 's2', start: 4, duration: 5, sourceUrl: 'https://old/2.mp4' },
        ],
    };
    const scenes = [mkScene({ id: 's1', durationSec: 4 }), mkScene({ id: 's2', durationSec: 5 })];
    const next = (0, scene_integration_1.syncTimelineWithScenes)({ timeline, scenes });
    strict_1.default.equal(next.clips[0].sourceUrl, undefined);
    strict_1.default.equal(next.clips[1].sourceUrl, undefined);
});
(0, harness_1.test)('integration: sync drops clips whose scene no longer exists', () => {
    const timeline = mkTimeline(); // s1, s2, s3
    const scenes = [mkScene({ id: 's1', durationSec: 4 }), mkScene({ id: 's3', durationSec: 7 })]; // s2 removed
    const next = (0, scene_integration_1.syncTimelineWithScenes)({ timeline, scenes });
    strict_1.default.deepEqual(next.clips.map(c => c.sceneId), ['s1', 's3']);
    strict_1.default.deepEqual(next.clips.map(c => c.start), [0, 4]);
    strict_1.default.equal(next.duration, 11);
});
(0, harness_1.test)('integration: sync preserves the user-chosen clip order', () => {
    const timeline = {
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
    const next = (0, scene_integration_1.syncTimelineWithScenes)({ timeline, scenes });
    strict_1.default.deepEqual(next.clips.map(c => c.sceneId), ['s3', 's1', 's2']);
    strict_1.default.deepEqual(next.clips.map(c => c.start), [0, 7, 11]);
    strict_1.default.equal(next.duration, 16);
});
(0, harness_1.test)('integration: sync refreshes transition from scene.transitionIn', () => {
    const timeline = {
        ...mkTimeline(),
        clips: [
            { id: 'c1', sceneId: 's1', start: 0, duration: 4, transition: 'cut' },
        ],
    };
    const scenes = [mkScene({ id: 's1', durationSec: 4, transitionIn: 'fade' })];
    const next = (0, scene_integration_1.syncTimelineWithScenes)({ timeline, scenes });
    strict_1.default.equal(next.clips[0].transition, 'fade');
});
(0, harness_1.test)('integration: empty scenes produces an empty timeline', () => {
    const timeline = mkTimeline();
    const next = (0, scene_integration_1.syncTimelineWithScenes)({ timeline, scenes: [] });
    strict_1.default.equal(next.clips.length, 0);
    strict_1.default.equal(next.duration, 0);
});
(0, harness_1.test)('integration: buildTimelineFromProjectScenes with empty scenes → empty timeline', () => {
    const t = (0, scene_integration_1.buildTimelineFromProjectScenes)({
        timelineId: 'tl', projectId: 'p', scenes: [], aspectRatio: '9:16',
    });
    strict_1.default.equal(t.clips.length, 0);
    strict_1.default.equal(t.duration, 0);
});
// ── end-to-end ───────────────────────────────────────────────────────────
(0, harness_1.test)('integration: end-to-end Creative Director output (4 scenes 20s) maps to 4 clips 20s', () => {
    // Mirror the Phase 5 brief-parser output shape.
    const scenes = [
        mkScene({ id: 's1', order: 0, durationSec: 4, status: 'ready', videoAssetId: 'a1', transitionIn: 'cut' }),
        mkScene({ id: 's2', order: 1, durationSec: 5, status: 'generating_video', videoAssetId: 'a2', transitionIn: 'cut' }),
        mkScene({ id: 's3', order: 2, durationSec: 7, status: 'prompt_ready' }),
        mkScene({ id: 's4', order: 3, durationSec: 4, status: 'failed' }),
    ];
    const lookup = (id) => id === 'a1' ? 'https://cdn/a1.mp4' : id === 'a2' ? 'https://cdn/a2.mp4' : undefined;
    const t = (0, scene_integration_1.buildTimelineFromProjectScenes)({
        timelineId: 'tl', projectId: 'p', scenes, aspectRatio: '9:16', assetLookup: lookup,
    });
    // Duration math
    strict_1.default.equal(t.duration, 20);
    strict_1.default.deepEqual(t.clips.map(c => c.start), [0, 4, 9, 16]);
    // Source URLs: only s1 and s2 have assets
    strict_1.default.equal(t.clips[0].sourceUrl, 'https://cdn/a1.mp4');
    strict_1.default.equal(t.clips[1].sourceUrl, 'https://cdn/a2.mp4');
    strict_1.default.equal(t.clips[2].sourceUrl, undefined);
    strict_1.default.equal(t.clips[3].sourceUrl, undefined);
    // Status mapping for legend
    strict_1.default.equal((0, scene_integration_1.getSceneVideoStatus)(scenes[0]), 'ready');
    strict_1.default.equal((0, scene_integration_1.getSceneVideoStatus)(scenes[1]), 'generating');
    strict_1.default.equal((0, scene_integration_1.getSceneVideoStatus)(scenes[2]), 'generating');
    strict_1.default.equal((0, scene_integration_1.getSceneVideoStatus)(scenes[3]), 'failed');
});
