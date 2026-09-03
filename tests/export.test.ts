/**
 * Unit tests for Phase 6G — Export MP4 + async job.
 *
 * Coverage:
 *   - runExportPreFlight: missing timeline, missing clips, missing videos, success
 *   - runExport: state transitions queued → processing → completed
 *   - runExport: state transitions queued → processing → failed
 *   - publicUrlForJob URL format
 *   - describeJobStatus returns labels
 *   - Authorization: timeline store respects user isolation
 *   - Job enqueue: type='export' jobs are correctly classified
 */

import assert from 'node:assert/strict';
import { test } from './harness';

import {
    runExportPreFlight,
    runExport,
    publicUrlForJob,
    describeJobStatus,
} from '../lib/video/export-runner';
import { Timeline, TimelineClip } from '../lib/projects/timeline';
import { Scene } from '../lib/projects/types';

// ── helpers ──────────────────────────────────────────────────────────────
function mkTimeline(clips: TimelineClip[]): Timeline {
    return {
        id: 'tl',
        projectId: 'p_test',
        duration: clips.reduce((acc, c) => acc + c.duration, 0),
        clips,
        aspectRatio: '9:16',
        fps: 30,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    };
}

function mkScene(id: string): Scene {
    return {
        id,
        projectId: 'p_test',
        order: 0,
        visualPrompt: 'p',
        durationSec: 5,
        timestamps: { createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
        status: 'ready',
        videoAssetId: 'asset_x',
    };
}

function mkClip(id: string, sceneId: string, start: number, duration: number, sourceUrl?: string): TimelineClip {
    return {
        id,
        sceneId,
        start,
        duration,
        sourceUrl: sourceUrl ?? `https://cdn.example.com/${id}.mp4`,
    };
}

function mkJob(jobId: string, projectId: string) {
    return {
        id: jobId,
        userId: 'userA',
        projectId,
        type: 'export' as const,
        status: 'queued' as const,
        input: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    };
}

// ── publicUrlForJob + describeJobStatus ─────────────────────────────────
test('export: publicUrlForJob returns /exports/{jobId}.mp4', () => {
    assert.equal(publicUrlForJob('job_abc123'), '/exports/job_abc123.mp4');
});

test('export: describeJobStatus maps every status to a human label', () => {
    assert.equal(describeJobStatus('queued'), 'Queued...');
    assert.equal(describeJobStatus('processing'), 'Processing...');
    assert.equal(describeJobStatus('completed'), 'Completed');
    assert.equal(describeJobStatus('failed'), 'Failed');
    assert.equal(describeJobStatus('cancelled'), 'Cancelled');
});

// ── pre-flight: no_timeline ─────────────────────────────────────────────
test('preflight: rejects when no timeline is saved', async () => {
    const r = await runExportPreFlight({
        projectId: 'p1',
        loadTimeline: () => null,
        loadScenes: () => [],
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
        assert.equal(r.kind, 'no_timeline');
        assert.ok(r.errors.some(e => e.toLowerCase().includes('timeline')));
    }
});

test('preflight: rejects when timeline has no clips', async () => {
    const r = await runExportPreFlight({
        projectId: 'p1',
        loadTimeline: () => mkTimeline([]),
        loadScenes: () => [],
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
        assert.equal(r.kind, 'no_clips');
        assert.ok(r.errors.some(e => e.toLowerCase().includes('clips')));
    }
});

// ── pre-flight: missing video ───────────────────────────────────────────
test('preflight: rejects when a clip has no sourceUrl', async () => {
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4, 'https://cdn/1.mp4'),
        { id: 'c2', sceneId: 's2', start: 4, duration: 5 }, // no sourceUrl
        mkClip('c3', 's3', 9, 7, 'https://cdn/3.mp4'),
    ]);
    const r = await runExportPreFlight({
        projectId: 'p1',
        loadTimeline: () => t,
        loadScenes: () => [mkScene('s1'), mkScene('s3')],
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
        assert.equal(r.kind, 'missing_video');
        assert.ok(r.errors.some(e => e.includes('Scene 2')));
    }
});

test('preflight: rejects when a clip references an unknown scene', async () => {
    const t = mkTimeline([
        mkClip('c1', 'ghost', 0, 4, 'https://cdn/1.mp4'),
    ]);
    const r = await runExportPreFlight({
        projectId: 'p1',
        loadTimeline: () => t,
        loadScenes: () => [mkScene('s1')],
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
        assert.equal(r.kind, 'missing_video');
        assert.ok(r.errors.some(e => e.includes('unknown scene')));
    }
});

test('preflight: error message mentions the missing scene index', async () => {
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 's2', 4, 5, 'https://cdn/2.mp4'),
        mkClip('c3', 's3', 9, 7, 'https://cdn/3.mp4'),
        { id: 'c4', sceneId: 's4', start: 16, duration: 4 }, // no sourceUrl
    ]);
    const r = await runExportPreFlight({
        projectId: 'p1',
        loadTimeline: () => t,
        loadScenes: () => [mkScene('s1'), mkScene('s2'), mkScene('s3'), mkScene('s4')],
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.errors.some(e => e.includes('Scene 4')));
});

