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

import assert from 'node:assert/strict';
import { test } from './harness';

import { Timeline, TimelineClip } from '../lib/projects/timeline';
import { Scene } from '../lib/projects/types';
import {
    buildSubtitleEntries,
    buildSrt,
    buildSubtitles,
    formatSrtTimestamp,
    escapeSrtText,
    validateSubtitleEntries,
    buildSubtitleFilter,
    buildSubtitleArgs,
} from '../lib/video/subtitles';

// ── helpers ──────────────────────────────────────────────────────────────
function mkScene(id: string, over: Partial<Scene> = {}): Scene {
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

function mkTimeline(clips: TimelineClip[]): Timeline {
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

function mkClip(id: string, sceneId: string, start: number, duration: number): TimelineClip {
    return { id, sceneId, start, duration };
}

// ── formatSrtTimestamp ───────────────────────────────────────────────────
test('srt: formatSrtTimestamp returns 00:00:00,000 for zero', () => {
    assert.equal(formatSrtTimestamp(0), '00:00:00,000');
});

test('srt: formatSrtTimestamp pads sub-seconds', () => {
    assert.equal(formatSrtTimestamp(4), '00:00:04,000');
    assert.equal(formatSrtTimestamp(4.5), '00:00:04,500');
    assert.equal(formatSrtTimestamp(4.25), '00:00:04,250');
    assert.equal(formatSrtTimestamp(4.001), '00:00:04,001');
});

test('srt: formatSrtTimestamp formats minutes and hours', () => {
    assert.equal(formatSrtTimestamp(75), '00:01:15,000');
    assert.equal(formatSrtTimestamp(3661.5), '01:01:01,500');
});

test('srt: formatSrtTimestamp handles negative and non-finite inputs', () => {
    assert.equal(formatSrtTimestamp(-1), '00:00:00,000');
    assert.equal(formatSrtTimestamp(Number.NaN), '00:00:00,000');
    assert.equal(formatSrtTimestamp(Number.POSITIVE_INFINITY), '00:00:00,000');
});

test('srt: formatSrtTimestamp rounds milliseconds (not truncates)', () => {
    assert.equal(formatSrtTimestamp(1.9996), '00:00:02,000');
    assert.equal(formatSrtTimestamp(1.9994), '00:00:01,999');
});

// ── escapeSrtText ────────────────────────────────────────────────────────
test('srt: escapeSrtText strips a leading BOM', () => {
    assert.equal(escapeSrtText('\uFEFFHola'), 'Hola');
});

test('srt: escapeSrtText removes NULs', () => {
    assert.equal(escapeSrtText('Ho\u0000la'), 'Hola');
});

test('srt: escapeSrtText normalizes CRLF and CR to LF', () => {
    assert.equal(escapeSrtText('a\r\nb\rc'), 'a\nb\nc');
});

test('srt: escapeSrtText trims leading/trailing blank lines', () => {
    assert.equal(escapeSrtText('\n\nHola\n\n'), 'Hola');
});

test('srt: escapeSrtText collapses 3+ blank lines to 2', () => {
    assert.equal(escapeSrtText('a\n\n\n\n\nb'), 'a\n\nb');
});

test('srt: escapeSrtText keeps Spanish diacritics intact', () => {
    const txt = '¿Cómo estás? ¡Probá el café!';
    assert.equal(escapeSrtText(txt), txt);
});

// ── buildSubtitleEntries ─────────────────────────────────────────────────
test('entries: builds entries in chronological order from clip starts', () => {
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
    const entries = buildSubtitleEntries({ timeline: t, scenes });
    assert.equal(entries.length, 4);
    assert.equal(entries[0].index, 1);
    assert.equal(entries[1].index, 2);
    assert.deepEqual(entries.map(e => e.startSec), [0, 4, 9, 16]);
    assert.deepEqual(entries.map(e => e.endSec), [4, 9, 16, 20]);
    assert.deepEqual(entries.map(e => e.text), ['Texto 1', 'Texto 2', 'Texto 3', 'Texto 4']);
});

test('entries: skips clips with no scene', () => {
    const scenes = [mkScene('s1', { onScreenText: 'Texto 1' })];
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4),
        mkClip('c2', 'orphan', 4, 5),
    ]);
    const entries = buildSubtitleEntries({ timeline: t, scenes });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].sceneId, 's1');
});

test('entries: skips scenes with empty text', () => {
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
    const entries = buildSubtitleEntries({ timeline: t, scenes });
    assert.equal(entries.length, 1);
});

test('entries: skips clips shorter than minDurationSec', () => {
    const scenes = [
        mkScene('s1', { onScreenText: 'Corto' }),
        mkScene('s2', { onScreenText: 'Normal' }),
    ];
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 0.2),  // too short
        mkClip('c2', 's2', 0.2, 4),
    ]);
    const entries = buildSubtitleEntries({ timeline: t, scenes, minDurationSec: 0.5 });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].sceneId, 's2');
});

