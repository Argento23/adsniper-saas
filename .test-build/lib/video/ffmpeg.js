"use strict";
/**
 * FFmpeg command builder — Phase 6E.
 *
 * This module is the SINGLE place where ffmpeg command lines are
 * assembled. No other file in the project should construct raw ffmpeg
 * invocations. All public functions are PURE (no I/O, no spawn) so
 * they can be unit-tested deterministically.
 *
 * Two rendering paths are supported:
 *
 *  1. **Concat demuxer** — when every clip uses `cut` transitions
 *     (or has no transition declared). The clips are streamed together
 *     WITHOUT re-encoding. Fast and lossless, but cannot express
 *     fades or dissolves.
 *
 *  2. **xfade filter** — when any clip uses `fade` or `dissolve`.
 *     All inputs are re-encoded into a single output stream with
 *     cross-fade transitions at the clip boundaries. Slower, but
 *     architecturally prepared for arbitrary transitions.
 *
 * Both paths output H.264 video + AAC audio at the timeline's FPS,
 * cropped/scaled to the timeline's aspect ratio.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FADE_DURATION_SEC = exports.MAX_FPS = exports.MIN_FPS = exports.DEFAULT_FPS = exports.VALID_ASPECTS = void 0;
exports.aspectDimensions = aspectDimensions;
exports.needsXfade = needsXfade;
exports.buildConcatCommand = buildConcatCommand;
exports.buildConcatListContent = buildConcatListContent;
exports.xfadeTransitionName = xfadeTransitionName;
exports.buildXfadeCommand = buildXfadeCommand;
exports.buildFfmpegCommand = buildFfmpegCommand;
exports.hasOnlyCuts = hasOnlyCuts;
exports.getClipCount = getClipCount;
exports.totalDuration = totalDuration;
exports._internal_clipIsCut = _internal_clipIsCut;
const timeline_1 = require("@/lib/projects/timeline");
// ── Constants ────────────────────────────────────────────────────────────
exports.VALID_ASPECTS = ['9:16', '1:1', '16:9'];
exports.DEFAULT_FPS = 30;
exports.MIN_FPS = 24;
exports.MAX_FPS = 60;
exports.FADE_DURATION_SEC = 0.5; // for fade transitions between clips
// ── Aspect → pixel size map ──────────────────────────────────────────────
const ASPECT_DIMENSIONS = {
    '9:16': { width: 1080, height: 1920 },
    '1:1': { width: 1080, height: 1080 },
    '16:9': { width: 1920, height: 1080 },
};
function aspectDimensions(aspect) {
    if (aspect in ASPECT_DIMENSIONS)
        return ASPECT_DIMENSIONS[aspect];
    return null;
}
// ── Helpers ──────────────────────────────────────────────────────────────
/**
 * Quoting for ffmpeg concat demuxer lists.
 * Each line of the list file must be a path, optionally prefixed with
 * `file ` and a duration. We emit the `file` form.
 */