// ── pre-flight: success ─────────────────────────────────────────────────
test('preflight: returns ok with timeline + scenes when everything is ready', async () => {
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 's2', 4, 5, 'https://cdn/2.mp4'),
    ]);
    const scenes = [mkScene('s1'), mkScene('s2')];
    const r = await runExportPreFlight({
        projectId: 'p1',
        loadTimeline: () => t,
        loadScenes: () => scenes,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
        assert.equal(r.timeline.id, 'tl');
        assert.equal(r.scenes.length, 2);
    }
});

// ── runExport: state transitions ────────────────────────────────────────
test('export: state transitions queued → processing → completed', async () => {
    const transitions: string[] = [];
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4, 'data:video/mp4;base64,AAAAAA=='),
        mkClip('c2', 's2', 4, 5, 'data:video/mp4;base64,AAAAAA=='),
    ]);
    const scenes = [mkScene('s1'), mkScene('s2')];
    const fakeProc = {
        on(event: 'exit' | 'error', cb: (...args: unknown[]) => void) {
            if (event === 'exit') setImmediate(() => cb(0, null));
        },
        stderr: undefined,
    };
    await runExport(mkJob('job_1', 'p1'), {
        loadTimeline: () => t,
        loadScenes: () => scenes,
        markProcessing: (id) => transitions.push(`processing:${id}`),
        markCompleted: (id, out) => transitions.push(`completed:${id}:${out.outputUrl}`),
        markFailed: (id, err) => transitions.push(`failed:${id}:${err}`),
        resolveOutputDir: () => '/tmp/exports',
        spawn: () => fakeProc as unknown as ReturnType<NonNullable<Parameters<typeof runExport>[1]['spawn']>>,
        writeFile: async () => undefined,
        mkdir: async () => undefined,
    });
    assert.deepEqual(transitions, ['processing:job_1', 'completed:job_1:/exports/job_1.mp4']);
});

test('export: state transitions queued → processing → failed when ffmpeg errors', async () => {
    const transitions: string[] = [];
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4, 'data:video/mp4;base64,AAAAAA=='),
    ]);
    const scenes = [mkScene('s1')];
    const fakeProc = {
        on(event: 'exit' | 'error', cb: (...args: unknown[]) => void) {
            if (event === 'exit') setImmediate(() => cb(1, null));
        },
    };
    await runExport(mkJob('job_2', 'p1'), {
        loadTimeline: () => t,
        loadScenes: () => scenes,
        markProcessing: (id) => transitions.push(`processing:${id}`),
        markCompleted: (id) => transitions.push(`completed:${id}`),
        markFailed: (id, err) => transitions.push(`failed:${id}:${err}`),
        resolveOutputDir: () => '/tmp/exports',
        spawn: () => fakeProc as unknown as ReturnType<NonNullable<Parameters<typeof runExport>[1]['spawn']>>,
        writeFile: async () => undefined,
        mkdir: async () => undefined,
    });
    assert.equal(transitions.length, 2);
    assert.equal(transitions[0], 'processing:job_2');
    assert.ok(transitions[1].startsWith('failed:job_2:'));
});

test('export: marks failed when job type is not export', async () => {
    const transitions: string[] = [];
    const job = { ...mkJob('job_3', 'p1'), type: 'video' as const };
    await runExport(job, {
        loadTimeline: () => null,
        loadScenes: () => [],
        markProcessing: () => undefined,
        markCompleted: () => undefined,
        markFailed: (id, err) => transitions.push(`failed:${id}:${err}`),
        resolveOutputDir: () => '/tmp/exports',
    });
    assert.equal(transitions.length, 1);
    assert.ok(transitions[0].startsWith('failed:job_3:'));
    assert.ok(transitions[0].includes('not an export'));
});