test('entries: source=voiceover picks voiceover text', () => {
    const scenes = [
        mkScene('s1', { onScreenText: 'OST', voiceover: 'VO' }),
        mkScene('s2', { voiceover: 'Solo VO' }),
    ];
    const t = mkTimeline([mkClip('c1', 's1', 0, 4), mkClip('c2', 's2', 4, 4)]);
    const entries = buildSubtitleEntries({ timeline: t, scenes, source: 'voiceover' });
    assert.equal(entries.length, 2);
    assert.equal(entries[0].text, 'VO');
    assert.equal(entries[1].text, 'Solo VO');
});

test('entries: source=onScreenText falls back to voiceover when missing', () => {
    const scenes = [
        mkScene('s1', { voiceover: 'Solo VO' }),
    ];
    const t = mkTimeline([mkClip('c1', 's1', 0, 4)]);
    const entries = buildSubtitleEntries({ timeline: t, scenes });
    assert.equal(entries[0].text, 'Solo VO');
});

test('entries: padEndSec shrinks each end timestamp', () => {
    const scenes = [mkScene('s1', { onScreenText: 'Hola' })];
    const t = mkTimeline([mkClip('c1', 's1', 0, 4)]);
    const entries = buildSubtitleEntries({ timeline: t, scenes, padEndSec: 1 });
    assert.equal(entries[0].endSec, 3);
});

test('entries: padStartSec shifts each start timestamp forward', () => {
    const scenes = [mkScene('s1', { onScreenText: 'Hola' })];
    const t = mkTimeline([mkClip('c1', 's1', 0, 4)]);
    const entries = buildSubtitleEntries({ timeline: t, scenes, padStartSec: 0.5 });
    assert.equal(entries[0].startSec, 0.5);
    assert.equal(entries[0].endSec, 4);
});

test('entries: maxLineLength wraps long text on word boundaries', () => {
    const scenes = [
        mkScene('s1', { onScreenText: 'Esta es una línea bastante larga de subtítulos' }),
    ];
    const t = mkTimeline([mkClip('c1', 's1', 0, 6)]);
    const entries = buildSubtitleEntries({ timeline: t, scenes, maxLineLength: 12 });
    assert.equal(entries[0].text.includes('\n'), true);
    for (const line of entries[0].text.split('\n')) {
        assert.ok(line.length <= 12);
    }
});

// ── buildSrt ─────────────────────────────────────────────────────────────
test('srt: matches the canonical 4-scene example from the prompt', () => {
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
    const srt = buildSrt(buildSubtitleEntries({ timeline: t, scenes }));
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
    assert.equal(srt, expected);
});

test('srt: empty input yields an empty (but newline-terminated) string', () => {
    const srt = buildSrt([]);
    assert.equal(srt, '\n');
});

test('srt: multi-line text is preserved verbatim', () => {
    const scenes = [mkScene('s1', { onScreenText: 'Línea 1\nLínea 2' })];
    const t = mkTimeline([mkClip('c1', 's1', 0, 4)]);
    const srt = buildSrt(buildSubtitleEntries({ timeline: t, scenes }));
    assert.ok(srt.includes('Línea 1\nLínea 2'));
});

test('srt: round-trips Spanish text intact (UTF-8)', () => {
    const txt = 'Comprá online con envío gratis ¡ahora!';
    const scenes = [mkScene('s1', { onScreenText: txt })];
    const t = mkTimeline([mkClip('c1', 's1', 0, 4)]);
    const srt = buildSrt(buildSubtitleEntries({ timeline: t, scenes }));
    assert.ok(srt.includes(txt));
});

test('srt: renumbers entries sequentially even after skipped ones', () => {
    const scenes = [
        mkScene('s1', { onScreenText: 'uno' }),
        mkScene('s2', {}),  // skipped
        mkScene('s3', { onScreenText: 'tres' }),
    ];
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4),
        mkClip('c2', 's2', 4, 5),
        mkClip('c3', 's3', 9, 4),
    ]);
    const entries = buildSubtitleEntries({ timeline: t, scenes });
    assert.equal(entries.length, 2);
    assert.equal(entries[0].index, 1);
    assert.equal(entries[1].index, 2);
});

// ── validateSubtitleEntries ──────────────────────────────────────────────
test('validate: clean entries pass', () => {
    const entries = [
        { index: 1, startSec: 0, endSec: 4, text: 'a', sceneId: 's1' },
        { index: 2, startSec: 4, endSec: 9, text: 'b', sceneId: 's2' },
    ];
    const r = validateSubtitleEntries(entries);
    assert.equal(r.ok, true);
    assert.equal(r.errors.length, 0);
});

