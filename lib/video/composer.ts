/**
 * Multi-clip video composer — Phase 6E orchestrator.
 *
 * Responsibilities:
 *   1. Validate the timeline (delegates to `validateTimeline`)
 *   2. Ensure every clip has a usable `sourceUrl` (URL, local path,
 *      or pre-resolved data URI)
 *   3. Resolve all clip sources to local file paths (downloading
 *      remote URLs into a working directory)
 *   4. Choose between the concat demuxer path and the xfade filter
 *      path based on the clips' transitions
 *   5. Build the final ffmpeg command (delegates to `lib/video/ffmpeg.ts`)
 *
 * Does NOT spawn ffmpeg. The returned `Composition` is consumed by
 * a runner (browser-side `ffmpeg.wasm` or server-side binary) which
 * is out of scope for Phase 6E.
 */

import { Timeline, TimelineClip, validateTimeline } from '@/lib/projects/timeline';
import {
    BuildResult,
    FfmpegCommand,
    buildFfmpegCommand,
    buildConcatListContent,
    needsXfade,
    VALID_ASPECTS,
} from './ffmpeg';

// ── Result types ─────────────────────────────────────────────────────────

export interface ResolvedClipSource {
    clipId: string;
    /** Local path the runner should feed to ffmpeg. */
    localPath: string;
    /** Original source URL (may be a remote https://, data: URI, or local path). */
    source: string;
    /** True when the file already exists on disk. False when fetched remotely. */
    existed: boolean;
}

export interface Composition {
    timeline: Timeline;
    outputPath: string;
    command: FfmpegCommand;
    /** One entry per clip in the same order as `timeline.clips`. */
    resolvedSources: ResolvedClipSource[];
    /** Only present when the concat demuxer path was chosen. */
    concatListPath?: string;
    concatListContent?: string;
    /** Either "concat" or "xfade". */
    path: 'concat' | 'xfade';
}

export interface ComposeOptions {
    timeline: Timeline;
    outputPath: string;
    /** Working directory for downloaded remote sources. */
    workDir: string;
    /** Optional fetcher — defaults to global `fetch`. Allows tests to mock. */
    fetcher?: typeof fetch;
    /** Optional file writer — defaults to `fs.promises.writeFile`. */
    writeFile?: (path: string, data: Uint8Array) => Promise<void>;
    /** Optional file existence check — defaults to `fs.promises.access`. */
    fileExists?: (path: string) => Promise<boolean>;
    /** Optional directory maker — defaults to `fs.promises.mkdir`. */
    mkdir?: (path: string, opts: { recursive: boolean }) => Promise<void>;
}

export interface ComposeError {
    ok: false;
    errors: string[];
    field?: string;
}

export type ComposeResult =
    | { ok: true; composition: Composition }
    | { ok: false; errors: string[] };

// ── Errors ───────────────────────────────────────────────────────────────

export class ComposeValidationError extends Error {
    errors: string[];
    constructor(errors: string[]) {
        super(`compose failed: ${errors.join('; ')}`);
        this.name = 'ComposeValidationError';
        this.errors = errors;
    }
}

// ── Default IO implementations ───────────────────────────────────────────

