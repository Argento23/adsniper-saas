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

import assert from 'node:assert/strict';
import { test } from './harness';

import { Timeline, TimelineClip } from '../lib/projects/timeline';
import {
    buildConcatCommand,
    buildConcatListContent,
    buildFfmpegCommand,
    buildXfadeCommand,
    hasOnlyCuts,
    needsXfade,
    aspectDimensions,
    xfadeTransitionName,
    VALID_ASPECTS,
} from '../lib/video/ffmpeg';
import {
    composeTimeline,
    validateCompositionInput,
    isAcceptableSource,
    clipsByTransition,
    compositionStrategy,
} from '../lib/video/composer';

// ── helpers ──────────────────────────────────────────────────────────────
function mkClip(id: string, start: number, duration: number, sourceUrl: string, transition?: 'cut' | 'fade' | 'dissolve'): TimelineClip {
    return { id, sceneId: `s_${id}`, start, duration, sourceUrl, transition };
}

function mkTimeline(clips: TimelineClip[], aspectRatio = '9:16', fps = 30): Timeline {
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
test('ffmpeg: needsXfade returns false for all-cuts timeline', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4', 'cut'),
    ]);
    assert.equal(needsXfade(t), false);
});

test('ffmpeg: needsXfade returns true when ANY clip is fade/dissolve', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4', 'fade'),
        mkClip('c3', 9, 7, 'https://cdn/3.mp4', 'cut'),
    ]);
    assert.equal(needsXfade(t), true);
});

test('ffmpeg: hasOnlyCuts is the inverse of needsXfade', () => {
    const a = mkTimeline([mkClip('c1', 0, 4, 'https://cdn/1.mp4')]);
    const b = mkTimeline([mkClip('c1', 0, 4, 'https://cdn/1.mp4', 'fade')]);
    assert.equal(hasOnlyCuts(a), true);
    assert.equal(hasOnlyCuts(b), false);
});

test('ffmpeg: xfadeTransitionName returns null for cut, names for fade/dissolve', () => {
    assert.equal(xfadeTransitionName('cut'), null);
    assert.equal(xfadeTransitionName('fade'), 'fade');
    assert.equal(xfadeTransitionName('dissolve'), 'dissolve');
    assert.equal(xfadeTransitionName(undefined), null);
});

test('ffmpeg: compositionStrategy picks concat for cuts, xfade otherwise', () => {
    const a = mkTimeline([mkClip('c1', 0, 4, 'https://cdn/1.mp4')]);
    const b = mkTimeline([mkClip('c1', 0, 4, 'https://cdn/1.mp4', 'fade')]);
    assert.equal(compositionStrategy({ timeline: a }), 'concat');
    assert.equal(compositionStrategy({ timeline: b }), 'xfade');
});

test('ffmpeg: aspectDimensions returns correct pixel sizes', () => {
    assert.deepEqual(aspectDimensions('9:16'), { width: 1080, height: 1920 });
    assert.deepEqual(aspectDimensions('1:1'), { width: 1080, height: 1080 });
    assert.deepEqual(aspectDimensions('16:9'), { width: 1920, height: 1080 });
    assert.equal(aspectDimensions('4:5'), null);
});

// ── concat demuxer ───────────────────────────────────────────────────────
test('concat: produces -f concat -safe 0 -i with -c copy for all-cuts', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4'),
        mkClip('c3', 9, 7, 'https://cdn/3.mp4'),
    ]);
    const r = buildConcatCommand({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4', '/tmp/c.mp4'],
        outputPath: '/tmp/out.mp4',
        concatListPath: '/tmp/_list.txt',
    });
    assert.equal(r.ok, true);
    assert.equal(r.path, 'concat');
    const args = r.command!.args;
    assert.deepEqual(args.slice(0, 6), ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat']);
    assert.ok(args.includes('-safe'));
    assert.ok(args.includes('0'));
    assert.ok(args.includes('/tmp/_list.txt'));
    assert.ok(args.includes('-c'));
    assert.ok(args.includes('copy'));
    assert.ok(args.includes('-an'));
    assert.ok(args.includes('-movflags'));
    assert.ok(args.includes('+faststart'));
    assert.equal(args[args.length - 1], '/tmp/out.mp4');
});

test('concat: rejects timeline containing fade/dissolve', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4', 'fade'),
    ]);
    const r = buildConcatCommand({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4'],
        outputPath: '/tmp/out.mp4',
        concatListPath: '/tmp/_list.txt',
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors!.some(e => e.includes('non-cut transitions')));
});

