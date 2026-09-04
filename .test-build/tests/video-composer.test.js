"use strict";
/**
 * Unit tests for Phase 6E — FFmpeg command builder + composer orchestrator.
 *
 * Coverage:
 *   - needsXfade / hasOnlyCuts / compositionStrategy
 *   - buildConcatCommand produces correct argv for an all-cuts timeline
 *   - buildXfadeCommand produces a valid filter_complex for fade / dissolve / mixed
 *   - buildConcatListContent quotes paths correctly
 *   - buildFfmpegCommand auto-routes between the two paths
 *   - validateCompositionInput rejects invalid timelines + clips without sourceUrl
 *   - composeTimeline resolves local + data: sources and assembles the command
 *   - validateCompositionInput rejects bad aspect ratios
 *   - clipsByTransition classification
 *
 * NO real ffmpeg is invoked. We only test the command-builder logic.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const harness_1 = require("./harness");
const ffmpeg_1 = require("../lib/video/ffmpeg");
const composer_1 = require("../lib/video/composer");
// ── helpers ──────────────────────────────────────────────────────────────
function mkClip(id, start, duration, sourceUrl, transition) {
    return { id, sceneId: `s_${id}`, start, duration, sourceUrl, transition };
}
function mkTimeline(clips, aspectRatio = '9:16', fps = 30) {
    return {
        id: 'tl_test',
        projectId: 'p_test',
        duration: clips.reduce((acc, c) => acc + c.duration, 0),
        clips,
        aspectRatio,
        fps,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    };
}
// ── transitions / strategy ──────────────────────────────────────────────
(0, harness_1.test)('ffmpeg: needsXfade returns false for all-cuts timeline', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4', 'cut'),
    ]);
    strict_1.default.equal((0, ffmpeg_1.needsXfade)(t), false);
});
(0, harness_1.test)('ffmpeg: needsXfade returns true when ANY clip is fade/dissolve', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4', 'fade'),
        mkClip('c3', 9, 7, 'https://cdn/3.mp4', 'cut'),
    ]);
    strict_1.default.equal((0, ffmpeg_1.needsXfade)(t), true);
});
(0, harness_1.test)('ffmpeg: hasOnlyCuts is the inverse of needsXfade', () => {
    const a = mkTimeline([mkClip('c1', 0, 4, 'https://cdn/1.mp4')]);
    const b = mkTimeline([mkClip('c1', 0, 4, 'https://cdn/1.mp4', 'fade')]);
    strict_1.default.equal((0, ffmpeg_1.hasOnlyCuts)(a), true);
    strict_1.default.equal((0, ffmpeg_1.hasOnlyCuts)(b), false);
});
(0, harness_1.test)('ffmpeg: xfadeTransitionName returns null for cut, names for fade/dissolve', () => {
    strict_1.default.equal((0, ffmpeg_1.xfadeTransitionName)('cut'), null);
    strict_1.default.equal((0, ffmpeg_1.xfadeTransitionName)('fade'), 'fade');
    strict_1.default.equal((0, ffmpeg_1.xfadeTransitionName)('dissolve'), 'dissolve');
    strict_1.default.equal((0, ffmpeg_1.xfadeTransitionName)(undefined), null);
});
(0, harness_1.test)('ffmpeg: compositionStrategy picks concat for cuts, xfade otherwise', () => {
    const a = mkTimeline([mkClip('c1', 0, 4, 'https://cdn/1.mp4')]);
    const b = mkTimeline([mkClip('c1', 0, 4, 'https://cdn/1.mp4', 'fade')]);
    strict_1.default.equal((0, composer_1.compositionStrategy)({ timeline: a }), 'concat');
    strict_1.default.equal((0, composer_1.compositionStrategy)({ timeline: b }), 'xfade');
});
(0, harness_1.test)('ffmpeg: aspectDimensions returns correct pixel sizes', () => {
    strict_1.default.deepEqual((0, ffmpeg_1.aspectDimensions)('9:16'), { width: 1080, height: 1920 });
    strict_1.default.deepEqual((0, ffmpeg_1.aspectDimensions)('1:1'), { width: 1080, height: 1080 });
    strict_1.default.deepEqual((0, ffmpeg_1.aspectDimensions)('16:9'), { width: 1920, height: 1080 });
    strict_1.default.equal((0, ffmpeg_1.aspectDimensions)('4:5'), null);
});
// ── concat demuxer ───────────────────────────────────────────────────────
(0, harness_1.test)('concat: produces -f concat -safe 0 -i with -c copy for all-cuts', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4'),
        mkClip('c3', 9, 7, 'https://cdn/3.mp4'),
    ]);
    const r = (0, ffmpeg_1.buildConcatCommand)({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4', '/tmp/c.mp4'],
        outputPath: '/tmp/out.mp4',
        concatListPath: '/tmp/_list.txt',
    });
    strict_1.default.equal(r.ok, true);
    strict_1.default.equal(r.path, 'concat');
    const args = r.command.args;
    strict_1.default.deepEqual(args.slice(0, 6), ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat']);
    strict_1.default.ok(args.includes('-safe'));
    strict_1.default.ok(args.includes('0'));
    strict_1.default.ok(args.includes('/tmp/_list.txt'));
    strict_1.default.ok(args.includes('-c'));
    strict_1.default.ok(args.includes('copy'));
    strict_1.default.ok(args.includes('-an'));
    strict_1.default.ok(args.includes('-movflags'));
    strict_1.default.ok(args.includes('+faststart'));
    strict_1.default.equal(args[args.length - 1], '/tmp/out.mp4');
});
(0, harness_1.test)('concat: rejects timeline containing fade/dissolve', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4', 'fade'),
    ]);
    const r = (0, ffmpeg_1.buildConcatCommand)({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4'],
        outputPath: '/tmp/out.mp4',
        concatListPath: '/tmp/_list.txt',
    });
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.errors.some(e => e.includes('non-cut transitions')));
});
(0, harness_1.test)('concat: rejects clipPaths length mismatch', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4'),
    ]);
    const r = (0, ffmpeg_1.buildConcatCommand)({
        timeline: t,
        clipPaths: ['/tmp/only_one.mp4'],
        outputPath: '/tmp/out.mp4',
        concatListPath: '/tmp/_list.txt',
    });
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.errors.some(e => e.includes('does not match')));
});
(0, harness_1.test)('concat: buildConcatListContent quotes single-quote paths correctly', () => {
    const content = (0, ffmpeg_1.buildConcatListContent)(["/tmp/a.mp4", "/tmp/b's.mp4"]);
    strict_1.default.ok(content.includes("file '/tmp/a.mp4'"));
    // single quote escaped via `'\''` shell-style
    strict_1.default.ok(content.includes("'/tmp/b'\\''s.mp4'"));
});
// ── xfade filter ─────────────────────────────────────────────────────────
(0, harness_1.test)('xfade: builds filter_complex with scale+fps+pad per clip', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4', 'fade'),
    ]);
    const r = (0, ffmpeg_1.buildXfadeCommand)({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4'],
        outputPath: '/tmp/out.mp4',
    });
    strict_1.default.equal(r.ok, true);
    strict_1.default.equal(r.path, 'xfade');
    const args = r.command.args;
    // -i inputs
    strict_1.default.ok(args.includes('-i') && args.includes('/tmp/a.mp4'));
    strict_1.default.ok(args.includes('-i') && args.includes('/tmp/b.mp4'));
    // filter_complex present
    const fcIdx = args.indexOf('-filter_complex');
    strict_1.default.ok(fcIdx >= 0);
    const fc = args[fcIdx + 1];
    strict_1.default.ok(fc.includes('scale=1080:1920'));
    strict_1.default.ok(fc.includes('fps=30'));
    strict_1.default.ok(fc.includes('format=yuv420p'));
    // transition + offset are present
    strict_1.default.ok(fc.includes('transition=fade'));
    strict_1.default.ok(fc.includes('offset='));
    // encoding args
    strict_1.default.ok(args.includes('-c:v'));
    strict_1.default.ok(args.includes('libx264'));
    strict_1.default.ok(args.includes('-preset'));
    strict_1.default.ok(args.includes('veryfast'));
});
(0, harness_1.test)('xfade: dissolve uses transition=dissolve', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4', 'dissolve'),
    ]);
    const r = (0, ffmpeg_1.buildXfadeCommand)({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4'],
        outputPath: '/tmp/out.mp4',
    });
    strict_1.default.equal(r.ok, true);
    const fc = r.command.args[argsIndex(r.command.args, '-filter_complex') + 1];
    strict_1.default.ok(fc.includes('transition=dissolve'));
});
(0, harness_1.test)('xfade: mixed (cut + fade + cut) preserves correct labels and xfade count', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4', 'cut'),
        mkClip('c3', 9, 7, 'https://cdn/3.mp4', 'fade'),
        mkClip('c4', 16, 4, 'https://cdn/4.mp4'),
    ]);
    const r = (0, ffmpeg_1.buildXfadeCommand)({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4', '/tmp/c.mp4', '/tmp/d.mp4'],
        outputPath: '/tmp/out.mp4',
    });
    strict_1.default.equal(r.ok, true);
    const fc = r.command.args[argsIndex(r.command.args, '-filter_complex') + 1];
    // Chain: v0 -> concat(v0,v1)->x1 -> xfade(x1,v2)->x2 -> concat(x2,v3)->x3
    // = 1 xfade (c2 -> c3) + 2 concats (c1+c2, x2+c4)
    const xfadeCount = (fc.match(/xfade=/g) ?? []).length;
    const concatCount = (fc.match(/concat=n=2/g) ?? []).length;
    strict_1.default.equal(xfadeCount, 1);
    strict_1.default.equal(concatCount, 2);
});
(0, harness_1.test)('xfade: rejects empty timeline', () => {
    const t = mkTimeline([], '9:16');
    const r = (0, ffmpeg_1.buildXfadeCommand)({
        timeline: t,
        clipPaths: [],
        outputPath: '/tmp/out.mp4',
    });
    strict_1.default.equal(r.ok, false);
});
(0, harness_1.test)('xfade: uses correct dimensions for 16:9', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4', 'fade'),
    ], '16:9');
    const r = (0, ffmpeg_1.buildXfadeCommand)({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4'],
        outputPath: '/tmp/out.mp4',
    });
    const fc = r.command.args[argsIndex(r.command.args, '-filter_complex') + 1];
    strict_1.default.ok(fc.includes('scale=1920:1080'));
});
(0, harness_1.test)('xfade: rejects unknown aspect ratio', () => {
    const t = mkTimeline([mkClip('c1', 0, 4, 'https://cdn/1.mp4'), mkClip('c2', 4, 5, 'https://cdn/2.mp4', 'fade')], '4:5');
    const r = (0, ffmpeg_1.buildXfadeCommand)({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4'],
        outputPath: '/tmp/out.mp4',
    });
    strict_1.default.equal(r.ok, false);
});
// ── master entry point ───────────────────────────────────────────────────
(0, harness_1.test)('master: routes to concat when timeline has only cuts', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4'),
    ]);
    const r = (0, ffmpeg_1.buildFfmpegCommand)({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4'],
        outputPath: '/tmp/out.mp4',
        concatListPath: '/tmp/_list.txt',
    });
    strict_1.default.equal(r.ok, true);
    strict_1.default.equal(r.path, 'concat');
});
(0, harness_1.test)('master: routes to xfade when timeline has fade', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4', 'fade'),
    ]);
    const r = (0, ffmpeg_1.buildFfmpegCommand)({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4'],
        outputPath: '/tmp/out.mp4',
    });
    strict_1.default.equal(r.ok, true);
    strict_1.default.equal(r.path, 'xfade');
});
(0, harness_1.test)('master: requires concatListPath for the concat path', () => {
    const t = mkTimeline([mkClip('c1', 0, 4, 'https://cdn/1.mp4')]);
    const r = (0, ffmpeg_1.buildFfmpegCommand)({
        timeline: t,
        clipPaths: ['/tmp/a.mp4'],
        outputPath: '/tmp/out.mp4',
    });
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.errors.some(e => e.includes('concatListPath')));
});
(0, harness_1.test)('master: rejects timeline with overlap', () => {
    const t = mkTimeline([
        { id: 'c1', sceneId: 's1', start: 0, duration: 5, sourceUrl: 'https://cdn/1.mp4' },
        { id: 'c2', sceneId: 's2', start: 4, duration: 5, sourceUrl: 'https://cdn/2.mp4' },
    ]);
    const r = (0, ffmpeg_1.buildFfmpegCommand)({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4'],
        outputPath: '/tmp/out.mp4',
    });
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.errors.some(e => e.includes('overlap')));
});
(0, harness_1.test)('master: rejects unsupported aspect ratio', () => {
    const t = mkTimeline([mkClip('c1', 0, 4, 'https://cdn/1.mp4')], '4:5');
    const r = (0, ffmpeg_1.buildFfmpegCommand)({
        timeline: t,
        clipPaths: ['/tmp/a.mp4'],
        outputPath: '/tmp/out.mp4',
        concatListPath: '/tmp/_list.txt',
    });
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.errors.some(e => e.includes('aspect ratio')));
});
// ── composer orchestration ───────────────────────────────────────────────
(0, harness_1.test)('composer: isAcceptableSource accepts http(s), data:, file://, and non-empty paths', () => {
    strict_1.default.equal((0, composer_1.isAcceptableSource)('https://cdn/x.mp4'), true);
    strict_1.default.equal((0, composer_1.isAcceptableSource)('http://x/y'), true);
    strict_1.default.equal((0, composer_1.isAcceptableSource)('data:video/mp4;base64,AAAA'), true);
    strict_1.default.equal((0, composer_1.isAcceptableSource)('file:///tmp/x.mp4'), true);
    strict_1.default.equal((0, composer_1.isAcceptableSource)('/tmp/x.mp4'), true);
    strict_1.default.equal((0, composer_1.isAcceptableSource)(''), false);
});
(0, harness_1.test)('composer: validateCompositionInput rejects timeline with clip without sourceUrl', () => {
    const t = mkTimeline([
        { id: 'c1', sceneId: 's1', start: 0, duration: 4 },
        { id: 'c2', sceneId: 's2', start: 4, duration: 5 },
    ]);
    const errors = (0, composer_1.validateCompositionInput)({
        timeline: t,
        outputPath: '/tmp/out.mp4',
        workDir: '/tmp/work',
    });
    strict_1.default.ok(errors.some(e => e.includes('no usable sourceUrl')));
});
(0, harness_1.test)('composer: validateCompositionInput rejects unknown aspect ratio', () => {
    const t = mkTimeline([mkClip('c1', 0, 4, 'https://cdn/1.mp4')], '21:9');
    const errors = (0, composer_1.validateCompositionInput)({
        timeline: t,
        outputPath: '/tmp/out.mp4',
        workDir: '/tmp/work',
    });
    strict_1.default.ok(errors.some(e => e.includes('aspect ratio')));
});
(0, harness_1.test)('composer: validateCompositionInput rejects overlapping clips', () => {
    const t = mkTimeline([
        { id: 'c1', sceneId: 's1', start: 0, duration: 5, sourceUrl: 'https://cdn/1.mp4' },
        { id: 'c2', sceneId: 's2', start: 4, duration: 5, sourceUrl: 'https://cdn/2.mp4' },
    ]);
    const errors = (0, composer_1.validateCompositionInput)({
        timeline: t,
        outputPath: '/tmp/out.mp4',
        workDir: '/tmp/work',
    });
    strict_1.default.ok(errors.some(e => e.toLowerCase().includes('overlap')));
});
(0, harness_1.test)('composer: validateCompositionInput accepts a clean timeline', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4'),
    ]);
    const errors = (0, composer_1.validateCompositionInput)({
        timeline: t,
        outputPath: '/tmp/out.mp4',
        workDir: '/tmp/work',
    });
    strict_1.default.equal(errors.length, 0);
});
(0, harness_1.test)('composer: composeTimeline resolves data: sources and builds concat command', async () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'data:video/mp4;base64,AAAAAA=='),
        mkClip('c2', 4, 5, 'data:video/mp4;base64,AAAAAA=='),
    ]);
    const written = [];
    const r = await (0, composer_1.composeTimeline)({
        timeline: t,
        outputPath: '/tmp/out.mp4',
        workDir: '/tmp/work',
        writeFile: async (path, data) => { written.push({ path, data }); },
        mkdir: async () => undefined,
    });
    strict_1.default.equal(r.ok, true);
    strict_1.default.equal(r.composition.path, 'concat');
    strict_1.default.equal(r.composition.resolvedSources.length, 2);
    strict_1.default.ok(r.composition.command.args.includes('-c'));
    strict_1.default.ok(r.composition.command.args.includes('copy'));
    strict_1.default.equal(written.length, 2);
    strict_1.default.ok(r.composition.concatListContent !== undefined);
});
(0, harness_1.test)('composer: composeTimeline picks xfade path when transition != cut', async () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'data:video/mp4;base64,AAAAAA=='),
        mkClip('c2', 4, 5, 'data:video/mp4;base64,AAAAAA==', 'fade'),
    ]);
    const r = await (0, composer_1.composeTimeline)({
        timeline: t,
        outputPath: '/tmp/out.mp4',
        workDir: '/tmp/work',
        writeFile: async () => undefined,
        mkdir: async () => undefined,
    });
    strict_1.default.equal(r.ok, true);
    strict_1.default.equal(r.composition.path, 'xfade');
    strict_1.default.ok(r.composition.command.args.includes('libx264'));
});
(0, harness_1.test)('composer: composeTimeline surfaces HTTP failure', async () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4'),
    ]);
    const r = await (0, composer_1.composeTimeline)({
        timeline: t,
        outputPath: '/tmp/out.mp4',
        workDir: '/tmp/work',
        fetcher: (async () => new Response('not found', { status: 404 })),
        writeFile: async () => undefined,
        mkdir: async () => undefined,
    });
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.errors.some(e => e.includes('404') || e.toLowerCase().includes('fetch')));
});
(0, harness_1.test)('composer: composeTimeline uses local path when source is already a file', async () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, '/var/clips/c1.mp4'),
        mkClip('c2', 4, 5, '/var/clips/c2.mp4'),
    ]);
    const existing = new Set(['/var/clips/c1.mp4', '/var/clips/c2.mp4']);
    const r = await (0, composer_1.composeTimeline)({
        timeline: t,
        outputPath: '/tmp/out.mp4',
        workDir: '/tmp/work',
        fileExists: async (p) => existing.has(p),
        mkdir: async () => undefined,
    });
    strict_1.default.equal(r.ok, true);
    strict_1.default.equal(r.composition.resolvedSources[0].existed, true);
    strict_1.default.equal(r.composition.resolvedSources[0].localPath, '/var/clips/c1.mp4');
});
(0, harness_1.test)('composer: composeTimeline fails when local file is missing', async () => {
    const t = mkTimeline([mkClip('c1', 0, 4, '/var/clips/missing.mp4')]);
    const r = await (0, composer_1.composeTimeline)({
        timeline: t,
        outputPath: '/tmp/out.mp4',
        workDir: '/tmp/work',
        fileExists: async () => false,
        mkdir: async () => undefined,
    });
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.errors.some(e => e.toLowerCase().includes('not found')));
});
(0, harness_1.test)('composer: clipsByTransition classifies correctly', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'x'),
        mkClip('c2', 4, 5, 'x', 'fade'),
        mkClip('c3', 9, 7, 'x', 'dissolve'),
        mkClip('c4', 16, 4, 'x', 'cut'),
    ]);
    const grouped = (0, composer_1.clipsByTransition)({ timeline: t });
    strict_1.default.equal(grouped.cut.length, 2); // c1 (no transition) + c4
    strict_1.default.equal(grouped.fade.length, 1);
    strict_1.default.equal(grouped.dissolve.length, 1);
});
// ── helpers used by other tests ──────────────────────────────────────────
function argsIndex(args, key) {
    const idx = args.indexOf(key);
    if (idx < 0)
        throw new Error(`key not found: ${key}`);
    return idx;
}
(0, harness_1.test)('ffmpeg: VALID_ASPECTS contains 9:16, 1:1, 16:9', () => {
    strict_1.default.deepEqual([...ffmpeg_1.VALID_ASPECTS], ['9:16', '1:1', '16:9']);
});
