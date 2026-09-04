"use strict";
/**
 * Timeline model — Phase 6A baseline.
 *
 * IMPORTANT: This is a NEW layer, sitting alongside `TimelineState` (which
 * already exists inside `Project.timeline` from Phase 1). The legacy
 * `TimelineState` is kept untouched so existing projects continue to
 * work. Future phases will migrate `TimelineState` → `Timeline`.
 *
 * Scope of Phase 6A: data model + deterministic builder functions. No UI,
 * no ffmpeg, no jobs, no rendering.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTimeline = validateTimeline;
exports.recomputeStarts = recomputeStarts;
exports.computeTotalDuration = computeTotalDuration;
exports.buildTimelineFromScenes = buildTimelineFromScenes;
exports.emptyTimeline = emptyTimeline;
function validateTimeline(timeline) {
    const errors = [];
    if (timeline.duration <= 0) {
        errors.push({ kind: 'invalid_duration', message: `timeline.duration must be > 0 (got ${timeline.duration})` });
    }
    const seen = new Set();
    timeline.clips.forEach((clip, index) => {
        if (clip.duration <= 0) {
            errors.push({
                kind: 'invalid_duration_clip',
                message: `clip[${index}] duration must be > 0`,
                clipId: clip.id,
                index,
            });
        }
        if (clip.start < 0) {
            errors.push({
                kind: 'negative_start',
                message: `clip[${index}] start must be >= 0`,
                clipId: clip.id,
                index,
            });
        }
        if (seen.has(clip.sceneId)) {
            errors.push({
                kind: 'unknown_scene',
                message: `clip[${index}] duplicates sceneId ${clip.sceneId}`,
                clipId: clip.id,
                index,
            });
        }
        seen.add(clip.sceneId);
    });
    // overlap detection: sort by start and check adjacent gaps
    const sorted = [...timeline.clips].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const prevEnd = prev.start + prev.duration;
        if (curr.start < prevEnd) {
            errors.push({
                kind: 'overlap',
                message: `clip ${curr.id} (start ${curr.start}s) overlaps with ${prev.id} (ends at ${prevEnd}s)`,
                clipId: curr.id,
            });
        }
    }
    return { ok: errors.length === 0, errors };
}
// ── Builder ──────────────────────────────────────────────────────────────
function recomputeStarts(clips) {
    const sorted = [...clips].sort((a, b) => a.start - b.start);
    let acc = 0;
    return sorted.map((clip) => {
        const next = { ...clip, start: acc };
        acc += clip.duration;
        return next;
    });
}
function computeTotalDuration(clips) {
    if (clips.length === 0)
        return 0;
    return clips.reduce((sum, c) => sum + c.duration, 0);
}
/**
 * Build a deterministic timeline from a set of Scenes.
 *
 * The clips are ordered by Scene.order. Each clip's `start` is the sum
 * of previous clips' durations, and `duration` is the scene's
 * `durationSec`. Scene transitions are preserved.
 *
 * If a scene has no usable duration (≤ 0), it is skipped — this keeps
 * the timeline total aligned with the sum of valid scenes.
 */
function buildTimelineFromScenes(opts) {
    const fps = opts.fps ?? 30;
    const sortedScenes = [...opts.scenes].sort((a, b) => a.order - b.order);
    const clips = [];
    let acc = 0;
    for (const scene of sortedScenes) {
        if (scene.durationSec <= 0)
            continue;
        const clip = {
            id: `clip_${scene.id}`,
            sceneId: scene.id,
            start: acc,
            duration: scene.durationSec,
            transition: scene.transitionIn,
        };
        const url = opts.sourceUrlFor?.(scene.id);
        if (url)
            clip.sourceUrl = url;
        clips.push(clip);
        acc += scene.durationSec;
    }
    const now = new Date().toISOString();
    return {
        id: opts.timelineId,
        projectId: opts.projectId,
        duration: acc,
        clips,
        aspectRatio: opts.aspectRatio,
        fps,
        createdAt: now,
        updatedAt: now,
    };
}
function emptyTimeline(opts) {
    const now = new Date().toISOString();
    return {
        id: opts.timelineId,
        projectId: opts.projectId,
        duration: 0,
        clips: [],
        aspectRatio: opts.aspectRatio,
        fps: opts.fps ?? 30,
        createdAt: now,
        updatedAt: now,
    };
}