test('concat: rejects clipPaths length mismatch', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4'),
    ]);
    const r = buildConcatCommand({
        timeline: t,
        clipPaths: ['/tmp/only_one.mp4'],
        outputPath: '/tmp/out.mp4',
        concatListPath: '/tmp/_list.txt',
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors!.some(e => e.includes('does not match')));
});

test('concat: buildConcatListContent quotes single-quote paths correctly', () => {
    const content = buildConcatListContent(["/tmp/a.mp4", "/tmp/b's.mp4"]);
    assert.ok(content.includes("file '/tmp/a.mp4'"));
    // single quote escaped via `'\''` shell-style
    assert.ok(content.includes("'/tmp/b'\\''s.mp4'"));
});

// ── xfade filter ─────────────────────────────────────────────────────────
test('xfade: builds filter_complex with scale+fps+pad per clip', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4', 'fade'),
    ]);
    const r = buildXfadeCommand({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4'],
        outputPath: '/tmp/out.mp4',
    });
    assert.equal(r.ok, true);
    assert.equal(r.path, 'xfade');
    const args = r.command!.args;
    // -i inputs
    assert.ok(args.includes('-i') && args.includes('/tmp/a.mp4'));
    assert.ok(args.includes('-i') && args.includes('/tmp/b.mp4'));
    // filter_complex present
    const fcIdx = args.indexOf('-filter_complex');
    assert.ok(fcIdx >= 0);
    const fc = args[fcIdx + 1];
    assert.ok(fc.includes('scale=1080:1920'));
    assert.ok(fc.includes('fps=30'));
    assert.ok(fc.includes('format=yuv420p'));
    // transition + offset are present
    assert.ok(fc.includes('transition=fade'));
    assert.ok(fc.includes('offset='));
    // encoding args
    assert.ok(args.includes('-c:v'));
    assert.ok(args.includes('libx264'));
    assert.ok(args.includes('-preset'));
    assert.ok(args.includes('veryfast'));
});

test('xfade: dissolve uses transition=dissolve', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4', 'dissolve'),
    ]);
    const r = buildXfadeCommand({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4'],
        outputPath: '/tmp/out.mp4',
    });
    assert.equal(r.ok, true);
    const fc = r.command!.args[argsIndex(r.command!.args, '-filter_complex') + 1];
    assert.ok(fc.includes('transition=dissolve'));
});

test('xfade: mixed (cut + fade + cut) preserves correct labels and xfade count', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4', 'cut'),
        mkClip('c3', 9, 7, 'https://cdn/3.mp4', 'fade'),
        mkClip('c4', 16, 4, 'https://cdn/4.mp4'),
    ]);
    const r = buildXfadeCommand({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4', '/tmp/c.mp4', '/tmp/d.mp4'],
        outputPath: '/tmp/out.mp4',
    });
    assert.equal(r.ok, true);
    const fc = r.command!.args[argsIndex(r.command!.args, '-filter_complex') + 1];
    // Chain: v0 -> concat(v0,v1)->x1 -> xfade(x1,v2)->x2 -> concat(x2,v3)->x3
    // = 1 xfade (c2 -> c3) + 2 concats (c1+c2, x2+c4)
    const xfadeCount = (fc.match(/xfade=/g) ?? []).length;
    const concatCount = (fc.match(/concat=n=2/g) ?? []).length;
    assert.equal(xfadeCount, 1);
    assert.equal(concatCount, 2);
});

test('xfade: rejects empty timeline', () => {
    const t = mkTimeline([], '9:16');
    const r = buildXfadeCommand({
        timeline: t,
        clipPaths: [],
        outputPath: '/tmp/out.mp4',
    });
    assert.equal(r.ok, false);
});

test('xfade: uses correct dimensions for 16:9', () => {
    const t = mkTimeline(
        [
            mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
            mkClip('c2', 4, 5, 'https://cdn/2.mp4', 'fade'),
        ],
        '16:9',
    );
    const r = buildXfadeCommand({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4'],
        outputPath: '/tmp/out.mp4',
    });
    const fc = r.command!.args[argsIndex(r.command!.args, '-filter_complex') + 1];
    assert.ok(fc.includes('scale=1920:1080'));
});

test('xfade: rejects unknown aspect ratio', () => {
    const t = mkTimeline(
        [mkClip('c1', 0, 4, 'https://cdn/1.mp4'), mkClip('c2', 4, 5, 'https://cdn/2.mp4', 'fade')],
        '4:5',
    );
    const r = buildXfadeCommand({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4'],
        outputPath: '/tmp/out.mp4',
    });
    assert.equal(r.ok, false);
});