async function defaultFileExists(path: string): Promise<boolean> {
    try {
        // Dynamic import keeps the module browser-safe when running
        // under Node-style tests; in the browser this returns false.
        if (typeof window !== 'undefined') return false;
        const fs = await import('node:fs/promises');
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}

async function defaultWriteFile(path: string, data: Uint8Array): Promise<void> {
    if (typeof window !== 'undefined') {
        throw new Error('writeFile is not available in the browser; pass an explicit writeFile');
    }
    const fs = await import('node:fs/promises');
    await fs.writeFile(path, data);
}

async function defaultMkdir(path: string, opts: { recursive: boolean }): Promise<void> {
    if (typeof window !== 'undefined') {
        throw new Error('mkdir is not available in the browser; pass an explicit mkdir');
    }
    const fs = await import('node:fs/promises');
    await fs.mkdir(path, opts);
}

// ── Validation ───────────────────────────────────────────────────────────

export function validateCompositionInput(opts: ComposeOptions): string[] {
    const errors: string[] = [];

    if (!opts.timeline) errors.push('timeline is required');
    if (!opts.outputPath) errors.push('outputPath is required');
    if (!opts.workDir) errors.push('workDir is required');

    if (opts.timeline) {
        const v = validateTimeline(opts.timeline);
        if (!v.ok) {
            for (const e of v.errors) errors.push(e.message);
        }
        if (opts.timeline.clips.length === 0) {
            errors.push('timeline has no clips');
        }
        if (!VALID_ASPECTS.includes(opts.timeline.aspectRatio as typeof VALID_ASPECTS[number])) {
            errors.push(`unsupported aspect ratio: ${opts.timeline.aspectRatio}`);
        }
        for (const clip of opts.timeline.clips) {
            if (!clip.sourceUrl || !isAcceptableSource(clip.sourceUrl)) {
                errors.push(`clip ${clip.id} has no usable sourceUrl`);
            }
        }
    }

    return errors;
}

/**
 * A clip source is acceptable when it is:
 *   - a remote http(s) URL (will be fetched into workDir), OR
 *   - a data: URI (will be decoded into workDir), OR
 *   - a non-empty local path that already exists.
 */
export function isAcceptableSource(src: string): boolean {
    if (!src || typeof src !== 'string') return false;
    if (src.startsWith('http://') || src.startsWith('https://')) return true;
    if (src.startsWith('data:')) return true;
    if (src.startsWith('file://')) return true;
    if (src.length > 0) return true; // treat as local path; existence is checked separately
    return false;
}

// ── Path resolution ──────────────────────────────────────────────────────

function extensionFromMime(mime: string): string {
    if (mime.includes('mp4') || mime.includes('h264')) return 'mp4';
    if (mime.includes('webm')) return 'webm';
    if (mime.includes('quicktime') || mime.includes('mov')) return 'mov';
    return 'mp4';
}

function safeFileName(id: string): string {
    return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function isAbsolutePath(p: string): boolean {
    return /^([a-zA-Z]:[\\\/]|\/)/.test(p);
}

async function resolveSource(
    clip: TimelineClip,
    workDir: string,
    deps: {
        fetcher: typeof fetch;
        writeFile: (p: string, data: Uint8Array) => Promise<void>;
        fileExists: (p: string) => Promise<boolean>;
        mkdir: (p: string, opts: { recursive: boolean }) => Promise<void>;
    },
): Promise<ResolvedClipSource> {
    const { fetcher, writeFile, fileExists, mkdir } = deps;
    const src = clip.sourceUrl as string;

    // Remote URL — download to workDir.
    if (src.startsWith('http://') || src.startsWith('https://')) {
        await mkdir(workDir, { recursive: true });
        const res = await fetcher(src);
        if (!res.ok) {
            throw new Error(`failed to fetch ${src}: HTTP ${res.status}`);
        }
        const mime = res.headers.get('content-type') ?? '';
        const ext = extensionFromMime(mime);
        const localPath = `${workDir}/${safeFileName(clip.id)}.${ext}`;
        const buf = new Uint8Array(await res.arrayBuffer());
        await writeFile(localPath, buf);
        return { clipId: clip.id, localPath, source: src, existed: false };
    }

    // Data URI — decode.
    if (src.startsWith('data:')) {
        await mkdir(workDir, { recursive: true });
        const match = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(src);
        if (!match) throw new Error(`invalid data URI for clip ${clip.id}`);
        const mime = match[1] ?? 'video/mp4';
        const isBase64 = match[2] === ';base64';
        const payload = match[3];
        const ext = extensionFromMime(mime);
        const localPath = `${workDir}/${safeFileName(clip.id)}.${ext}`;
        if (isBase64) {
            const buf = Buffer.from(payload, 'base64');
            await writeFile(localPath, new Uint8Array(buf));
        } else {
            await writeFile(localPath, new TextEncoder().encode(decodeURIComponent(payload)));
        }
        return { clipId: clip.id, localPath, source: src, existed: false };
    }

    // Local path — verify it exists.
    const stripped = src.startsWith('file://') ? src.slice('file://'.length) : src;
    const localPath = isAbsolutePath(stripped) ? stripped : `${workDir}/${stripped}`;
    const exists = await fileExists(localPath);
    if (!exists) {
        throw new Error(`clip ${clip.id} source not found on disk: ${localPath}`);
    }
    return { clipId: clip.id, localPath, source: src, existed: true };
}

// ── Main entry point ─────────────────────────────────────────────────────

export async function composeTimeline(opts: ComposeOptions): Promise<ComposeResult> {
    const errors = validateCompositionInput(opts);
    if (errors.length > 0) return { ok: false, errors };

    const fetcher = opts.fetcher ?? fetch;
    const writeFile = opts.writeFile ?? defaultWriteFile;
    const fileExists = opts.fileExists ?? defaultFileExists;
    const mkdir = opts.mkdir ?? defaultMkdir;

    const resolved: ResolvedClipSource[] = [];
    try {
        for (const clip of opts.timeline.clips) {
            const r = await resolveSource(clip, opts.workDir, { fetcher, writeFile, fileExists, mkdir });
            resolved.push(r);
        }
    } catch (e) {
        return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
    }

    const localPaths = resolved.map(r => r.localPath);
    const useXfade = needsXfade(opts.timeline);
    const concatListPath = useXfade ? undefined : `${opts.workDir}/_concat.txt`;

    const built: BuildResult = buildFfmpegCommand({
        timeline: opts.timeline,
        clipPaths: localPaths,
        outputPath: opts.outputPath,
        concatListPath,
    });

    if (!built.ok || !built.command) {
        return { ok: false, errors: built.errors ?? ['ffmpeg command build failed'] };
    }

    return {
        ok: true,
        composition: {
            timeline: opts.timeline,
            outputPath: opts.outputPath,
            command: built.command,
            resolvedSources: resolved,
            path: built.path ?? 'concat',
            concatListPath,
            concatListContent: useXfade ? undefined : buildConcatListContent(localPaths),
        },
    };
}

// ── Pure selectors (re-exported for tests + UI) ──────────────────────────

export function clipCount(opts: { timeline: Timeline }): number {
    return opts.timeline.clips.length;
}

export function clipsByTransition(opts: { timeline: Timeline }): {
    cut: TimelineClip[];
    fade: TimelineClip[];
    dissolve: TimelineClip[];
} {
    const cut: TimelineClip[] = [];
    const fade: TimelineClip[] = [];
    const dissolve: TimelineClip[] = [];
    for (const c of opts.timeline.clips) {
        if (!c.transition || c.transition === 'cut') cut.push(c);
        else if (c.transition === 'fade') fade.push(c);
        else if (c.transition === 'dissolve') dissolve.push(c);
    }
    return { cut, fade, dissolve };
}

export function compositionStrategy(opts: { timeline: Timeline }): 'concat' | 'xfade' {
    return needsXfade(opts.timeline) ? 'xfade' : 'concat';
}
