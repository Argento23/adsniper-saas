"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComposeValidationError = void 0;
exports.validateCompositionInput = validateCompositionInput;
exports.isAcceptableSource = isAcceptableSource;
exports.composeTimeline = composeTimeline;
exports.clipCount = clipCount;
exports.clipsByTransition = clipsByTransition;
exports.compositionStrategy = compositionStrategy;
const timeline_1 = require("@/lib/projects/timeline");
const ffmpeg_1 = require("./ffmpeg");
// ── Errors ───────────────────────────────────────────────────────────────
class ComposeValidationError extends Error {
    errors;
    constructor(errors) {
        super(`compose failed: ${errors.join('; ')}`);
        this.name = 'ComposeValidationError';
        this.errors = errors;
    }
}
exports.ComposeValidationError = ComposeValidationError;
// ── Default IO implementations ───────────────────────────────────────────
async function defaultFileExists(path) {
    try {
        // Dynamic import keeps the module browser-safe when running
        // under Node-style tests; in the browser this returns false.
        if (typeof window !== 'undefined')
            return false;
        const fs = await Promise.resolve().then(() => __importStar(require('node:fs/promises')));
        await fs.access(path);
        return true;
    }
    catch {
        return false;
    }
}
async function defaultWriteFile(path, data) {
    if (typeof window !== 'undefined') {
        throw new Error('writeFile is not available in the browser; pass an explicit writeFile');
    }
    const fs = await Promise.resolve().then(() => __importStar(require('node:fs/promises')));
    await fs.writeFile(path, data);
}
async function defaultMkdir(path, opts) {
    if (typeof window !== 'undefined') {
        throw new Error('mkdir is not available in the browser; pass an explicit mkdir');
    }
    const fs = await Promise.resolve().then(() => __importStar(require('node:fs/promises')));
    await fs.mkdir(path, opts);
}
// ── Validation ───────────────────────────────────────────────────────────
function validateCompositionInput(opts) {
    const errors = [];
    if (!opts.timeline)
        errors.push('timeline is required');
    if (!opts.outputPath)
        errors.push('outputPath is required');
    if (!opts.workDir)
        errors.push('workDir is required');
    if (opts.timeline) {
        const v = (0, timeline_1.validateTimeline)(opts.timeline);
        if (!v.ok) {
            for (const e of v.errors)
                errors.push(e.message);
        }
        if (opts.timeline.clips.length === 0) {
            errors.push('timeline has no clips');
        }
        if (!ffmpeg_1.VALID_ASPECTS.includes(opts.timeline.aspectRatio)) {
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
function isAcceptableSource(src) {
    if (!src || typeof src !== 'string')
        return false;
    if (src.startsWith('http://') || src.startsWith('https://'))
        return true;
    if (src.startsWith('data:'))
        return true;
    if (src.startsWith('file://'))
        return true;
    if (src.length > 0)
        return true; // treat as local path; existence is checked separately
    return false;
}
// ── Path resolution ──────────────────────────────────────────────────────
function extensionFromMime(mime) {
    if (mime.includes('mp4') || mime.includes('h264'))
        return 'mp4';
    if (mime.includes('webm'))
        return 'webm';
    if (mime.includes('quicktime') || mime.includes('mov'))
        return 'mov';
    return 'mp4';
}
function safeFileName(id) {
    return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}
function isAbsolutePath(p) {
    return /^([a-zA-Z]:[\\\/]|\/)/.test(p);
}
async function resolveSource(clip, workDir, deps) {
    const { fetcher, writeFile, fileExists, mkdir } = deps;
    const src = clip.sourceUrl;
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
        if (!match)
            throw new Error(`invalid data URI for clip ${clip.id}`);
        const mime = match[1] ?? 'video/mp4';
        const isBase64 = match[2] === ';base64';
        const payload = match[3];
        const ext = extensionFromMime(mime);
        const localPath = `${workDir}/${safeFileName(clip.id)}.${ext}`;
        if (isBase64) {
            const buf = Buffer.from(payload, 'base64');
            await writeFile(localPath, new Uint8Array(buf));
        }
        else {
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
async function composeTimeline(opts) {
    const errors = validateCompositionInput(opts);
    if (errors.length > 0)
        return { ok: false, errors };
    const fetcher = opts.fetcher ?? fetch;
    const writeFile = opts.writeFile ?? defaultWriteFile;
    const fileExists = opts.fileExists ?? defaultFileExists;
    const mkdir = opts.mkdir ?? defaultMkdir;
    const resolved = [];
    try {
        for (const clip of opts.timeline.clips) {
            const r = await resolveSource(clip, opts.workDir, { fetcher, writeFile, fileExists, mkdir });
            resolved.push(r);
        }
    }
    catch (e) {
        return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
    }
    const localPaths = resolved.map(r => r.localPath);
    const useXfade = (0, ffmpeg_1.needsXfade)(opts.timeline);
    const concatListPath = useXfade ? undefined : `${opts.workDir}/_concat.txt`;
    const built = (0, ffmpeg_1.buildFfmpegCommand)({
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
            concatListContent: useXfade ? undefined : (0, ffmpeg_1.buildConcatListContent)(localPaths),
        },
    };
}
// ── Pure selectors (re-exported for tests + UI) ──────────────────────────
function clipCount(opts) {
    return opts.timeline.clips.length;
}
function clipsByTransition(opts) {
    const cut = [];
    const fade = [];
    const dissolve = [];
    for (const c of opts.timeline.clips) {
        if (!c.transition || c.transition === 'cut')
            cut.push(c);
        else if (c.transition === 'fade')
            fade.push(c);
        else if (c.transition === 'dissolve')
            dissolve.push(c);
    }
    return { cut, fade, dissolve };
}
function compositionStrategy(opts) {
    return (0, ffmpeg_1.needsXfade)(opts.timeline) ? 'xfade' : 'concat';
}