function quoteForConcat(filePath) {
    // Replace single quotes with escaped form, wrap in single quotes.
    return `'${filePath.replace(/'/g, `'\\''`)}'`;
}
/**
 * Determines whether the timeline needs the xfade (re-encode) path or
 * can use the cheap concat demuxer path. We pick xfade when ANY clip
 * declares a non-cut transition.
 */
function needsXfade(timeline) {
    for (const clip of timeline.clips) {
        if (clip.transition && clip.transition !== 'cut')
            return true;
    }
    return false;
}
// ── Concat demuxer builder ───────────────────────────────────────────────
/**
 * Build a ffmpeg command using the **concat demuxer** (lossless,
 * no re-encode). Requires that every clip already has the right
 * resolution, fps, and codec — which we do NOT enforce here. This
 * path is the fastest and is the default when no transitions are
 * needed.
 *
 * The command uses:
 *   - `-f concat -safe 0 -i list.txt` to consume a concat list
 *   - `-c copy` to avoid re-encoding
 *   - `-an` to drop audio (Phase 6E MVP: video only)
 */
function buildConcatCommand(opts) {
    if (opts.clipPaths.length !== opts.timeline.clips.length) {
        return { ok: false, errors: [`clipPaths length (${opts.clipPaths.length}) does not match clips (${opts.timeline.clips.length})`] };
    }
    if (needsXfade(opts.timeline)) {
        return { ok: false, errors: ['timeline contains non-cut transitions; use xfade path instead'] };
    }
    const listContent = opts.clipPaths.map(quoteForConcat).join('\n') + '\n';
    const args = [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-f', 'concat',
        '-safe', '0',
        '-i', opts.concatListPath,
        '-c', 'copy',
        '-an',
        '-movflags', '+faststart',
        opts.outputPath,
    ];
    return {
        ok: true,
        path: 'concat',
        command: {
            args,
            outputPath: opts.outputPath,
            description: `ffmpeg concat (${opts.timeline.clips.length} clips, ${opts.timeline.duration.toFixed(2)}s, ${opts.timeline.aspectRatio})`,
        },
        // listContent is exposed via the args for callers that want to
        // write the concat list file themselves.
        errors: undefined,
    };
}
/**
 * Returns the textual content that must be written to
 * `concatListPath` for `buildConcatCommand` to succeed. Pure function,
 * easy to assert in tests.
 */
function buildConcatListContent(clipPaths) {
    return clipPaths.map(p => `file ${quoteForConcat(p)}\n`).join('');
}
// ── xfade filter builder ─────────────────────────────────────────────────
/**
 * Resolve a clip's transition to the corresponding xfade transition name.
 * Returns `null` for `cut` (no xfade needed at that boundary).
 */
function xfadeTransitionName(transition) {
    if (!transition || transition === 'cut')
        return null;
    if (transition === 'fade')
        return 'fade';
    if (transition === 'dissolve')
        return 'dissolve';
    return null;
}
/**
 * Build a ffmpeg command using the **xfade filter** (re-encodes
 * every input through a single filter graph, applying crossfades at
 * clip boundaries). Required when any clip uses `fade` or `dissolve`.
 *
 * The filter graph is constructed explicitly so each transition type
 * is honored at the right offset. The offset of each xfade is the
 * running end-of-clip minus the fade duration.
 */
function buildXfadeCommand(opts) {
    if (opts.clipPaths.length !== opts.timeline.clips.length) {
        return { ok: false, errors: [`clipPaths length (${opts.clipPaths.length}) does not match clips (${opts.timeline.clips.length})`] };
    }
    if (opts.timeline.clips.length === 0) {
        return { ok: false, errors: ['timeline has no clips'] };
    }
    const fadeSec = opts.fadeDurationSec ?? exports.FADE_DURATION_SEC;
    const dims = aspectDimensions(opts.timeline.aspectRatio);
    if (!dims) {
        return { ok: false, errors: [`unsupported aspect ratio: ${opts.timeline.aspectRatio}`] };
    }
    const fps = clampFps(opts.timeline.fps);
    const clips = opts.timeline.clips;
    const paths = opts.clipPaths;
    // Step 1: build the per-input scale/pad labels.
    //   [0:v] scale=...,setsar=1,format=yuv420p [v0];
    //   [1:v] ... [v1];
    //   ...
    const inputs = [];
    for (let i = 0; i < paths.length; i++) {
        inputs.push('-i', paths[i]);
    }
    const scaleLines = [];
    for (let i = 0; i < clips.length; i++) {
        const v = `v${i}`;
        scaleLines.push(`[${i}:v]scale=${dims.width}:${dims.height}:force_original_aspect_ratio=decrease,` +
            `pad=${dims.width}:${dims.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,` +
            `fps=${fps},format=yuv420p[${v}]`);
    }
    // Step 2: build the chain of xfades.
    //   We start with [v0] as the running stream, then for each
    //   subsequent clip apply xfade (or concat) with the right offset.
    let runningLabel = 'v0';
    let runningOffset = clips[0].duration;
    const filterParts = [...scaleLines];
    for (let i = 1; i < clips.length; i++) {
        const transition = clips[i].transition ?? 'cut';
        const nextLabel = `x${i}`;
        const transitionName = xfadeTransitionName(transition);
        if (transitionName === null) {
            // Pure cut — concat streams (no xfade needed).
            filterParts.push(`[${runningLabel}][v${i}]concat=n=2:v=1:a=0[${nextLabel}]`);
            runningOffset += clips[i].duration;
        }
        else {
            // Fade or dissolve.
            // xfade requires the OFFSET to be within the duration of the
            // current running stream. We pick (offset = end - fadeSec).
            const offset = Math.max(0, runningOffset - fadeSec);
            filterParts.push(`[${runningLabel}][v${i}]xfade=transition=${transitionName}:` +
                `duration=${fadeSec.toFixed(3)}:offset=${offset.toFixed(3)}[${nextLabel}]`);
            runningOffset += clips[i].duration - fadeSec;
        }
        runningLabel = nextLabel;
    }
    const filterComplex = filterParts.join(';');
    const args = [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        ...inputs,
        '-filter_complex', filterComplex,
        '-map', `[${runningLabel}]`,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '20',
        '-pix_fmt', 'yuv420p',
        '-r', String(fps),
        '-an',
        '-movflags', '+faststart',
        opts.outputPath,
    ];
    return {
        ok: true,
        path: 'xfade',
        command: {
            args,
            outputPath: opts.outputPath,
            description: `ffmpeg xfade (${clips.length} clips, ${opts.timeline.duration.toFixed(2)}s, ${opts.timeline.aspectRatio} @ ${fps}fps)`,
        },
    };
}
// ── Master entry point ───────────────────────────────────────────────────
/**
 * Build the right ffmpeg command for the given timeline. Picks the
 * concat or xfade path automatically based on the clips' transitions.
 *
 * Always validates the timeline first.
 */
function buildFfmpegCommand(opts) {
    const v = (0, timeline_1.validateTimeline)(opts.timeline);
    if (!v.ok) {
        return { ok: false, errors: v.errors.map(e => e.message) };
    }
    if (!exports.VALID_ASPECTS.includes(opts.timeline.aspectRatio)) {
        return { ok: false, errors: [`unsupported aspect ratio: ${opts.timeline.aspectRatio}`] };
    }
    if (opts.timeline.clips.length === 0) {
        return { ok: false, errors: ['timeline has no clips'] };
    }
    if (needsXfade(opts.timeline)) {
        return buildXfadeCommand(opts);
    }
    if (!opts.concatListPath) {
        return { ok: false, errors: ['concatListPath is required for the concat path'] };
    }
    return buildConcatCommand({
        timeline: opts.timeline,
        clipPaths: opts.clipPaths,
        outputPath: opts.outputPath,
        concatListPath: opts.concatListPath,
    });
}
// ── Utilities ────────────────────────────────────────────────────────────
function clampFps(fps) {
    if (!Number.isFinite(fps) || fps <= 0)
        return exports.DEFAULT_FPS;
    return Math.max(exports.MIN_FPS, Math.min(exports.MAX_FPS, Math.round(fps)));
}
function hasOnlyCuts(timeline) {
    return !needsXfade(timeline);
}
/**
 * Re-export the timeline's clip helper so callers can iterate without
 * importing the timeline module separately.
 */
function getClipCount(timeline) {
    return timeline.clips.length;
}
function totalDuration(timeline) {
    return timeline.duration;
}
function _internal_clipIsCut(clip) {
    return !clip.transition || clip.transition === 'cut';
}