test('validate: empty entries pass (vacuous truth)', () => {
    const r = validateSubtitleEntries([]);
    assert.equal(r.ok, true);
});

test('validate: overlap is detected', () => {
    const entries = [
        { index: 1, startSec: 0, endSec: 5, text: 'a', sceneId: 's1' },
        { index: 2, startSec: 4, endSec: 9, text: 'b', sceneId: 's2' },
    ];
    const r = validateSubtitleEntries(entries);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.kind === 'overlap'));
});

test('validate: out-of-order entries fail', () => {
    const entries = [
        { index: 1, startSec: 9, endSec: 13, text: 'a', sceneId: 's1' },
        { index: 2, startSec: 4, endSec: 8, text: 'b', sceneId: 's2' },
    ];
    const r = validateSubtitleEntries(entries);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.kind === 'out_of_order'));
});

test('validate: invalid range (end <= start) is detected', () => {
    const entries = [
        { index: 1, startSec: 4, endSec: 4, text: 'a', sceneId: 's1' },
    ];
    const r = validateSubtitleEntries(entries);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.kind === 'invalid_range'));
});

test('validate: negative start is detected', () => {
    const entries = [
        { index: 1, startSec: -0.001, endSec: 4, text: 'a', sceneId: 's1' },
    ];
    const r = validateSubtitleEntries(entries);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.kind === 'negative_start'));
});

test('validate: zero index is detected', () => {
    const entries = [
        { index: 0, startSec: 0, endSec: 4, text: 'a', sceneId: 's1' },
    ];
    const r = validateSubtitleEntries(entries);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.kind === 'empty_index'));
});

// ── FFmpeg filter integration ────────────────────────────────────────────
test('ffmpeg filter: buildSubtitleFilter includes the path and style', () => {
    const f = buildSubtitleFilter({ srtPath: '/tmp/subs.srt' });
    assert.ok(f.startsWith("subtitles='"));
    assert.ok(f.includes('/tmp/subs.srt'));
    assert.ok(f.includes("force_style='"));
    assert.ok(f.includes('FontName=Inter'));
    assert.ok(f.includes('FontSize=24'));
    assert.ok(f.includes('PrimaryColour=&H00FFFFFF&'));
    assert.ok(f.includes('OutlineColour=&H00000000&'));
    assert.ok(f.includes('Alignment=2'));
});

test('ffmpeg filter: custom style overrides defaults', () => {
    const f = buildSubtitleFilter({
        srtPath: '/tmp/x.srt',
        style: { fontSize: 32, fontName: 'Roboto', primaryColor: '&H0000FF00&', outlineColor: '&H00000080&' },
    });
    assert.ok(f.includes('FontSize=32'));
    assert.ok(f.includes('FontName=Roboto'));
    assert.ok(f.includes('PrimaryColour=&H0000FF00&'));
    assert.ok(f.includes('OutlineColour=&H00000080&'));
});

test('ffmpeg filter: paths with single quotes are escaped', () => {
    const f = buildSubtitleFilter({ srtPath: "/tmp/it's.srt" });
    // The single quote in the path should be backslash-escaped so the
    // ffmpeg filter parser doesn't terminate the string early.
    assert.ok(f.includes("\\'"));
});

test('ffmpeg args: buildSubtitleArgs returns null when no SRT body', () => {
    const scenes = [mkScene('s1', { onScreenText: '' })];
    const t = mkTimeline([mkClip('c1', 's1', 0, 4)]);
    const args = buildSubtitleArgs({
        timeline: t, scenes, srtPath: '/tmp/subs.srt',
    });
    assert.equal(args, null);
});

test('ffmpeg args: buildSubtitleArgs returns [-vf, filter] when there is content', () => {
    const scenes = [mkScene('s1', { onScreenText: 'Hola' })];
    const t = mkTimeline([mkClip('c1', 's1', 0, 4)]);
    const args = buildSubtitleArgs({
        timeline: t, scenes, srtPath: '/tmp/subs.srt',
    });
    assert.ok(args);
    assert.equal(args![0], '-vf');
    assert.ok(args![1].startsWith("subtitles='/tmp/subs.srt'"));
});

// ── End-to-end ───────────────────────────────────────────────────────────
test('e2e: buildSubtitles covers the full Phase-6D scene→clip integration', () => {
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
    const srt = buildSubtitles({ timeline: t, scenes });
    // Spot-check the four entries
    assert.ok(srt.includes('00:00:00,000 --> 00:00:04,000\nComprá online'));
    assert.ok(srt.includes('00:00:04,000 --> 00:00:09,000\nEnvío gratis'));
    assert.ok(srt.includes('00:00:09,000 --> 00:00:16,000\nHasta 50% off'));
    assert.ok(srt.includes('00:00:16,000 --> 00:00:20,000\n¡Hoy!'));
});

export {};
