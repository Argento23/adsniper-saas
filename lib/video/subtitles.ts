/**
 * Subtitles — Phase 6F.
 *
 * Generates SRT-format subtitles from a Timeline, deriving text from
 * the existing Scenes (no LLM calls — text already lives in
 * `Scene.onScreenText` and `Scene.voiceover`).
 *
 * Public surface:
 *
 *   - `buildSubtitleEntries(opts)`  → SubtitleEntry[] (typed)
 *   - `buildSrt(entries)`           → string (SRT body, UTF-8)
 *   - `buildSubtitles(opts)`        → string (combines both for convenience)
 *   - `validateSubtitleEntries`     → sanity checks (order, no overlaps)
 *   - `formatSrtTimestamp(seconds)` → "HH:MM:SS,mmm"
 *   - `escapeSrtText(text)`         → minimal escape (SRT allows most chars)
 *   - `buildSubtitleFilter(opts)`   → ffmpeg `subtitles=` filter string
 *
 * Integration with Phase 6E composer is left to a future phase — this
 * module only produces the SRT body and the ffmpeg filter snippet.
 */

import { Timeline, TimelineClip } from '@/lib/projects/timeline';
import { Scene } from '@/lib/projects/types';

// ── Types ────────────────────────────────────────────────────────────────

export interface SubtitleEntry {
    /** 1-based index, in chronological order. */
    index: number;
    /** Absolute time within the timeline (seconds). */
    startSec: number;
    /** Absolute time within the timeline (seconds). Must be > startSec. */
    endSec: number;
    /** UTF-8 text. May be empty (entries with no text are skipped from SRT). */
    text: string;
    /** Source scene id (for traceability and tests). */
    sceneId: string;
}

export type SubtitleSource = 'onScreenText' | 'voiceover' | 'both';

export interface SubtitleGenerationOptions {
    timeline: Timeline;
    scenes: Scene[];
    /** Which scene field to use. Default: `'onScreenText'`. */
    source?: SubtitleSource;
    /** Skip clips whose duration is shorter than this (seconds). Default 0.5. */
    minDurationSec?: number;
    /** Pull each subtitle's end-time back by this many seconds (visual gap). Default 0. */
    padEndSec?: number;
    /** Pull each subtitle's start-time forward by this many seconds (warm-up). Default 0. */
    padStartSec?: number;
    /** Optional maximum line length; soft-wraps lines on word boundaries. Default: no wrap. */
    maxLineLength?: number;
}

export interface SubtitleValidationError {
    kind: 'invalid_range' | 'negative_start' | 'overlap' | 'out_of_order' | 'empty_index';
    message: string;
    index?: number;
}

export interface SubtitleValidationResult {
    ok: boolean;
    errors: SubtitleValidationError[];
}

export interface SubtitleStyle {
    /** Font size in pixels. Default: 24. */
    fontSize?: number;
    /** ASS primary colour (`&HBBGGRR&`). Default: `&H00FFFFFF&` (white). */
    primaryColor?: string;
    /** ASS outline colour (`&HBBGGRR&`). Default: `&H00000000&` (black). */
    outlineColor?: string;
    /** ASS font name. Default: 'Inter'. */
    fontName?: string;
}

// ── Constants ────────────────────────────────────────────────────────────

export const DEFAULT_MIN_DURATION_SEC = 0.5;
export const DEFAULT_PAD_END_SEC = 0;
export const DEFAULT_PAD_START_SEC = 0;
export const SRT_TIMESTAMP_PRECISION = 3; // milliseconds

// ── Timestamp formatter ──────────────────────────────────────────────────

/**
 * Format seconds as `HH:MM:SS,mmm` (SRT format). Negative or
 * non-finite inputs return `00:00:00,000`.
 */
export function formatSrtTimestamp(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00:00,000';
    const totalMs = Math.round(seconds * 1000);
    const ms = totalMs % 1000;
    const totalSec = Math.floor(totalMs / 1000);
    const sec = totalSec % 60;
    const totalMin = Math.floor(totalSec / 60);
    const min = totalMin % 60;
    const hr = Math.floor(totalMin / 60);
    return (
        pad2(hr) + ':' + pad2(min) + ':' + pad2(sec) + ',' + pad3(ms)
    );
}

function pad2(n: number): string {
    return n < 10 ? '0' + n : String(n);
}

function pad3(n: number): string {
    if (n < 10) return '00' + n;
    if (n < 100) return '0' + n;
    return String(n);
}

