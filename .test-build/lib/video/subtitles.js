"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SRT_TIMESTAMP_PRECISION = exports.DEFAULT_PAD_START_SEC = exports.DEFAULT_PAD_END_SEC = exports.DEFAULT_MIN_DURATION_SEC = void 0;
exports.formatSrtTimestamp = formatSrtTimestamp;
exports.escapeSrtText = escapeSrtText;
exports.buildSubtitleEntries = buildSubtitleEntries;
exports.buildSrt = buildSrt;
exports.buildSubtitles = buildSubtitles;
exports.validateSubtitleEntries = validateSubtitleEntries;
exports.buildSubtitleFilter = buildSubtitleFilter;
exports.buildSubtitleArgs = buildSubtitleArgs;
// ── Constants ────────────────────────────────────────────────────────────
exports.DEFAULT_MIN_DURATION_SEC = 0.5;
exports.DEFAULT_PAD_END_SEC = 0;
exports.DEFAULT_PAD_START_SEC = 0;
exports.SRT_TIMESTAMP_PRECISION = 3; // milliseconds
// ── Timestamp formatter ──────────────────────────────────────────────────
/**
 * Format seconds as `HH:MM:SS,mmm` (SRT format). Negative or
 * non-finite inputs return `00:00:00,000`.
 */
function formatSrtTimestamp(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0)
        return '00:00:00,000';
    const totalMs = Math.round(seconds * 1000);
    const ms = totalMs % 1000;
    const totalSec = Math.floor(totalMs / 1000);
    const sec = totalSec % 60;
    const totalMin = Math.floor(totalSec / 60);
    const min = totalMin % 60;
    const hr = Math.floor(totalMin / 60);
    return (pad2(hr) + ':' + pad2(min) + ':' + pad2(sec) + ',' + pad3(ms));
}
function pad2(n) {
    return n < 10 ? '0' + n : String(n);
}
function pad3(n) {
    if (n < 10)
        return '00' + n;
    if (n < 100)
        return '0' + n;
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
function escapeSrtText(text) {
    if (!text)
        return '';
    let out = text;
    // BOM
    if (out.charCodeAt(0) === 0xFEFF)
        out = out.slice(1);
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
function softWrap(text, maxLen) {
    if (!maxLen || maxLen < 4 || text.length <= maxLen)
        return text;
    const words = text.split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
        const candidate = cur ? cur + ' ' + w : w;
        if (candidate.length > maxLen && cur) {
            lines.push(cur);
            cur = w;
        }
        else {
            cur = candidate;
        }
    }
    if (cur)
        lines.push(cur);
    return lines.join('\n');
}
// ── Entry builder ────────────────────────────────────────────────────────
function buildSubtitleEntries(opts) {
    const source = opts.source ?? 'onScreenText';
    const minDur = opts.minDurationSec ?? exports.DEFAULT_MIN_DURATION_SEC;
    const padEnd = opts.padEndSec ?? exports.DEFAULT_PAD_END_SEC;
    const padStart = opts.padStartSec ?? exports.DEFAULT_PAD_START_SEC;
    const maxLen = opts.maxLineLength;
    const sceneById = new Map();
    for (const s of opts.scenes)
        sceneById.set(s.id, s);
    // Iterate clips in timeline order; skip orphans (no scene) and
    // clips too short to be useful.
    const out = [];
    let idx = 0;
    for (const clip of opts.timeline.clips) {
        if (clip.duration < minDur)
            continue;
        const scene = sceneById.get(clip.sceneId);
        if (!scene)
            continue;
        const rawText = pickText(scene, source);
        const text = rawText ? escapeSrtText(softWrap(rawText, maxLen ?? 0)) : '';
        if (!text)
            continue;
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
function pickText(scene, source) {
    const ost = (scene.onScreenText ?? '').trim();
    const vo = (scene.voiceover ?? '').trim();
    if (source === 'onScreenText')
        return ost || vo;
    if (source === 'voiceover')
        return vo || ost;
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
function buildSrt(entries) {
    const lines = [];
    let written = 0;
    for (const e of entries) {
        if (!e.text)
            continue;
        written += 1;
        lines.push(String(written));
        lines.push(`${formatSrtTimestamp(e.startSec)} --> ${formatSrtTimestamp(e.endSec)}`);
        lines.push(e.text);
        lines.push(''); // blank line separator
    }
    if (lines.length === 0)
        return '\n';
    // Trailing blank is conventional; ensure it.
    if (lines[lines.length - 1] !== '')
        lines.push('');
    return lines.join('\n');
}
/**
 * One-shot helper: build entries + serialize. Returns `''` when the
 * timeline yields no subtitle text.
 */
function buildSubtitles(opts) {
    return buildSrt(buildSubtitleEntries(opts));
}
// ── Validation ───────────────────────────────────────────────────────────
function validateSubtitleEntries(entries) {
    const errors = [];
    if (entries.length === 0)
        return { ok: true, errors };
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
function buildSubtitleFilter(opts) {
    const style = {
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
function buildSubtitleArgs(opts) {
    const srt = buildSubtitles({
        timeline: opts.timeline,
        scenes: opts.scenes,
        source: opts.source,
    });
    if (!srt.trim())
        return null;
    return ['-vf', buildSubtitleFilter({ srtPath: opts.srtPath, style: opts.style })];
}
function escapeForFfmpegFilter(s) {
    // Escape characters that ffmpeg's filter parser interprets:
    // single quotes (we wrap with ') and backslashes.
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
