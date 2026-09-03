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

import { join } from 'node:path';
import { GenerationJob, JobStatus } from '@/lib/jobs/types';
import { Timeline } from '@/lib/projects/timeline';
import { Scene } from '@/lib/projects/types';
import {
    composeTimeline,
    Composition,
    validateCompositionInput,
    ComposeResult,
} from '@/lib/video/composer';
import {
    buildSubtitles,
    buildSubtitleArgs,
} from '@/lib/video/subtitles';
import { StorageAdapter, LocalStorageAdapter, getStorage } from '@/lib/storage';

// ── Types ────────────────────────────────────────────────────────────────

export interface ExportRunnerDeps {
    /** Resolve a persisted timeline by projectId. */
    loadTimeline: (projectId: string) => Timeline | null | Promise<Timeline | null>;
    /** Resolve scenes for the project (used by subtitles). */
    loadScenes: (projectId: string) => Scene[] | Promise<Scene[]>;
    /** Update job state. */
    markProcessing: (jobId: string) => void;
    markCompleted: (jobId: string, output: { outputUrl: string; outputAssetId?: string }) => void;
    markFailed: (jobId: string, error: string) => void;
    /**
     * Storage adapter for the final MP4. Required.
     * Use `getStorage()` from `@/lib/storage` to construct the
     * environment-appropriate adapter.
     */
    storage: StorageAdapter;
    /**
     * Resolve the absolute path of the local workdir used for
     * intermediate artifacts (concat list, SRT, downloaded sources,
     * local MP4 before upload). Default: `os.tmpdir()/export-{jobId}`.
     */
    resolveWorkDir?: (jobId: string) => string;
    /** Spawn ffmpeg. Default: `child_process.spawn('ffmpeg', args)`. */
    spawn?: (cmd: string, args: string[]) => SpawnedProcess;
    /** Override `globalThis.fetch` (for tests). */
    fetcher?: typeof fetch;
    /** Write text to disk (default: fs.promises.writeFile). */
    writeFile?: (path: string, data: string | Uint8Array) => Promise<void>;
    /** Make a directory (default: fs.promises.mkdir). */
    mkdir?: (path: string, opts: { recursive: boolean }) => Promise<void>;
    /** Read a file from disk (default: fs.promises.readFile). */
    readFile?: (path: string) => Promise<Buffer>;
}

export interface SpawnedProcess {
    on(event: 'exit', cb: (code: number | null, signal: NodeJS.Signals | null) => void): void;
    on(event: 'error', cb: (err: Error) => void): void;
    stderr?: { on(event: 'data', cb: (chunk: Buffer) => void): void };
}

export interface PreFlightError {
    ok: false;
    errors: string[];
    kind: 'no_timeline' | 'no_clips' | 'missing_video' | 'invalid_timeline';
}

export interface PreFlightOk {
    ok: true;
    timeline: Timeline;
    scenes: Scene[];
}

export type PreFlightResult = PreFlightOk | PreFlightError;

// ── Pre-flight validation (pure) ────────────────────────────────────────

/**
 * Pre-flight validation that runs BEFORE a job is enqueued. Returns
 * the validated timeline + scenes for the runner, or a structured
 * error that the API surface can render directly to the user.
 *
 * Pure: does NOT spawn anything, does NOT write anywhere.
 */