// ── Text escape ──────────────────────────────────────────────────────────

/**
 * Minimal escape for SRT text. SRT is largely plain text; the only
 * transformation we apply is:
 *   - Normalize CRLF / LF / CR to LF.
 *   - Trim a single leading/trailing blank line.
 *   - Collapse runs of >2 blank lines down to 2 (paragraph separator).
 *   - Strip a BOM if present.
 *   - Remove ASCII NULs.
 *
 * We deliberately do NOT escape `<`, `>`, `&`, etc. — SRT does not
 * use HTML entities. Some players do accept `<i>` tags, so we leave
 * them alone for forward-compatibility.
 */
export function escapeSrtText(text: string): string {
    if (!text) return '';
    let out = text;
    // BOM
    if (out.charCodeAt(0) === 0xFEFF) out = out.slice(1);
    // NULs
    out = out.replace(/\u0000/g, '');
    // CRLF / CR → LF
    out = out.replace(/\r\n?/g, '\n');
    // Trim edges
    out = out.replace(/^\n+|\n+$/g, '');
    // Collapse 3+ newlines into 2
    out = out.replace(/\n{3,}/g, '\n\n');
    return out;
}

function softWrap(text: string, maxLen: number): string {
    if (!maxLen || maxLen < 4 || text.length <= maxLen) return text;
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
        const candidate = cur ? cur + ' ' + w : w;
        if (candidate.length > maxLen && cur) {
            lines.push(cur);
            cur = w;
        } else {
            cur = candidate;
        }
    }
    if (cur) lines.push(cur);
    return lines.join('\n');
}

// ── Entry builder ────────────────────────────────────────────────────────

export function buildSubtitleEntries(opts: SubtitleGenerationOptions): SubtitleEntry[] {
    const source = opts.source ?? 'onScreenText';
    const minDur = opts.minDurationSec ?? DEFAULT_MIN_DURATION_SEC;
    const padEnd = opts.padEndSec ?? DEFAULT_PAD_END_SEC;
    const padStart = opts.padStartSec ?? DEFAULT_PAD_START_SEC;
    const maxLen = opts.maxLineLength;

    const sceneById = new Map<string, Scene>();
    for (const s of opts.scenes) sceneById.set(s.id, s);

    // Iterate clips in timeline order; skip orphans (no scene) and
    // clips too short to be useful.
    const out: SubtitleEntry[] = [];
    let idx = 0;
    for (const clip of opts.timeline.clips) {
        if (clip.duration < minDur) continue;
        const scene = sceneById.get(clip.sceneId);
        if (!scene) continue;

        const rawText = pickText(scene, source);
        const text = rawText ? escapeSrtText(softWrap(rawText, maxLen ?? 0)) : '';
        if (!text) continue;

        idx += 1;
        const startSec = Math.max(0, clip.start + padStart);
        const endSec = Math.max(startSec + 0.001, clip.start + clip.duration - padEnd);
        out.push({
            index: idx,
            startSec,
            endSec,
            text,
            sceneId: clip.sceneId,
        });
    }
    return out;
}

function pickText(scene: Scene, source: SubtitleSource): string {
    const ost = (scene.onScreenText ?? '').trim();
    const vo = (scene.voiceover ?? '').trim();
    if (source === 'onScreenText') return ost || vo;
    if (source === 'voiceover') return vo || ost;
    // both: prefer onScreenText (designed for display); voiceover fallback
    return ost || vo;
}

// ── SRT serialization ───────────────────────────────────────────────────

/**
 * Build a UTF-8 SRT document from a list of subtitle entries.
 * Entries with empty text are skipped (defensive — the entry builder
 * already drops them). The returned string ends with a trailing
 * newline for clean concatenation.
 */
export function buildSrt(entries: SubtitleEntry[]): string {
    const lines: string[] = [];
    let written = 0;
    for (const e of entries) {
        if (!e.text) continue;
        written += 1;
        lines.push(String(written));
        lines.push(`${formatSrtTimestamp(e.startSec)} --> ${formatSrtTimestamp(e.endSec)}`);
        lines.push(e.text);
        lines.push(''); // blank line separator
    }
    if (lines.length === 0) return '\n';
    // Trailing blank is conventional; ensure it.
    if (lines[lines.length - 1] !== '') lines.push('');
    return lines.join('\n');
}

/**
 * One-shot helper: build entries + serialize. Returns `''` when the
 * timeline yields no subtitle text.
 */
