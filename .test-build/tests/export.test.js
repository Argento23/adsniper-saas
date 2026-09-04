"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const harness_1 = require("./harness");
const export_runner_1 = require("../lib/video/export-runner");
const fake_1 = require("../lib/storage/fake");
// ── helpers ──────────────────────────────────────────────────────────────
function mkTimeline(clips) {
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
function mkScene(id) {
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
function mkClip(id, sceneId, start, duration, sourceUrl) {
    return {
        id,
        sceneId,
        start,
        duration,
        sourceUrl: sourceUrl ?? `https://cdn.example.com/${id}.mp4`,
    };
}
function mkJob(jobId, projectId) {
    return {
        id: jobId,
        userId: 'userA',
        projectId,
        type: 'export',
        status: 'queued',
        input: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    };
}
// ── publicUrlForJob + describeJobStatus ─────────────────────────────────
(0, harness_1.test)('export: publicUrlForJob returns /exports/{jobId}.mp4', () => {
    strict_1.default.equal((0, export_runner_1.publicUrlForJob)('job_abc123'), '/exports/job_abc123.mp4');
});
(0, harness_1.test)('export: describeJobStatus maps every status to a human label', () => {
    strict_1.default.equal((0, export_runner_1.describeJobStatus)('queued'), 'Queued...');
    strict_1.default.equal((0, export_runner_1.describeJobStatus)('processing'), 'Processing...');
    strict_1.default.equal((0, export_runner_1.describeJobStatus)('completed'), 'Completed');
    strict_1.default.equal((0, export_runner_1.describeJobStatus)('failed'), 'Failed');
});
// ── pre-flight: no_timeline ─────────────────────────────────────────────
(0, harness_1.test)('preflight: rejects when no timeline is saved', async () => {
    const r = await (0, export_runner_1.runExportPreFlight)({
        projectId: 'p1',
        loadTimeline: () => null,
        loadScenes: () => [],
    });
    strict_1.default.equal(r.ok, false);
    if (!r.ok) {
        strict_1.default.equal(r.kind, 'no_timeline');
        strict_1.default.ok(r.errors.some(e => e.toLowerCase().includes('timeline')));
    }
});
(0, harness_1.test)('preflight: rejects when timeline has no clips', async () => {
    const r = await (0, export_runner_1.runExportPreFlight)({
        projectId: 'p1',
        loadTimeline: () => mkTimeline([]),
        loadScenes: () => [],
    });
    strict_1.default.equal(r.ok, false);
    if (!r.ok) {
        strict_1.default.equal(r.kind, 'no_clips');
        strict_1.default.ok(r.errors.some(e => e.toLowerCase().includes('clips')));
    }
});
// ── pre-flight: missing video ───────────────────────────────────────────
(0, harness_1.test)('preflight: rejects when a clip has no sourceUrl', async () => {
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4, 'https://cdn/1.mp4'),
        { id: 'c2', sceneId: 's2', start: 4, duration: 5 }, // no sourceUrl
        mkClip('c3', 's3', 9, 7, 'https://cdn/3.mp4'),
    ]);
    const r = await (0, export_runner_1.runExportPreFlight)({
        projectId: 'p1',
        loadTimeline: () => t,
        loadScenes: () => [mkScene('s1'), mkScene('s3')],
    });
    strict_1.default.equal(r.ok, false);
    if (!r.ok) {
        strict_1.default.equal(r.kind, 'missing_video');
        strict_1.default.ok(r.errors.some(e => e.includes('Scene 2')));
    }
});
(0, harness_1.test)('preflight: rejects when a clip references an unknown scene', async () => {
    const t = mkTimeline([
        mkClip('c1', 'ghost', 0, 4, 'https://cdn/1.mp4'),
    ]);
    const r = await (0, export_runner_1.runExportPreFlight)({
        projectId: 'p1',
        loadTimeline: () => t,
        loadScenes: () => [mkScene('s1')],
    });
    strict_1.default.equal(r.ok, false);
    if (!r.ok) {
        strict_1.default.equal(r.kind, 'missing_video');
        strict_1.default.ok(r.errors.some(e => e.includes('unknown scene')));
    }
});
(0, harness_1.test)('preflight: error message mentions the missing scene index', async () => {
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 's2', 4, 5, 'https://cdn/2.mp4'),
        mkClip('c3', 's3', 9, 7, 'https://cdn/3.mp4'),
        { id: 'c4', sceneId: 's4', start: 16, duration: 4 }, // no sourceUrl
    ]);
    const r = await (0, export_runner_1.runExportPreFlight)({
        projectId: 'p1',
        loadTimeline: () => t,
        loadScenes: () => [mkScene('s1'), mkScene('s2'), mkScene('s3'), mkScene('s4')],
    });
    strict_1.default.equal(r.ok, false);
    if (!r.ok)
        strict_1.default.ok(r.errors.some(e => e.includes('Scene 4')));
});
// ── pre-flight: success ─────────────────────────────────────────────────
(0, harness_1.test)('preflight: returns ok with timeline + scenes when everything is ready', async () => {
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4, 'https://cdn/1.mp4'),
        mkClip('c2', 's2', 4, 5, 'https://cdn/2.mp4'),
    ]);
    const scenes = [mkScene('s1'), mkScene('s2')];
    const r = await (0, export_runner_1.runExportPreFlight)({
        projectId: 'p1',
        loadTimeline: () => t,
        loadScenes: () => scenes,
    });
    strict_1.default.equal(r.ok, true);
    if (r.ok) {
        strict_1.default.equal(r.timeline.id, 'tl');
        strict_1.default.equal(r.scenes.length, 2);
    }
});
// ── runExport: state transitions ────────────────────────────────────────
(0, harness_1.test)('export: state transitions queued → processing → completed', async () => {
    const transitions = [];
    const storage = (0, fake_1.createFakeStorage)();
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4, 'data:video/mp4;base64,AAAAAA=='),
        mkClip('c2', 's2', 4, 5, 'data:video/mp4;base64,AAAAAA=='),
    ]);
    const scenes = [mkScene('s1'), mkScene('s2')];
    const fakeProc = {
        on(event, cb) {
            if (event === 'exit')
                setImmediate(() => cb(0, null));
        },
        stderr: undefined,
    };
    await (0, export_runner_1.runExport)(mkJob('job_1', 'p1'), {
        loadTimeline: () => t,
        loadScenes: () => scenes,
        markProcessing: (id) => transitions.push(`processing:${id}`),
        markCompleted: (id, out) => transitions.push(`completed:${id}:${out.outputUrl}`),
        markFailed: (id, err) => transitions.push(`failed:${id}:${err}`),
        resolveWorkDir: () => '/tmp/work',
        storage,
        spawn: () => fakeProc,
        writeFile: async () => undefined,
        mkdir: async () => undefined,
        readFile: async () => Buffer.from('fake-mp4-bytes'),
    });
    strict_1.default.deepEqual(transitions, ['processing:job_1', 'completed:job_1:/fake/job_1.mp4']);
    strict_1.default.equal(storage.uploads.length, 1);
    strict_1.default.equal(storage.uploads[0].key, 'job_1.mp4');
    strict_1.default.equal(storage.uploads[0].contentType, 'video/mp4');
    strict_1.default.equal(storage.uploads[0].bodySize, 'fake-mp4-bytes'.length);
});
(0, harness_1.test)('export: state transitions queued → processing → failed when ffmpeg errors', async () => {
    const transitions = [];
    const storage = (0, fake_1.createFakeStorage)();
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4, 'data:video/mp4;base64,AAAAAA=='),
    ]);
    const scenes = [mkScene('s1')];
    const fakeProc = {
        on(event, cb) {
            if (event === 'exit')
                setImmediate(() => cb(1, null));
        },
    };
    await (0, export_runner_1.runExport)(mkJob('job_2', 'p1'), {
        loadTimeline: () => t,
        loadScenes: () => scenes,
        markProcessing: (id) => transitions.push(`processing:${id}`),
        markCompleted: (id) => transitions.push(`completed:${id}`),
        markFailed: (id, err) => transitions.push(`failed:${id}:${err}`),
        resolveWorkDir: () => '/tmp/work',
        storage,
        spawn: () => fakeProc,
        writeFile: async () => undefined,
        mkdir: async () => undefined,
        readFile: async () => Buffer.from('unused'),
    });
    strict_1.default.equal(transitions.length, 2);
    strict_1.default.equal(transitions[0], 'processing:job_2');
    strict_1.default.ok(transitions[1].startsWith('failed:job_2:'));
    strict_1.default.equal(storage.uploads.length, 0);
});
(0, harness_1.test)('export: marks failed when job type is not export', async () => {
    const transitions = [];
    const storage = (0, fake_1.createFakeStorage)();
    const job = { ...mkJob('job_3', 'p1'), type: 'video' };
    await (0, export_runner_1.runExport)(job, {
        loadTimeline: () => null,
        loadScenes: () => [],
        markProcessing: () => undefined,
        markCompleted: () => undefined,
        markFailed: (id, err) => transitions.push(`failed:${id}:${err}`),
        resolveWorkDir: () => '/tmp/work',
        storage,
    });
    strict_1.default.equal(transitions.length, 1);
    strict_1.default.ok(transitions[0].startsWith('failed:job_3:'));
    strict_1.default.ok(transitions[0].includes('not an export'));
    strict_1.default.equal(storage.uploads.length, 0);
});
(0, harness_1.test)('export: marks failed when job is missing projectId', async () => {
    const transitions = [];
    const storage = (0, fake_1.createFakeStorage)();
    const job = { ...mkJob('job_4', 'p1'), projectId: undefined };
    await (0, export_runner_1.runExport)(job, {
        loadTimeline: () => null,
        loadScenes: () => [],
        markProcessing: () => undefined,
        markCompleted: () => undefined,
        markFailed: (id, err) => transitions.push(`failed:${id}:${err}`),
        resolveWorkDir: () => '/tmp/work',
        storage,
    });
    strict_1.default.equal(transitions.length, 1);
    strict_1.default.ok(transitions[0].includes('projectId'));
});
(0, harness_1.test)('export: marks failed when pre-flight rejects (no clips)', async () => {
    const transitions = [];
    const storage = (0, fake_1.createFakeStorage)();
    await (0, export_runner_1.runExport)(mkJob('job_5', 'p1'), {
        loadTimeline: () => mkTimeline([]),
        loadScenes: () => [],
        markProcessing: (id) => transitions.push(`processing:${id}`),
        markCompleted: () => undefined,
        markFailed: (id, err) => transitions.push(`failed:${id}:${err}`),
        resolveWorkDir: () => '/tmp/work',
        storage,
    });
    // markProcessing is called first (job started), then markFailed after pre-flight.
    strict_1.default.equal(transitions.length, 2);
    strict_1.default.equal(transitions[0], 'processing:job_5');
    strict_1.default.ok(transitions[1].startsWith('failed:job_5:'));
    strict_1.default.ok(transitions[1].includes('Timeline has no clips'));
});
(0, harness_1.test)('export: marks failed when pre-flight rejects (missing video)', async () => {
    const transitions = [];
    const storage = (0, fake_1.createFakeStorage)();
    const t = mkTimeline([{ id: 'c1', sceneId: 's1', start: 0, duration: 4 }]); // no sourceUrl
    await (0, export_runner_1.runExport)(mkJob('job_6', 'p1'), {
        loadTimeline: () => t,
        loadScenes: () => [mkScene('s1')],
        markProcessing: (id) => transitions.push(`processing:${id}`),
        markCompleted: () => undefined,
        markFailed: (id, err) => transitions.push(`failed:${id}:${err}`),
        resolveWorkDir: () => '/tmp/work',
        storage,
    });
    strict_1.default.equal(transitions.length, 2);
    strict_1.default.equal(transitions[0], 'processing:job_6');
    strict_1.default.ok(transitions[1].includes('Scene 1 has no generated video'));
});
// ── integration: queue ──────────────────────────────────────────────────
(0, harness_1.test)('queue: export jobs are filtered separately from video jobs', async () => {
    const { getJobQueue, resetJobQueue } = require('../lib/jobs/queue');
    resetJobQueue();
    const queue = getJobQueue();
    const a = await queue.enqueue({
        userId: 'userA',
        projectId: 'p1',
        type: 'export',
        input: { timelineId: 'tl' },
    });
    const b = await queue.enqueue({
        userId: 'userA',
        projectId: 'p1',
        type: 'video',
        sceneId: 's1',
        input: {},
    });
    strict_1.default.equal(a.type, 'export');
    strict_1.default.equal(b.type, 'video');
    strict_1.default.equal(a.status, 'queued');
    const exports = (await queue.listByUser('userA')).filter((j) => j.type === 'export');
    strict_1.default.equal(exports.length, 1);
    strict_1.default.equal(exports[0].id, a.id);
});
(0, harness_1.test)('queue: markProcessing → markCompleted is idempotent', async () => {
    const { getJobQueue, resetJobQueue } = require('../lib/jobs/queue');
    resetJobQueue();
    const queue = getJobQueue();
    const job = await queue.enqueue({
        userId: 'userB',
        projectId: 'p1',
        type: 'export',
        input: {},
    });
    queue.markProcessing(job.id);
    queue.markCompleted(job.id, { outputUrl: '/exports/x.mp4' });
    queue.markCompleted(job.id, { outputUrl: '/exports/y.mp4' }); // idempotent
    const fetched = await queue.get(job.id);
    strict_1.default.equal(fetched.status, 'completed');
    strict_1.default.equal(fetched.outputUrl, '/exports/y.mp4');
});
// ── authorization: timeline store user isolation ────────────────────────
(0, harness_1.test)('auth: timeline store rejects cross-user reads (cross-check via requireProject)', () => {
    const { requireProject } = require('../lib/projects/access');
    const g = globalThis;
    const store = {};
    g.window = {
        localStorage: {
            _data: store,
            getItem(k) { return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; },
            setItem(k, v) { this._data[k] = v; },
            removeItem(k) { delete this._data[k]; },
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
    strict_1.default.equal(r.ok, false);
    if (!r.ok)
        strict_1.default.equal(r.status, 404);
});
// ── storage layer integration ───────────────────────────────────────────
(0, harness_1.test)('storage: marks failed when storage upload throws', async () => {
    const transitions = [];
    const storage = (0, fake_1.createFakeStorage)();
    storage.failNextUpload = 'S3 unreachable';
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4, 'data:video/mp4;base64,AAAAAA=='),
    ]);
    const scenes = [mkScene('s1')];
    const fakeProc = {
        on(event, cb) {
            if (event === 'exit')
                setImmediate(() => cb(0, null));
        },
    };
    await (0, export_runner_1.runExport)(mkJob('job_upload_fail', 'p1'), {
        loadTimeline: () => t,
        loadScenes: () => scenes,
        markProcessing: (id) => transitions.push(`processing:${id}`),
        markCompleted: () => undefined,
        markFailed: (id, err) => transitions.push(`failed:${id}:${err}`),
        resolveWorkDir: () => '/tmp/work',
        storage,
        spawn: () => fakeProc,
        writeFile: async () => undefined,
        mkdir: async () => undefined,
        readFile: async () => Buffer.from('fake-mp4'),
    });
    strict_1.default.equal(transitions.length, 2);
    strict_1.default.equal(transitions[0], 'processing:job_upload_fail');
    strict_1.default.ok(transitions[1].includes('S3 unreachable'));
});
(0, harness_1.test)('storage: marks failed when readFile fails after ffmpeg succeeds', async () => {
    const transitions = [];
    const storage = (0, fake_1.createFakeStorage)();
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4, 'data:video/mp4;base64,AAAAAA=='),
    ]);
    const scenes = [mkScene('s1')];
    const fakeProc = {
        on(event, cb) {
            if (event === 'exit')
                setImmediate(() => cb(0, null));
        },
    };
    await (0, export_runner_1.runExport)(mkJob('job_read_fail', 'p1'), {
        loadTimeline: () => t,
        loadScenes: () => scenes,
        markProcessing: (id) => transitions.push(`processing:${id}`),
        markCompleted: () => undefined,
        markFailed: (id, err) => transitions.push(`failed:${id}:${err}`),
        resolveWorkDir: () => '/tmp/work',
        storage,
        spawn: () => fakeProc,
        writeFile: async () => undefined,
        mkdir: async () => undefined,
        readFile: async () => { throw new Error('ENOENT'); },
    });
    strict_1.default.equal(transitions.length, 2);
    strict_1.default.equal(transitions[0], 'processing:job_read_fail');
    strict_1.default.ok(transitions[1].includes('ENOENT'));
    strict_1.default.equal(storage.uploads.length, 0);
});
(0, harness_1.test)('storage: outputUrl in markCompleted comes from storage.urlFor', async () => {
    const transitions = [];
    const storage = (0, fake_1.createFakeStorage)({ urlTemplate: (k) => `https://cdn.example.com/exports/${k}?token=xyz` });
    const t = mkTimeline([
        mkClip('c1', 's1', 0, 4, 'data:video/mp4;base64,AAAAAA=='),
    ]);
    const scenes = [mkScene('s1')];
    const fakeProc = {
        on(event, cb) {
            if (event === 'exit')
                setImmediate(() => cb(0, null));
        },
    };
    await (0, export_runner_1.runExport)(mkJob('job_url', 'p1'), {
        loadTimeline: () => t,
        loadScenes: () => scenes,
        markProcessing: (id) => transitions.push(`processing:${id}`),
        markCompleted: (id, out) => transitions.push(`completed:${id}:${out.outputUrl}`),
        markFailed: (id, err) => transitions.push(`failed:${id}:${err}`),
        resolveWorkDir: () => '/tmp/work',
        storage,
        spawn: () => fakeProc,
        writeFile: async () => undefined,
        mkdir: async () => undefined,
        readFile: async () => Buffer.from('bytes'),
    });
    strict_1.default.equal(transitions[1], 'completed:job_url:https://cdn.example.com/exports/job_url.mp4?token=xyz');
});
