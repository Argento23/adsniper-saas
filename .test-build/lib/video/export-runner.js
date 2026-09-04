"use strict";
/**
 * Export runner — Phase 6G + Production storage layer.
 *
 * Orchestrates the full export pipeline:
 *
 *   Timeline
 *     ↓
 *   Validate (clips have sourceUrls, no gaps, valid aspect ratio)
 *     ↓
 *   composeTimeline (downloads sources, builds ffmpeg command)
 *     ↓
 *   buildSubtitles (writes SRT to workDir)
 *     ↓
 *   spawn ffmpeg → writes MP4 to local workDir
 *     ↓
 *   storage.upload(key, body) → S3 bucket OR public/exports/
 *     ↓
 *   markCompleted (with outputUrl) | markFailed (with stderr)
 *
 * Reuses `InMemoryJobQueue` from `lib/jobs/queue.ts` for state.
 * Reuses `composeTimeline` + `buildFfmpegCommand` from Phase 6E.
 * Reuses `buildSubtitles` + `buildSubtitleFilter` from Phase 6F.
 *
 * Storage is fully injectable via `deps.storage` so the runner is
 * backend-agnostic:
 *   - dev/test → `LocalStorageAdapter` (writes public/exports/)
 *   - prod    → `S3StorageAdapter` (S3 / Cloudflare R2 / MinIO)
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
exports.LocalStorageAdapter = void 0;
exports.runExportPreFlight = runExportPreFlight;
exports.runExport = runExport;
exports.describeJobStatus = describeJobStatus;
exports.publicUrlForJob = publicUrlForJob;
exports.buildDefaultExportDeps = buildDefaultExportDeps;
const node_path_1 = require("node:path");
const composer_1 = require("@/lib/video/composer");
const subtitles_1 = require("@/lib/video/subtitles");
const storage_1 = require("@/lib/storage");
Object.defineProperty(exports, "LocalStorageAdapter", { enumerable: true, get: function () { return storage_1.LocalStorageAdapter; } });
// ── Pre-flight validation (pure) ────────────────────────────────────────
/**
 * Pre-flight validation that runs BEFORE a job is enqueued. Returns
 * the validated timeline + scenes for the runner, or a structured
 * error that the API surface can render directly to the user.
 *
 * Pure: does NOT spawn anything, does NOT write anywhere.
 */
async function runExportPreFlight(opts) {
    const timeline = await opts.loadTimeline(opts.projectId);
    if (!timeline) {
        return { ok: false, kind: 'no_timeline', errors: ['No timeline saved for this project. Save the timeline first.'] };
    }
    if (timeline.clips.length === 0) {
        return { ok: false, kind: 'no_clips', errors: ['Timeline has no clips. Add scenes before exporting.'] };
    }
    const scenes = await opts.loadScenes(opts.projectId);
    const sceneById = new Map();
    for (const s of scenes)
        sceneById.set(s.id, s);
    const missing = [];
    for (let i = 0; i < timeline.clips.length; i++) {
        const clip = timeline.clips[i];
        if (!clip.sourceUrl || clip.sourceUrl.trim().length === 0) {
            missing.push(`Scene ${i + 1} has no generated video.`);
            continue;
        }
        const scene = sceneById.get(clip.sceneId);
        if (!scene) {
            missing.push(`Scene ${i + 1}: clip references unknown scene ${clip.sceneId}.`);
        }
    }
    if (missing.length > 0) {
        return { ok: false, kind: 'missing_video', errors: missing };
    }
    return { ok: true, timeline, scenes };
}
// ── Runner ──────────────────────────────────────────────────────────────
/**
 * Run the full export pipeline. Designed to be called without `await`
 * from the API handler (kicked off as a fire-and-forget background
 * task). Marks the job at each lifecycle step.
 */