// ── master entry point ───────────────────────────────────────────────────
test('master: routes to concat when timeline has only cuts', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4'),
    ]);
    const r = buildFfmpegCommand({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4'],
        outputPath: '/tmp/out.mp4',
        concatListPath: '/tmp/_list.txt',
    });
    assert.equal(r.ok, true);
    assert.equal(r.path, 'concat');
});

test('master: routes to xfade when timeline has fade', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4', 'fade'),
    ]);
    const r = buildFfmpegCommand({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4'],
        outputPath: '/tmp/out.mp4',
    });
    assert.equal(r.ok, true);
    assert.equal(r.path, 'xfade');
});

test('master: requires concatListPath for the concat path', () => {
    const t = mkTimeline([mkClip('c1', 0, 4, 'https://cdn/1.mp4')]);
    const r = buildFfmpegCommand({
        timeline: t,
        clipPaths: ['/tmp/a.mp4'],
        outputPath: '/tmp/out.mp4',
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors!.some(e => e.includes('concatListPath')));
});

test('master: rejects timeline with overlap', () => {
    const t = mkTimeline([
        { id: 'c1', sceneId: 's1', start: 0, duration: 5, sourceUrl: 'https://cdn/1.mp4' },
        { id: 'c2', sceneId: 's2', start: 4, duration: 5, sourceUrl: 'https://cdn/2.mp4' },
    ]);
    const r = buildFfmpegCommand({
        timeline: t,
        clipPaths: ['/tmp/a.mp4', '/tmp/b.mp4'],
        outputPath: '/tmp/out.mp4',
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors!.some(e => e.includes('overlap')));
});

test('master: rejects unsupported aspect ratio', () => {
    const t = mkTimeline([mkClip('c1', 0, 4, 'https://cdn/1.mp4')], '4:5');
    const r = buildFfmpegCommand({
        timeline: t,
        clipPaths: ['/tmp/a.mp4'],
        outputPath: '/tmp/out.mp4',
        concatListPath: '/tmp/_list.txt',
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors!.some(e => e.includes('aspect ratio')));
});

// ── composer orchestration ───────────────────────────────────────────────
test('composer: isAcceptableSource accepts http(s), data:, file://, and non-empty paths', () => {
    assert.equal(isAcceptableSource('https://cdn/x.mp4'), true);
    assert.equal(isAcceptableSource('http://x/y'), true);
    assert.equal(isAcceptableSource('data:video/mp4;base64,AAAA'), true);
    assert.equal(isAcceptableSource('file:///tmp/x.mp4'), true);
    assert.equal(isAcceptableSource('/tmp/x.mp4'), true);
    assert.equal(isAcceptableSource(''), false);
});

test('composer: validateCompositionInput rejects timeline with clip without sourceUrl', () => {
    const t = mkTimeline([
        { id: 'c1', sceneId: 's1', start: 0, duration: 4 },
        { id: 'c2', sceneId: 's2', start: 4, duration: 5 },
    ]);
    const errors = validateCompositionInput({
        timeline: t,
        outputPath: '/tmp/out.mp4',
        workDir: '/tmp/work',
    });
    assert.ok(errors.some(e => e.includes('no usable sourceUrl')));
});

test('composer: validateCompositionInput rejects unknown aspect ratio', () => {
    const t = mkTimeline([mkClip('c1', 0, 4, 'https://cdn/1.mp4')], '21:9');
    const errors = validateCompositionInput({
        timeline: t,
        outputPath: '/tmp/out.mp4',
        workDir: '/tmp/work',
    });
    assert.ok(errors.some(e => e.includes('aspect ratio')));
});

test('composer: validateCompositionInput rejects overlapping clips', () => {
    const t = mkTimeline([
        { id: 'c1', sceneId: 's1', start: 0, duration: 5, sourceUrl: 'https://cdn/1.mp4' },
        { id: 'c2', sceneId: 's2', start: 4, duration: 5, sourceUrl: 'https://cdn/2.mp4' },
    ]);
    const errors = validateCompositionInput({
        timeline: t,
        outputPath: '/tmp/out.mp4',
        workDir: '/tmp/work',
    });
    assert.ok(errors.some(e => e.toLowerCase().includes('overlap')));
});

test('composer: validateCompositionInput accepts a clean timeline', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4'),
    ]);
    const errors = validateCompositionInput({
        timeline: t,
        outputPath: '/tmp/out.mp4',
        workDir: '/tmp/work',
    });
    assert.equal(errors.length, 0);
});