export async function runExportPreFlight(opts: {
    projectId: string;
    loadTimeline: ExportRunnerDeps['loadTimeline'];
    loadScenes: ExportRunnerDeps['loadScenes'];
}): Promise<PreFlightResult> {
    const timeline = await opts.loadTimeline(opts.projectId);
    if (!timeline) {
        return { ok: false, kind: 'no_timeline', errors: ['No timeline saved for this project. Save the timeline first.'] };
    }
    if (timeline.clips.length === 0) {
        return { ok: false, kind: 'no_clips', errors: ['Timeline has no clips. Add scenes before exporting.'] };
    }

    const scenes = await opts.loadScenes(opts.projectId);
    const sceneById = new Map<string, Scene>();
    for (const s of scenes) sceneById.set(s.id, s);

    const missing: string[] = [];
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
export async function runExport(job: GenerationJob, deps: ExportRunnerDeps): Promise<void> {
    if (job.type !== 'export') {
        deps.markFailed(job.id, `job ${job.id} is not an export job (type=${job.type})`);
        return;
    }
    if (!job.projectId) {
        deps.markFailed(job.id, 'job is missing projectId');
        return;
    }

    deps.markProcessing(job.id);

    let pre: PreFlightResult;
    try {
        pre = await runExportPreFlight({
            projectId: job.projectId,
            loadTimeline: deps.loadTimeline,
            loadScenes: deps.loadScenes,
        });
    } catch (e) {
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
    } catch (e) {
        deps.markFailed(job.id, `failed to create work dir: ${e instanceof Error ? e.message : String(e)}`);
        return;
    }

    const outputPath = `${workDir}/${job.id}.mp4`;
    const srtPath = `${workDir}/subs.srt`;
    const concatListPath = `${workDir}/concat.txt`;

    const result: ComposeResult = await composeTimeline({
        timeline: pre.timeline,
        outputPath,
        workDir,
        fetcher: deps.fetcher,
        writeFile: deps.writeFile as (p: string, data: Uint8Array) => Promise<void>,
        mkdir: deps.mkdir,
    });

    if (!result.ok) {
        deps.markFailed(job.id, result.errors.join(' '));
        return;
    }

    // Write SRT (always, even if no subtitles — the runner decides).
    const srtBody = buildSubtitles({
        timeline: pre.timeline,
        scenes: pre.scenes,
    });
    if (srtBody.trim()) {
        try {
            await (deps.mkdir ?? defaultMkdir)(workDir, { recursive: true });
            await (deps.writeFile ?? defaultWriteFile)(srtPath, srtBody);
        } catch (e) {
            deps.markFailed(job.id, `failed to write subtitles: ${e instanceof Error ? e.message : String(e)}`);
            return;
        }
    }

    const args = [...result.composition.command.args];
    const subArgs = buildSubtitleArgs({
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
        } catch (e) {
            deps.markFailed(job.id, `failed to write concat list: ${e instanceof Error ? e.message : String(e)}`);
            return;
        }
    }

    // Spawn ffmpeg.
    try {
        await runFfmpeg(args, deps);
    } catch (e) {
        deps.markFailed(job.id, e instanceof Error ? e.message : 'ffmpeg spawn failed');
        return;
    }

    // Read the local MP4 from workDir and upload via storage adapter.
    let body: Buffer;
    try {
        body = await (deps.readFile ?? defaultReadFile)(outputPath);
    } catch (e) {
        deps.markFailed(job.id, `failed to read local output: ${e instanceof Error ? e.message : String(e)}`);
        return;
    }

    const key = `${job.id}.mp4`;
    let uploadResult: { key: string; url: string };
    try {
        uploadResult = await deps.storage.upload(key, body, 'video/mp4');
    } catch (e) {
        deps.markFailed(job.id, `storage upload failed: ${e instanceof Error ? e.message : String(e)}`);
        return;
    }

    deps.markCompleted(job.id, {
        outputUrl: uploadResult.url,
        outputAssetId: uploadResult.key,
    });
}

// ── ffmpeg spawn (default impl + injected for tests) ────────────────────

function runFfmpeg(args: string[], deps: ExportRunnerDeps): Promise<void> {
    return new Promise((resolve, reject) => {
        let proc: SpawnedProcess;
        try {
            if (deps.spawn) {
                proc = deps.spawn('ffmpeg', args);
            } else {
                // Dynamic require keeps the module browser-safe.
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const cp = require('node:child_process') as typeof import('node:child_process');
                proc = cp.spawn('ffmpeg', args) as unknown as SpawnedProcess;
            }
        } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
            return;
        }

        let stderrBuf = '';
        const stderr = (proc as unknown as { stderr?: NodeJS.ReadableStream }).stderr;
        if (stderr && typeof stderr.on === 'function') {
            stderr.on('data', (chunk: Buffer) => {
                stderrBuf += chunk.toString('utf8');
                // Keep last 4 KB only.
                if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-4096);
            });
        }
        proc.on('error', (err) => reject(err));
        proc.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`ffmpeg exited with code ${code}: ${stderrBuf.trim().split('\n').slice(-5).join(' | ')}`));
        });
    });
}

async function defaultWriteFile(path: string, data: string | Uint8Array): Promise<void> {
    if (typeof window !== 'undefined') {
        throw new Error('writeFile not available in browser');
    }
    const fs = await import('node:fs/promises');
    await fs.writeFile(path, data as string | NodeJS.ArrayBufferView);
}

async function defaultMkdir(path: string, opts: { recursive: boolean }): Promise<void> {
    if (typeof window !== 'undefined') {
        throw new Error('mkdir not available in browser');
    }
    const fs = await import('node:fs/promises');
    await fs.mkdir(path, opts);
}

async function defaultReadFile(path: string): Promise<Buffer> {
    if (typeof window !== 'undefined') {
        throw new Error('readFile not available in browser');
    }
    const fs = await import('node:fs/promises');
    return await fs.readFile(path);
}

function defaultWorkDir(jobId: string): string {
    const tmp = process.env.TMPDIR ?? process.env.TMP ?? (typeof window !== 'undefined' ? '/tmp' : require('node:os').tmpdir());
    return join(tmp, `export-${jobId}`);
}

// ── State helpers ───────────────────────────────────────────────────────

/**
 * Returns the human-readable status label used in the UI.
 */
export function describeJobStatus(status: JobStatus): string {
    switch (status) {
        case 'queued':     return 'Queued...';
        case 'processing': return 'Processing...';
        case 'completed':  return 'Completed';
        case 'failed':     return 'Failed';
        case 'cancelled':  return 'Cancelled';
    }
}

/**
 * Synchronous URL helper for code paths that don't await (tests, UI).
 * Returns the local-dev public URL (`/exports/{jobId}.mp4`). For
 * production (S3) URLs use `await storage.urlFor(key)`.
 */
export function publicUrlForJob(jobId: string): string {
    return `/exports/${jobId}.mp4`;
}

/**
 * Convenience: build a default deps object for local dev using the
 * `LocalStorageAdapter` that writes to `public/exports/`. Tests should
 * construct their own deps; this is for the API handler only.
 */
export function buildDefaultExportDeps(partial: Partial<ExportRunnerDeps> & Pick<ExportRunnerDeps, 'loadTimeline' | 'loadScenes' | 'markProcessing' | 'markCompleted' | 'markFailed'>): ExportRunnerDeps {
    return {
        ...partial,
        storage: partial.storage ?? getStorage({ driver: 'local' }),
    };
}

// ── Re-exports for tests ────────────────────────────────────────────────

export type { Composition };
export { LocalStorageAdapter };