async function runExport(job, deps) {
    if (job.type !== 'export') {
        deps.markFailed(job.id, `job ${job.id} is not an export job (type=${job.type})`);
        return;
    }
    if (!job.projectId) {
        deps.markFailed(job.id, 'job is missing projectId');
        return;
    }
    deps.markProcessing(job.id);
    let pre;
    try {
        pre = await runExportPreFlight({
            projectId: job.projectId,
            loadTimeline: deps.loadTimeline,
            loadScenes: deps.loadScenes,
        });
    }
    catch (e) {
        deps.markFailed(job.id, e instanceof Error ? e.message : 'preflight failed');
        return;
    }
    if (!pre.ok) {
        deps.markFailed(job.id, pre.errors.join(' '));
        return;
    }
    const workDir = (deps.resolveWorkDir ?? defaultWorkDir)(job.id);
    try {
        await (deps.mkdir ?? defaultMkdir)(workDir, { recursive: true });
    }
    catch (e) {
        deps.markFailed(job.id, `failed to create work dir: ${e instanceof Error ? e.message : String(e)}`);
        return;
    }
    const outputPath = `${workDir}/${job.id}.mp4`;
    const srtPath = `${workDir}/subs.srt`;
    const concatListPath = `${workDir}/concat.txt`;
    const result = await (0, composer_1.composeTimeline)({
        timeline: pre.timeline,
        outputPath,
        workDir,
        fetcher: deps.fetcher,
        writeFile: deps.writeFile,
        mkdir: deps.mkdir,
    });
    if (!result.ok) {
        deps.markFailed(job.id, result.errors.join(' '));
        return;
    }
    // Write SRT (always, even if no subtitles — the runner decides).
    const srtBody = (0, subtitles_1.buildSubtitles)({
        timeline: pre.timeline,
        scenes: pre.scenes,
    });
    if (srtBody.trim()) {
        try {
            await (deps.mkdir ?? defaultMkdir)(workDir, { recursive: true });
            await (deps.writeFile ?? defaultWriteFile)(srtPath, srtBody);
        }
        catch (e) {
            deps.markFailed(job.id, `failed to write subtitles: ${e instanceof Error ? e.message : String(e)}`);
            return;
        }
    }
    const args = [...result.composition.command.args];
    const subArgs = (0, subtitles_1.buildSubtitleArgs)({
        timeline: pre.timeline,
        scenes: pre.scenes,
        srtPath,
    });
    // Insert the subtitle filter BEFORE the output path (last arg).
    if (subArgs && srtBody.trim()) {
        const outputIdx = args.lastIndexOf(result.composition.outputPath);
        if (outputIdx > 0) {
            args.splice(outputIdx, 0, ...subArgs);
        }
    }
    // Write concat list if the path needs it.
    if (result.composition.path === 'concat' && result.composition.concatListContent) {
        try {
            await (deps.writeFile ?? defaultWriteFile)(concatListPath, result.composition.concatListContent);
        }
        catch (e) {
            deps.markFailed(job.id, `failed to write concat list: ${e instanceof Error ? e.message : String(e)}`);
            return;
        }
    }
    // Spawn ffmpeg.
    try {
        await runFfmpeg(args, deps);
    }
    catch (e) {
        deps.markFailed(job.id, e instanceof Error ? e.message : 'ffmpeg spawn failed');
        return;
    }
    // Read the local MP4 from workDir and upload via storage adapter.
    let body;
    try {
        body = await (deps.readFile ?? defaultReadFile)(outputPath);
    }
    catch (e) {
        deps.markFailed(job.id, `failed to read local output: ${e instanceof Error ? e.message : String(e)}`);
        return;
    }
    const key = `${job.id}.mp4`;
    let uploadResult;
    try {
        uploadResult = await deps.storage.upload(key, body, 'video/mp4');
    }
    catch (e) {
        deps.markFailed(job.id, `storage upload failed: ${e instanceof Error ? e.message : String(e)}`);
        return;
    }
    deps.markCompleted(job.id, {
        outputUrl: uploadResult.url,
        outputAssetId: uploadResult.key,
    });
}
// ── ffmpeg spawn (default impl + injected for tests) ────────────────────
function runFfmpeg(args, deps) {
    return new Promise((resolve, reject) => {
        let proc;
        try {
            if (deps.spawn) {
                proc = deps.spawn('ffmpeg', args);
            }
            else {
                // Dynamic require keeps the module browser-safe.
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const cp = require('node:child_process');
                proc = cp.spawn('ffmpeg', args);
            }
        }
        catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
            return;
        }
        let stderrBuf = '';
        const stderr = proc.stderr;
        if (stderr && typeof stderr.on === 'function') {
            stderr.on('data', (chunk) => {
                stderrBuf += chunk.toString('utf8');
                // Keep last 4 KB only.
                if (stderrBuf.length > 4096)
                    stderrBuf = stderrBuf.slice(-4096);
            });
        }
        proc.on('error', (err) => reject(err));
        proc.on('exit', (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`ffmpeg exited with code ${code}: ${stderrBuf.trim().split('\n').slice(-5).join(' | ')}`));
        });
    });
}
async function defaultWriteFile(path, data) {
    if (typeof window !== 'undefined') {
        throw new Error('writeFile not available in browser');
    }
    const fs = await Promise.resolve().then(() => __importStar(require('node:fs/promises')));
    await fs.writeFile(path, data);
}
async function defaultMkdir(path, opts) {
    if (typeof window !== 'undefined') {
        throw new Error('mkdir not available in browser');
    }
    const fs = await Promise.resolve().then(() => __importStar(require('node:fs/promises')));
    await fs.mkdir(path, opts);
}
async function defaultReadFile(path) {
    if (typeof window !== 'undefined') {
        throw new Error('readFile not available in browser');
    }
    const fs = await Promise.resolve().then(() => __importStar(require('node:fs/promises')));
    return await fs.readFile(path);
}
function defaultWorkDir(jobId) {
    const tmp = process.env.TMPDIR ?? process.env.TMP ?? (typeof window !== 'undefined' ? '/tmp' : require('node:os').tmpdir());
    return (0, node_path_1.join)(tmp, `export-${jobId}`);
}
// ── State helpers ───────────────────────────────────────────────────────
/**
 * Returns the human-readable status label used in the UI.
 */
function describeJobStatus(status) {
    switch (status) {
        case 'queued': return 'Queued...';
        case 'processing': return 'Processing...';
        case 'completed': return 'Completed';
        case 'failed': return 'Failed';
    }
}
/**
 * Synchronous URL helper for code paths that don't await (tests, UI).
 * Returns the local-dev public URL (`/exports/{jobId}.mp4`). For
 * production (S3) URLs use `await storage.urlFor(key)`.
 */
function publicUrlForJob(jobId) {
    return `/exports/${jobId}.mp4`;
}
/**
 * Convenience: build a default deps object for local dev using the
 * `LocalStorageAdapter` that writes to `public/exports/`. Tests should
 * construct their own deps; this is for the API handler only.
 */
function buildDefaultExportDeps(partial) {
    return {
        ...partial,
        storage: partial.storage ?? (0, storage_1.getStorage)({ driver: 'local' }),
    };
}
