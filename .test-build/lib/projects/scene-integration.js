"use strict";
/**
 * Scene ↔ Timeline integration helpers — Phase 6D.
 *
 * Scene is the source of truth for: title, description, prompt, negativePrompt,
 * duration, aspectRatio, metadata.
 *
 * Timeline adds: start, sourceUrl, transition, volume, muted.
 *
 * These helpers keep that boundary clean so the Timeline UI never has to
 * inspect Scene internals directly.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSceneVideoStatus = getSceneVideoStatus;
exports.getSceneStatusLabel = getSceneStatusLabel;
exports.resolveSceneVideoUrl = resolveSceneVideoUrl;
exports.buildSourceUrlFor = buildSourceUrlFor;
exports.buildTimelineFromProjectScenes = buildTimelineFromProjectScenes;
exports.syncTimelineWithScenes = syncTimelineWithScenes;
const timeline_1 = require("./timeline");
/**
 * Maps Scene.status (the full lifecycle) to the four buckets the
 * Timeline UI exposes to the user.
 *
 * Mapping rationale:
 *   - pending             → "○ Pending"   (nothing started yet)
 *   - prompt_ready        → "⏳ Generating" (Creative Director finished, no asset yet)
 *   - generating_keyframe → "⏳ Generating"
 *   - keyframe_ready      → "⏳ Generating" (still need video)
 *   - generating_video    → "⏳ Generating"
 *   - video_ready         → "✓ Ready"     (clip source available)
 *   - ready               → "✓ Ready"
 *   - failed              → "⚠ Failed"
 */
function getSceneVideoStatus(scene) {
    const s = scene.status;
    switch (s) {
        case 'pending':
            return 'pending';
        case 'prompt_ready':
        case 'generating_keyframe':
        case 'keyframe_ready':
        case 'generating_video':
            return 'generating';
        case 'video_ready':
        case 'ready':
            return 'ready';
        case 'failed':
            return 'failed';
        default:
            return 'pending';
    }
}
function getSceneStatusLabel(scene) {
    switch (getSceneVideoStatus(scene)) {
        case 'pending': return '○ Pending';
        case 'generating': return '⏳ Generating';
        case 'ready': return '✓ Ready';
        case 'failed': return '⚠ Failed';
    }
}
/**
 * Resolve a scene's video URL.
 *
 * Today the project has no Asset store; `videoAssetId` is set as a
 * placeholder by `/api/studio/.../scenes/[id]/video`. To support both
 * the current state and a future where assets live in a real store,
 * the caller passes an `assetLookup` that knows how to map an ID to
 * a URL. Without a lookup, the function returns `undefined` and the
 * Timeline UI shows the "no video" placeholder.
 *
 * When the asset store ships, callers can pass `getAssetUrl` here
 * without changing the timeline layer.
 */
function resolveSceneVideoUrl(scene, lookup) {
    if (!scene.videoAssetId)
        return undefined;
    if (!lookup)
        return undefined;
    return lookup(scene.videoAssetId);
}
// ── Source-URL builder for `buildTimelineFromScenes` ─────────────────────
/**
 * Build the `sourceUrlFor` callback that `buildTimelineFromScenes`
 * expects. Returns a function that, given a sceneId, returns the
 * scene's resolved video URL (or undefined when no asset is bound).
 */
function buildSourceUrlFor(scenes, lookup) {
    const byId = new Map();
    for (const s of scenes)
        byId.set(s.id, s);
    return (sceneId) => {
        const scene = byId.get(sceneId);
        if (!scene)
            return undefined;
        return resolveSceneVideoUrl(scene, lookup);
    };
}
/**
 * Build a timeline from the project's scenes and propagate each
 * scene's resolved video URL into its corresponding clip. This is the
 * single integration point between the Scenes layer and the
 * Timeline layer.
 */
function buildTimelineFromProjectScenes(opts) {
    return (0, timeline_1.buildTimelineFromScenes)({
        timelineId: opts.timelineId,
        projectId: opts.projectId,
        scenes: opts.scenes,
        aspectRatio: opts.aspectRatio,
        fps: opts.fps,
        sourceUrlFor: buildSourceUrlFor(opts.scenes, opts.assetLookup),
    });
}
// ── Sync helper: merge latest scene info into existing clips ─────────────
/**
 * Re-sync an existing timeline's clips with the latest scene info:
 *   - clip.duration follows scene.durationSec
 *   - clip.sourceUrl follows resolveSceneVideoUrl(scene, lookup)
 *   - clip.transition follows scene.transitionIn
 *   - starts are recomputed to stay sequential
 *
 * Order is preserved (the user's drag-reorder is not undone). Clips
 * whose sceneId is no longer present in the scenes list are dropped.
 * Scenes not yet represented in the timeline are NOT auto-appended
 * (that's an explicit user action to avoid surprise reordering).
 */
function syncTimelineWithScenes(opts) {
    const { timeline, scenes, assetLookup } = opts;
    const bySceneId = new Map();
    for (const s of scenes)
        bySceneId.set(s.id, s);
    const keptClips = [];
    for (const clip of timeline.clips) {
        const scene = bySceneId.get(clip.sceneId);
        if (!scene)
            continue; // drop clips whose scene no longer exists
        const url = resolveSceneVideoUrl(scene, assetLookup);
        const next = {
            ...clip,
            duration: scene.durationSec,
            transition: scene.transitionIn ?? clip.transition,
        };
        if (url)
            next.sourceUrl = url;
        else
            delete next.sourceUrl;
        keptClips.push(next);
    }
    let acc = 0;
    const resequenced = keptClips.map((c) => {
        const updated = { ...c, start: acc };
        acc += c.duration;
        return updated;
    });
    return {
        ...timeline,
        clips: resequenced,
        duration: acc,
    };
}