export function buildSubtitles(opts: SubtitleGenerationOptions): string {
    return buildSrt(buildSubtitleEntries(opts));
}

// ── Validation ───────────────────────────────────────────────────────────

export function validateSubtitleEntries(entries: SubtitleEntry[]): SubtitleValidationResult {
    const errors: SubtitleValidationError[] = [];
    if (entries.length === 0) return { ok: true, errors };

    let prevEnd = -1;
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e.index < 1) {
            errors.push({ kind: 'empty_index', message: `entry[${i}] has invalid index ${e.index}`, index: i });
        }
        if (e.startSec < 0) {
            errors.push({ kind: 'negative_start', message: `entry[${i}] startSec < 0 (${e.startSec})`, index: i });
        }
        if (e.endSec <= e.startSec) {
            errors.push({
                kind: 'invalid_range',
                message: `entry[${i}] endSec (${e.endSec}) <= startSec (${e.startSec})`,
                index: i,
            });
        }
        if (i > 0 && e.startSec < prevEnd) {
            errors.push({
                kind: 'overlap',
                message: `entry[${i}] starts at ${e.startSec}s, overlaps previous entry ending at ${prevEnd}s`,
                index: i,
            });
        }
        if (i > 0 && e.startSec < entries[i - 1].startSec) {
            errors.push({
                kind: 'out_of_order',
                message: `entry[${i}] starts before entry ${i - 1}`,
                index: i,
            });
        }
        prevEnd = e.endSec;
    }
    return { ok: errors.length === 0, errors };
}

// ── FFmpeg filter integration ────────────────────────────────────────────

/**
 * Build the value for an ffmpeg `-vf subtitles=<path>` filter.
 *
 * ffmpeg's `subtitles` filter renders an SRT/ASS file onto the video.
 * `force_style` overrides ASS styling so we don't depend on a
 * pre-existing ASS header in the SRT.
 *
 * The returned string is the FULL filter expression — feed it as the
 * `-vf` argument or as part of a `-filter_complex` graph.
 *
 * Example output:
 *   `subtitles='/tmp/subs.srt':force_style='FontName=Inter,FontSize=24,
 *   PrimaryColour=&H00FFFFFF&,OutlineColour=&H00000000&,BorderStyle=1,
 *   Outline=2,Alignment=2'`
 */
export function buildSubtitleFilter(opts: {
    srtPath: string;
    style?: SubtitleStyle;
}): string {
    const style: Required<SubtitleStyle> = {
        fontSize: opts.style?.fontSize ?? 24,
        primaryColor: opts.style?.primaryColor ?? '&H00FFFFFF&',
        outlineColor: opts.style?.outlineColor ?? '&H00000000&',
        fontName: opts.style?.fontName ?? 'Inter',
    };

    const forceStyle = [
        `FontName=${style.fontName}`,
        `FontSize=${style.fontSize}`,
        `PrimaryColour=${style.primaryColor}`,
        `OutlineColour=${style.outlineColor}`,
        `BorderStyle=1`,
        `Outline=2`,
        `Shadow=1`,
        `Alignment=2`, // bottom-centre
    ].join(',');

    // Quote the path and the force_style to survive shell parsing.
    const quotedPath = escapeForFfmpegFilter(opts.srtPath);
    const quotedStyle = escapeForFfmpegFilter(forceStyle);
    return `subtitles='${quotedPath}':force_style='${quotedStyle}'`;
}

/**
 * Build the FULL ffmpeg argv entry for burning subtitles into the
 * output. Returns `null` when no SRT body is produced (so callers can
 * skip the filter chain entirely).
 *
 * Example output:
 *   ['-vf', `subtitles='/tmp/subs.srt':force_style='...'`]
 */
export function buildSubtitleArgs(opts: {
    timeline: Timeline;
    scenes: Scene[];
    srtPath: string;
    style?: SubtitleStyle;
    source?: SubtitleSource;
}): string[] | null {
    const srt = buildSubtitles({
        timeline: opts.timeline,
        scenes: opts.scenes,
        source: opts.source,
    });
    if (!srt.trim()) return null;
    return ['-vf', buildSubtitleFilter({ srtPath: opts.srtPath, style: opts.style })];
}

function escapeForFfmpegFilter(s: string): string {
    // Escape characters that ffmpeg's filter parser interprets:
    // single quotes (we wrap with ') and backslashes.
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
