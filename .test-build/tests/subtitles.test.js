"use strict";
/**
 * Unit tests for Phase 6F — Subtitles.
 *
 * Coverage:
 *   - formatSrtTimestamp (zero, sub-second, > 1 hour, negative, NaN)
 *   - escapeSrtText (BOM, CRLF, NULs, blank-line collapse)
 *   - buildSubtitleEntries (chronological order, durations from clips,
 *     text source selection, padding, min-duration skip)
 *   - buildSrt (basic format, UTF-8 round-trip, multi-line text, blank
 *     separators, trailing newline)
 *   - validateSubtitleEntries (overlap, out_of_order, invalid_range,
 *     negative_start, empty_index)
 *   - Spanish/argentinian text (ñ, á, ¿, ¡, accents, emoji stripping?)
 *   - buildSubtitleFilter / buildSubtitleArgs (FFmpeg integration)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const harness_1 = require("./harness");
const subtitles_1 = require("../lib/video/subtitles");
// ── helpers ──────────────────────────────────────────────────────────────
function mkScene(id, over = {}) {
    return {
        projectId: 'p1',
        order: 0,
        visualPrompt: 'p',
        durationSec: 5,
        timestamps: { createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
        status: 'pending',
        ...over,
        id,
    };
}
function mkTimeline(clips) {
    return {
        id: 'tl',
        projectId: 'p1',
        duration: clips.reduce((acc, c) => acc + c.duration, 0),
        clips,
        aspectRatio: '9:16',
        fps: 30,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    };
}
function mkClip(id, sceneId, start, duration) {
    return { id, sceneId, start, duration };
}
// ── formatSrtTimestamp ───────────────────────────────────────────────────
(0, harness_1.test)('srt: formatSrtTimestamp returns 00:00:00,000 for zero', () => {
    strict_1.default.equal((0, subtitles_1.formatSrtTimestamp)(0), '00:00:00,000');
});
(0, harness_1.test)('srt: formatSrtTimestamp pads sub-seconds', () => {
    strict_1.default.equal((0, subtitles_1.formatSrtTimestamp)(4), '00:00:04,000');
    strict_1.default.equal((0, subtitles_1.formatSrtTimestamp)(4.5), '00:00:04,500');
    strict_1.default.equal((0, subtitles_1.formatSrtTimestamp)(4.25), '00:00:04,250');
    strict_1.default.equal((0, subtitles_1.formatSrtTimestamp)(4.001), '00:00:04,001');
});
(0, harness_1.test)('srt: formatSrtTimestamp formats minutes and hours', () => {
    strict_1.default.equal((0, subtitles_1.formatSrtTimestamp)(75), '00:01:15,000');
    strict_1.default.equal((0, subtitles_1.formatSrtTimestamp)(3661.5), '01:01:01,500');
});
(0, harness_1.test)('srt: formatSrtTimestamp handles negative and non-finite inputs', () => {
    strict_1.default.equal((0, subtitles_1.formatSrtTimestamp)(-1), '00:00:00,000');
    strict_1.default.equal((0, subtitles_1.formatSrtTimestamp)(Number.NaN), '00:00:00,000');
    strict_1.default.equal((0, subtitles_1.formatSrtTimestamp)(Number.POSITIVE_INFINITY), '00:00:00,000');
});
(0, harness_1.test)('srt: formatSrtTimestamp rounds milliseconds (not truncates)', () => {
    strict_1.default.equal((0, subtitles_1.formatSrtTimestamp)(1.9996), '00:00:02,000');
    strict_1.default.equal((0, subtitles_1.formatSrtTimestamp)(1.9994), '00:00:01,999');
});
// ── escapeSrtText ────────────────────────────────────────────────────────
(0, harness_1.test)('srt: escapeSrtText strips a leading BOM', () => {
    strict_1.default.equal((0, subtitles_1.escapeSrtText)('\uFEFFHola'), 'Hola');
});
(0, harness_1.test)('srt: escapeSrtText removes NULs', () => {
    strict_1.default.equal((0, subtitles_1.escapeSrtText)('Ho\u0000la'), 'Hola');
});
(0, harness_1.test)('srt: escapeSrtText normalizes CRLF and CR to LF', () => {
    strict_1.default.equal((0, subtitles_1.escapeSrtText)('a\r\nb\rc'), 'a\nb\nc');
});
(0, harness_1.test)('srt: escapeSrtText trims leading/trailing blank lines', () => {
    strict_1.default.equal((0, subtitles_1.escapeSrtText)('\n\nHola\n\n'), 'Hola');
});
(0, harness_1.test)('srt: escapeSrtText collapses 3+ blank lines to 2', () => {
    strict_1.default.equal((0, subtitles_1.escapeSrtText)('a\n\n\n\n\nb'), 'a\n\nb');
});
(0, harness_1.test)('srt: escapeSrtText keeps Spanish diacritics intact', () => {
    const txt = '¿Cómo estás? ¡Probá el café!';
    strict_1.default.equal((0, subtitles_1.escapeSrtText)(txt), txt);
});
// ── buildSubtitleEntries ─────────────────────────────────────────────────
(0, harness_1.test)('entries: builds entries in chronological order from clip starts', () => {
    const scenes = [
        mkScene('s1', { onScreenText: 'Texto 1' }),
        mkScene('s2', { onScreenText: 'Texto 2' }),
        mkScene('s3', { onScreenText: 'Texto 3' }),
        mkScene('s4', { onScreenText: 'Texto 4' }),
    ];
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4),
        mkClip('c2', 's2', 4, 5),
        mkClip('c3', 's3', 9, 7),
        mkClip('c4', 's4', 16, 4),
    ]);
    const entries = (0, subtitles_1.buildSubtitleEntries)({ timeline: t, scenes });
    strict_1.default.equal(entries.length, 4);
    strict_1.default.equal(entries[0].index, 1);
    strict_1.default.equal(entries[1].index, 2);
    strict_1.default.deepEqual(entries.map(e => e.startSec), [0, 4, 9, 16]);
    strict_1.default.deepEqual(entries.map(e => e.endSec), [4, 9, 16, 20]);
    strict_1.default.deepEqual(entries.map(e => e.text), ['Texto 1', 'Texto 2', 'Texto 3', 'Texto 4']);
});
(0, harness_1.test)('entries: skips clips with no scene', () => {
    const scenes = [mkScene('s1', { onScreenText: 'Texto 1' })];
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4),
        mkClip('c2', 'orphan', 4, 5),
    ]);
    const entries = (0, subtitles_1.buildSubtitleEntries)({ timeline: t, scenes });
    strict_1.default.equal(entries.length, 1);
    strict_1.default.equal(entries[0].sceneId, 's1');
});
(0, harness_1.test)('entries: skips scenes with empty text', () => {
    const scenes = [
        mkScene('s1', { onScreenText: 'Hola' }),
        mkScene('s2', { onScreenText: '' }),
        mkScene('s3', {}),
    ];
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4),
        mkClip('c2', 's2', 4, 5),
        mkClip('c3', 's3', 9, 4),
    ]);
    const entries = (0, subtitles_1.buildSubtitleEntries)({ timeline: t, scenes });
    strict_1.default.equal(entries.length, 1);
});
(0, harness_1.test)('entries: skips clips shorter than minDurationSec', () => {
    const scenes = [
        mkScene('s1', { onScreenText: 'Corto' }),
        mkScene('s2', { onScreenText: 'Normal' }),
    ];
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 0.2), // too short
        mkClip('c2', 's2', 0.2, 4),
    ]);
    const entries = (0, subtitles_1.buildSubtitleEntries)({ timeline: t, scenes, minDurationSec: 0.5 });
    strict_1.default.equal(entries.length, 1);
    strict_1.default.equal(entries[0].sceneId, 's2');
});
(0, harness_1.test)('entries: source=voiceover picks voiceover text', () => {
    const scenes = [
        mkScene('s1', { onScreenText: 'OST', voiceover: 'VO' }),
        mkScene('s2', { voiceover: 'Solo VO' }),
    ];
    const t = mkTimeline([mkClip('c1', 's1', 0, 4), mkClip('c2', 's2', 4, 4)]);
    const entries = (0, subtitles_1.buildSubtitleEntries)({ timeline: t, scenes, source: 'voiceover' });
    strict_1.default.equal(entries.length, 2);
    strict_1.default.equal(entries[0].text, 'VO');
    strict_1.default.equal(entries[1].text, 'Solo VO');
});
(0, harness_1.test)('entries: source=onScreenText falls back to voiceover when missing', () => {
    const scenes = [
        mkScene('s1', { voiceover: 'Solo VO' }),
    ];
    const t = mkTimeline([mkClip('c1', 's1', 0, 4)]);
    const entries = (0, subtitles_1.buildSubtitleEntries)({ timeline: t, scenes });
    strict_1.default.equal(entries[0].text, 'Solo VO');
});
(0, harness_1.test)('entries: padEndSec shrinks each end timestamp', () => {
    const scenes = [mkScene('s1', { onScreenText: 'Hola' })];
    const t = mkTimeline([mkClip('c1', 's1', 0, 4)]);
    const entries = (0, subtitles_1.buildSubtitleEntries)({ timeline: t, scenes, padEndSec: 1 });
    strict_1.default.equal(entries[0].endSec, 3);
});
(0, harness_1.test)('entries: padStartSec shifts each start timestamp forward', () => {
    const scenes = [mkScene('s1', { onScreenText: 'Hola' })];
    const t = mkTimeline([mkClip('c1', 's1', 0, 4)]);
    const entries = (0, subtitles_1.buildSubtitleEntries)({ timeline: t, scenes, padStartSec: 0.5 });
    strict_1.default.equal(entries[0].startSec, 0.5);
    strict_1.default.equal(entries[0].endSec, 4);
});
(0, harness_1.test)('entries: maxLineLength wraps long text on word boundaries', () => {
    const scenes = [
        mkScene('s1', { onScreenText: 'Esta es una línea bastante larga de subtítulos' }),
    ];
    const t = mkTimeline([mkClip('c1', 's1', 0, 6)]);
    const entries = (0, subtitles_1.buildSubtitleEntries)({ timeline: t, scenes, maxLineLength: 12 });
    strict_1.default.equal(entries[0].text.includes('\n'), true);
    for (const line of entries[0].text.split('\n')) {
        strict_1.default.ok(line.length <= 12);
    }
});
// ── buildSrt ─────────────────────────────────────────────────────────────
(0, harness_1.test)('srt: matches the canonical 4-scene example from the prompt', () => {
    const scenes = [
        mkScene('s1', { onScreenText: 'Texto escena 1' }),
        mkScene('s2', { onScreenText: 'Texto escena 2' }),
        mkScene('s3', { onScreenText: 'Texto escena 3' }),
        mkScene('s4', { onScreenText: 'Texto escena 4' }),
    ];
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4),
        mkClip('c2', 's2', 4, 5),
        mkClip('c3', 's3', 9, 7),
        mkClip('c4', 's4', 16, 4),
    ]);
    const srt = (0, subtitles_1.buildSrt)((0, subtitles_1.buildSubtitleEntries)({ timeline: t, scenes }));
    const expected = [
        '1',
        '00:00:00,000 --> 00:00:04,000',
        'Texto escena 1',
        '',
        '2',
        '00:00:04,000 --> 00:00:09,000',
        'Texto escena 2',
        '',
        '3',
        '00:00:09,000 --> 00:00:16,000',
        'Texto escena 3',
        '',
        '4',
        '00:00:16,000 --> 00:00:20,000',
        'Texto escena 4',
        '',
    ].join('\n');
    strict_1.default.equal(srt, expected);
});
(0, harness_1.test)('srt: empty input yields an empty (but newline-terminated) string', () => {
    const srt = (0, subtitles_1.buildSrt)([]);
    strict_1.default.equal(srt, '\n');
});
(0, harness_1.test)('srt: multi-line text is preserved verbatim', () => {
    const scenes = [mkScene('s1', { onScreenText: 'Línea 1\nLínea 2' })];
    const t = mkTimeline([mkClip('c1', 's1', 0, 4)]);
    const srt = (0, subtitles_1.buildSrt)((0, subtitles_1.buildSubtitleEntries)({ timeline: t, scenes }));
    strict_1.default.ok(srt.includes('Línea 1\nLínea 2'));
});
(0, harness_1.test)('srt: round-trips Spanish text intact (UTF-8)', () => {
    const txt = 'Comprá online con envío gratis ¡ahora!';
    const scenes = [mkScene('s1', { onScreenText: txt })];
    const t = mkTimeline([mkClip('c1', 's1', 0, 4)]);
    const srt = (0, subtitles_1.buildSrt)((0, subtitles_1.buildSubtitleEntries)({ timeline: t, scenes }));
    strict_1.default.ok(srt.includes(txt));
});
(0, harness_1.test)('srt: renumbers entries sequentially even after skipped ones', () => {
    const scenes = [
        mkScene('s1', { onScreenText: 'uno' }),
        mkScene('s2', {}), // skipped
        mkScene('s3', { onScreenText: 'tres' }),
    ];
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4),
        mkClip('c2', 's2', 4, 5),
        mkClip('c3', 's3', 9, 4),
    ]);
    const entries = (0, subtitles_1.buildSubtitleEntries)({ timeline: t, scenes });
    strict_1.default.equal(entries.length, 2);
    strict_1.default.equal(entries[0].index, 1);
    strict_1.default.equal(entries[1].index, 2);
});
// ── validateSubtitleEntries ──────────────────────────────────────────────
(0, harness_1.test)('validate: clean entries pass', () => {
    const entries = [
        { index: 1, startSec: 0, endSec: 4, text: 'a', sceneId: 's1' },
        { index: 2, startSec: 4, endSec: 9, text: 'b', sceneId: 's2' },
    ];
    const r = (0, subtitles_1.validateSubtitleEntries)(entries);
    strict_1.default.equal(r.ok, true);
    strict_1.default.equal(r.errors.length, 0);
});
(0, harness_1.test)('validate: empty entries pass (vacuous truth)', () => {
    const r = (0, subtitles_1.validateSubtitleEntries)([]);
    strict_1.default.equal(r.ok, true);
});
(0, harness_1.test)('validate: overlap is detected', () => {
    const entries = [
        { index: 1, startSec: 0, endSec: 5, text: 'a', sceneId: 's1' },
        { index: 2, startSec: 4, endSec: 9, text: 'b', sceneId: 's2' },
    ];
    const r = (0, subtitles_1.validateSubtitleEntries)(entries);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.errors.some(e => e.kind === 'overlap'));
});
(0, harness_1.test)('validate: out-of-order entries fail', () => {
    const entries = [
        { index: 1, startSec: 9, endSec: 13, text: 'a', sceneId: 's1' },
        { index: 2, startSec: 4, endSec: 8, text: 'b', sceneId: 's2' },
    ];
    const r = (0, subtitles_1.validateSubtitleEntries)(entries);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.errors.some(e => e.kind === 'out_of_order'));
});
(0, harness_1.test)('validate: invalid range (end <= start) is detected', () => {
    const entries = [
        { index: 1, startSec: 4, endSec: 4, text: 'a', sceneId: 's1' },
    ];
    const r = (0, subtitles_1.validateSubtitleEntries)(entries);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.errors.some(e => e.kind === 'invalid_range'));
});
(0, harness_1.test)('validate: negative start is detected', () => {
    const entries = [
        { index: 1, startSec: -0.001, endSec: 4, text: 'a', sceneId: 's1' },
    ];
    const r = (0, subtitles_1.validateSubtitleEntries)(entries);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.errors.some(e => e.kind === 'negative_start'));
});
(0, harness_1.test)('validate: zero index is detected', () => {
    const entries = [
        { index: 0, startSec: 0, endSec: 4, text: 'a', sceneId: 's1' },
    ];
    const r = (0, subtitles_1.validateSubtitleEntries)(entries);
    strict_1.default.equal(r.ok, false);
    strict_1.default.ok(r.errors.some(e => e.kind === 'empty_index'));
});
// ── FFmpeg filter integration ────────────────────────────────────────────
(0, harness_1.test)('ffmpeg filter: buildSubtitleFilter includes the path and style', () => {
    const f = (0, subtitles_1.buildSubtitleFilter)({ srtPath: '/tmp/subs.srt' });
    strict_1.default.ok(f.startsWith("subtitles='"));
    strict_1.default.ok(f.includes('/tmp/subs.srt'));
    strict_1.default.ok(f.includes("force_style='"));
    strict_1.default.ok(f.includes('FontName=Inter'));
    strict_1.default.ok(f.includes('FontSize=24'));
    strict_1.default.ok(f.includes('PrimaryColour=&H00FFFFFF&'));
    strict_1.default.ok(f.includes('OutlineColour=&H00000000&'));
    strict_1.default.ok(f.includes('Alignment=2'));
});
(0, harness_1.test)('ffmpeg filter: custom style overrides defaults', () => {
    const f = (0, subtitles_1.buildSubtitleFilter)({
        srtPath: '/tmp/x.srt',
        style: { fontSize: 32, fontName: 'Roboto', primaryColor: '&H0000FF00&', outlineColor: '&H00000080&' },
    });
    strict_1.default.ok(f.includes('FontSize=32'));
    strict_1.default.ok(f.includes('FontName=Roboto'));
    strict_1.default.ok(f.includes('PrimaryColour=&H0000FF00&'));
    strict_1.default.ok(f.includes('OutlineColour=&H00000080&'));
});
(0, harness_1.test)('ffmpeg filter: paths with single quotes are escaped', () => {
    const f = (0, subtitles_1.buildSubtitleFilter)({ srtPath: "/tmp/it's.srt" });
    // The single quote in the path should be backslash-escaped so the
    // ffmpeg filter parser doesn't terminate the string early.
    strict_1.default.ok(f.includes("\\'"));
});
(0, harness_1.test)('ffmpeg args: buildSubtitleArgs returns null when no SRT body', () => {
    const scenes = [mkScene('s1', { onScreenText: '' })];
    const t = mkTimeline([mkClip('c1', 's1', 0, 4)]);
    const args = (0, subtitles_1.buildSubtitleArgs)({
        timeline: t, scenes, srtPath: '/tmp/subs.srt',
    });
    strict_1.default.equal(args, null);
});
(0, harness_1.test)('ffmpeg args: buildSubtitleArgs returns [-vf, filter] when there is content', () => {
    const scenes = [mkScene('s1', { onScreenText: 'Hola' })];
    const t = mkTimeline([mkClip('c1', 's1', 0, 4)]);
    const args = (0, subtitles_1.buildSubtitleArgs)({
        timeline: t, scenes, srtPath: '/tmp/subs.srt',
    });
    strict_1.default.ok(args);
    strict_1.default.equal(args[0], '-vf');
    strict_1.default.ok(args[1].startsWith("subtitles='/tmp/subs.srt'"));
});
// ── End-to-end ───────────────────────────────────────────────────────────
(0, harness_1.test)('e2e: buildSubtitles covers the full Phase-6D scene→clip integration', () => {
    const scenes = [
        mkScene('s1', { order: 0, durationSec: 4, onScreenText: 'Comprá online' }),
        mkScene('s2', { order: 1, durationSec: 5, onScreenText: 'Envío gratis' }),
        mkScene('s3', { order: 2, durationSec: 7, onScreenText: 'Hasta 50% off' }),
        mkScene('s4', { order: 3, durationSec: 4, onScreenText: '¡Hoy!' }),
    ];
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4),
        mkClip('c2', 's2', 4, 5),
        mkClip('c3', 's3', 9, 7),
        mkClip('c4', 's4', 16, 4),
    ]);
    const srt = (0, subtitles_1.buildSubtitles)({ timeline: t, scenes });
    // Spot-check the four entries
    strict_1.default.ok(srt.includes('00:00:00,000 --> 00:00:04,000\nComprá online'));
    strict_1.default.ok(srt.includes('00:00:04,000 --> 00:00:09,000\nEnvío gratis'));
    strict_1.default.ok(srt.includes('00:00:09,000 --> 00:00:16,000\nHasta 50% off'));
    strict_1.default.ok(srt.includes('00:00:16,000 --> 00:00:20,000\n¡Hoy!'));
});