test('composer: composeTimeline resolves data: sources and builds concat command', async () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'data:video/mp4;base64,AAAAAA=='),
        mkClip('c2', 4, 5, 'data:video/mp4;base64,AAAAAA=='),
    ]);
    const written: { path: string; data: Uint8Array }[] = [];
    const r = await composeTimeline({
        timeline: t,
        outputPath: '/tmp/out.mp4',
        workDir: '/tmp/work',
        writeFile: async (path, data) => { written.push({ path, data }); },
        mkdir: async () => undefined,
    });
    assert.equal(r.ok, true);
    assert.equal(r.composition.path, 'concat');
    assert.equal(r.composition.resolvedSources.length, 2);
    assert.ok(r.composition.command.args.includes('-c'));
    assert.ok(r.composition.command.args.includes('copy'));
    assert.equal(written.length, 2);
    assert.ok(r.composition.concatListContent !== undefined);
});

test('composer: composeTimeline picks xfade path when transition != cut', async () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'data:video/mp4;base64,AAAAAA=='),
        mkClip('c2', 4, 5, 'data:video/mp4;base64,AAAAAA==', 'fade'),
    ]);
    const r = await composeTimeline({
        timeline: t,
        outputPath: '/tmp/out.mp4',
        workDir: '/tmp/work',
        writeFile: async () => undefined,
        mkdir: async () => undefined,
    });
    assert.equal(r.ok, true);
    assert.equal(r.composition.path, 'xfade');
    assert.ok(r.composition.command.args.includes('libx264'));
});

test('composer: composeTimeline surfaces HTTP failure', async () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 4, 5, 'https://cdn/2.mp4'),
    ]);
    const r = await composeTimeline({
        timeline: t,
        outputPath: '/tmp/out.mp4',
        workDir: '/tmp/work',
        fetcher: (async () => new Response('not found', { status: 404 })) as unknown as typeof fetch,
        writeFile: async () => undefined,
        mkdir: async () => undefined,
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.includes('404') || e.toLowerCase().includes('fetch')));
});

test('composer: composeTimeline uses local path when source is already a file', async () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, '/var/clips/c1.mp4'),
        mkClip('c2', 4, 5, '/var/clips/c2.mp4'),
    ]);
    const existing = new Set<string>(['/var/clips/c1.mp4', '/var/clips/c2.mp4']);
    const r = await composeTimeline({
        timeline: t,
        outputPath: '/tmp/out.mp4',
        workDir: '/tmp/work',
        fileExists: async (p) => existing.has(p),
        mkdir: async () => undefined,
    });
    assert.equal(r.ok, true);
    assert.equal(r.composition.resolvedSources[0].existed, true);
    assert.equal(r.composition.resolvedSources[0].localPath, '/var/clips/c1.mp4');
});

test('composer: composeTimeline fails when local file is missing', async () => {
    const t = mkTimeline([mkClip('c1', 0, 4, '/var/clips/missing.mp4')]);
    const r = await composeTimeline({
        timeline: t,
        outputPath: '/tmp/out.mp4',
        workDir: '/tmp/work',
        fileExists: async () => false,
        mkdir: async () => undefined,
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.toLowerCase().includes('not found')));
});

test('composer: clipsByTransition classifies correctly', () => {
    const t = mkTimeline([
        mkClip('c1', 0, 4, 'x'),
        mkClip('c2', 4, 5, 'x', 'fade'),
        mkClip('c3', 9, 7, 'x', 'dissolve'),
        mkClip('c4', 16, 4, 'x', 'cut'),
    ]);
    const grouped = clipsByTransition({ timeline: t });
    assert.equal(grouped.cut.length, 2);  // c1 (no transition) + c4
    assert.equal(grouped.fade.length, 1);
    assert.equal(grouped.dissolve.length, 1);
});

// ── helpers used by other tests ──────────────────────────────────────────
function argsIndex(args: string[], key: string): number {
    const idx = args.indexOf(key);
    if (idx < 0) throw new Error(`key not found: ${key}`);
    return idx;
}

test('ffmpeg: VALID_ASPECTS contains 9:16, 1:1, 16:9', () => {
    assert.deepEqual([...VALID_ASPECTS], ['9:16', '1:1', '16:9']);
});

export {};