test('export: marks failed when job is missing projectId', async () => {
    const transitions: string[] = [];
    const job = { ...mkJob('job_4', 'p1'), projectId: undefined };
    await runExport(job, {
        loadTimeline: () => null,
        loadScenes: () => [],
        markProcessing: () => undefined,
        markCompleted: () => undefined,
        markFailed: (id, err) => transitions.push(`failed:${id}:${err}`),
        resolveOutputDir: () => '/tmp/exports',
    });
    assert.equal(transitions.length, 1);
    assert.ok(transitions[0].includes('projectId'));
});

test('export: marks failed when pre-flight rejects (no clips)', async () => {
    const transitions: string[] = [];
    await runExport(mkJob('job_5', 'p1'), {
        loadTimeline: () => mkTimeline([]),
        loadScenes: () => [],
        markProcessing: (id) => transitions.push(`processing:${id}`),
        markCompleted: () => undefined,
        markFailed: (id, err) => transitions.push(`failed:${id}:${err}`),
        resolveOutputDir: () => '/tmp/exports',
    });
    // markProcessing is called first (job started), then markFailed after pre-flight.
    assert.equal(transitions.length, 2);
    assert.equal(transitions[0], 'processing:job_5');
    assert.ok(transitions[1].startsWith('failed:job_5:'));
    assert.ok(transitions[1].includes('Timeline has no clips'));
});

test('export: marks failed when pre-flight rejects (missing video)', async () => {
    const transitions: string[] = [];
    const t = mkTimeline([{ id: 'c1', sceneId: 's1', start: 0, duration: 4 }]); // no sourceUrl
    await runExport(mkJob('job_6', 'p1'), {
        loadTimeline: () => t,
        loadScenes: () => [mkScene('s1')],
        markProcessing: (id) => transitions.push(`processing:${id}`),
        markCompleted: () => undefined,
        markFailed: (id, err) => transitions.push(`failed:${id}:${err}`),
        resolveOutputDir: () => '/tmp/exports',
    });
    assert.equal(transitions.length, 2);
    assert.equal(transitions[0], 'processing:job_6');
    assert.ok(transitions[1].includes('Scene 1 has no generated video'));
});

// ── integration: queue ──────────────────────────────────────────────────
test('queue: export jobs are filtered separately from video jobs', () => {
    const { getJobQueue } = require('../lib/jobs/queue');
    const queue = getJobQueue();
    const a = queue.enqueue({
        userId: 'userA',
        projectId: 'p1',
        type: 'export',
        input: { timelineId: 'tl' },
    });
    const b = queue.enqueue({
        userId: 'userA',
        projectId: 'p1',
        type: 'video',
        sceneId: 's1',
        input: {},
    });
    assert.equal(a.type, 'export');
    assert.equal(b.type, 'video');
    assert.equal(a.status, 'queued');
    const exports = queue.listByUser('userA').filter((j: { type: string }) => j.type === 'export');
    assert.equal(exports.length, 1);
    assert.equal(exports[0].id, a.id);
});

test('queue: markProcessing → markCompleted is idempotent', () => {
    const { getJobQueue } = require('../lib/jobs/queue');
    const queue = getJobQueue();
    const job = queue.enqueue({
        userId: 'userB',
        projectId: 'p1',
        type: 'export',
        input: {},
    });
    queue.markProcessing(job.id);
    queue.markCompleted(job.id, { outputUrl: '/exports/x.mp4' });
    queue.markCompleted(job.id, { outputUrl: '/exports/y.mp4' }); // idempotent
    const fetched = queue.get(job.id);
    assert.equal(fetched.status, 'completed');
    assert.equal(fetched.outputUrl, '/exports/y.mp4');
});

// ── authorization: timeline store user isolation ────────────────────────
test('auth: timeline store rejects cross-user reads (cross-check via requireProject)', () => {
    const { requireProject } = require('../lib/projects/access');
    const g = globalThis as unknown as { window?: { localStorage?: { _data: Record<string, string>; getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } } };
    const store: Record<string, string> = {};
    g.window = {
        localStorage: {
            _data: store,
            getItem(k: string) { return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; },
            setItem(k: string, v: string) { this._data[k] = v; },
            removeItem(k: string) { delete this._data[k]; },
        },
    };
    store['AdSíntesisStudio.projects'] = JSON.stringify({
        userB: [{
            id: 'pB', userId: 'userB', name: 'B',
            brief: { product: '', objective: 'awareness', audience: '', platform: 'reels', style: '', language: 'es', referenceImages: [], productPhotos: [] },
            format: '9:16', duration: 20, status: 'draft',
            timeline: { totalDurationSec: 0, videoTrack: [], voiceTrack: [], musicTrack: [], textTrack: [] },
            createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z',
        }],
    });
    const r = requireProject('userA', 'pB');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 404);
});

export {};
