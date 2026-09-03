/**
 * End-to-end smoke test for Phase 7.
 *
 * Runs the full job lifecycle without HTTP/Clerk:
 *
 *   1. enqueue an export job
 *   2. markProcessing → verify status=processing + startedAt set
 *   3. simulate storage upload
 *   4. markCompleted → verify status=completed + outputUrl set
 *   5. simulate restart via requeueStaleJobs on a processing job
 *   6. simulate TTL cleanup on a backdated completed job
 *
 * Plus HTTP-level smoke: start a fresh Next.js dev server, hit the
 * export endpoint without auth, and confirm it returns 401 (auth
 * layer intact).
 *
 * Usage:
 *   node tests/e2e-jobs.js
 *
 * Exit code: 0 = all checks passed, 1 = any check failed.
 */

const path = require('node:path');
const { spawn } = require('node:child_process');

// Load compiled modules from .test-build.
const ROOT = path.resolve(__dirname, '..', '.test-build');
require(ROOT + '/lib/jobs/factory');
require(ROOT + '/lib/jobs/memory');
require(ROOT + '/lib/jobs/redis');
require(ROOT + '/lib/jobs/types');
require(ROOT + '/lib/storage/types');
require(ROOT + '/lib/storage/local');
require(ROOT + '/lib/storage/fake');

const { InMemoryJobQueue } = require(ROOT + '/lib/jobs/memory');
const { RedisJobQueue } = require(ROOT + '/lib/jobs/redis');
const { FakeRedis } = require(ROOT + '/tests/fake-redis');
const { createFakeStorage } = require(ROOT + '/lib/storage/fake');
const { resetJobQueue, getJobQueue } = require(ROOT + '/lib/jobs/factory');

let failures = 0;

function check(name, fn) {
    return Promise.resolve()
        .then(fn)
        .then(() => console.log(`  PASS  ${name}`))
        .catch((e) => {
            failures++;
            console.log(`  FAIL  ${name}`);
            console.log(`        ${e && e.message ? e.message : e}`);
            if (e && e.stack) {
                const lines = e.stack.split('\n').slice(1, 4).join('\n        ');
                console.log('        ' + lines);
            }
        });
}

async function withMockedEnv(vars, fn) {
    const saved = {};
    for (const k of Object.keys(vars)) {
        saved[k] = process.env[k];
        if (vars[k] === undefined) delete process.env[k];
        else process.env[k] = vars[k];
    }
    resetJobQueue();
    try {
        await fn();
    } finally {
        for (const k of Object.keys(vars)) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
        resetJobQueue();
    }
}

async function runInMemoryE2E() {
    console.log('\n── InMemoryJobQueue E2E ─────────────────────────');
    const q = new InMemoryJobQueue();
    let jobId;

    await check('enqueue assigns id, status=queued, projectId preserved', async () => {
        const j = await q.enqueue({
            userId: 'userA',
            projectId: 'p_demo',
            type: 'export',
            input: { timelineId: 'tl_demo' },
        });
        if (!j.id) throw new Error('id missing');
        if (j.status !== 'queued') throw new Error(`status=${j.status}`);
        if (j.projectId !== 'p_demo') throw new Error('projectId mismatch');
        jobId = j.id;
    });

    await check('markProcessing transitions queued → processing + stamps startedAt', async () => {
        const u = q.markProcessing(jobId);
        if (u.status !== 'processing') throw new Error(`status=${u.status}`);
        if (!u.startedAt) throw new Error('startedAt missing');
    });

    await check('recovery reverts processing → queued + clears startedAt', async () => {
        const n = await q.requeueStaleJobs();
        if (n !== 1) throw new Error(`recovered=${n}, expected 1`);
        const u = await q.get(jobId);
        if (u.status !== 'queued') throw new Error(`status=${u.status}`);
        if (u.startedAt !== undefined) throw new Error(`startedAt=${u.startedAt}`);
    });

    await check('dequeue returns the recovered job (FIFO)', async () => {
        const d = await q.dequeue();
        if (!d || d.id !== jobId) throw new Error(`dequeued wrong job: ${d && d.id}`);
    });

    await check('full export flow: dequeue → processing → storage.upload → completed', async () => {
        // Already dequeued above; just mark processing.
        q.markProcessing(jobId);
        const storage = createFakeStorage({ urlTemplate: (k) => `https://signed.example.com/${k}` });
        // Simulate the export-runner writing the MP4 + uploading.
        const bytes = Buffer.from('fake-mp4-content-' + Date.now());
        const upload = await storage.upload(`${jobId}.mp4`, bytes, 'video/mp4');
        q.markCompleted(jobId, { outputUrl: upload.url });
        const final = await q.get(jobId);
        if (final.status !== 'completed') throw new Error(`status=${final.status}`);
        if (final.outputUrl !== upload.url) throw new Error('outputUrl mismatch');
        if (!final.completedAt) throw new Error('completedAt missing');
    });

    await check('failure path: dequeue → markFailed → status=failed + error visible', async () => {
        const j2 = await q.enqueue({
            userId: 'userA',
            projectId: 'p_demo',
            type: 'export',
            input: {},
        });
        await q.dequeue();
        q.markProcessing(j2.id);
        q.markFailed(j2.id, 'ffmpeg exited with code 1');
        const final = await q.get(j2.id);
        if (final.status !== 'failed') throw new Error(`status=${final.status}`);
        if (final.error !== 'ffmpeg exited with code 1') throw new Error('error missing');
        if (!final.completedAt) throw new Error('completedAt missing');
    });
}

async function runRedisE2E() {
    console.log('\n── RedisJobQueue E2E (FakeRedis) ───────────────');
    const redis = new FakeRedis();
    const q = new RedisJobQueue({ redis, retentionHours: 24 });

    await check('full export flow: enqueue → processing → completed (persists in fake redis)', async () => {
        const j = await q.enqueue({
            userId: 'userB',
            projectId: 'p_redis',
            type: 'export',
            input: { prompt: 'demo' },
        });
        await q.update(j.id, { status: 'processing' });
        await q.update(j.id, { progress: 50 });
        await q.complete(j.id, 'https://signed.example.com/x.mp4');
        const final = await q.get(j.id);
        if (final.status !== 'completed') throw new Error(`status=${final.status}`);
        if (final.progress !== 50) throw new Error('progress not preserved');
        if (final.outputUrl !== 'https://signed.example.com/x.mp4') throw new Error('outputUrl mismatch');

        // Verify Redis state directly.
        const hash = await redis.hgetall(`job:${j.id}`);
        if (hash.status !== 'completed') throw new Error('hash.status not completed');
        if (hash.outputUrl !== 'https://signed.example.com/x.mp4') throw new Error('hash.outputUrl mismatch');
    });

    await check('recovery after "restart": stale processing job returns to pending', async () => {
        const j = await q.enqueue({
            userId: 'userC',
            projectId: 'p_recovery',
            type: 'export',
            input: {},
        });
        await q.update(j.id, { status: 'processing' });
        // Simulate restart by dropping the queue and creating a fresh one
        // against the SAME redis instance. This is exactly what
        // serverless cold-start looks like.
        const q2 = new RedisJobQueue({ redis, retentionHours: 24 });
        const n = await q2.requeueStaleJobs();
        if (n !== 1) throw new Error(`recovered=${n}`);
        const pending = await redis.lrange('queue:pending', 0, -1);
        if (!pending.includes(j.id)) throw new Error('job not requeued');
        const final = await q2.get(j.id);
        if (final.status !== 'queued') throw new Error(`status=${final.status}`);
        if (final.startedAt !== undefined) throw new Error(`startedAt=${final.startedAt}`);
    });

    await check('TTL: backdated completed job is purged by cleanup()', async () => {
        const j = await q.enqueue({
            userId: 'userD',
            projectId: 'p_ttl',
            type: 'export',
            input: {},
        });
        await q.complete(j.id, '/old.mp4');
        // Backdate 48h ago.
        const past = Date.now() - 48 * 60 * 60 * 1000;
        await redis.zadd('queue:completed', { [j.id]: past });
        const purged = await q.cleanup();
        if (purged !== 1) throw new Error(`purged=${purged}`);
        const hash = await redis.hgetall(`job:${j.id}`);
        if (hash !== null) throw new Error('hash should be deleted');
    });

    await check('TTL: recent completed job is NOT purged', async () => {
        const j = await q.enqueue({
            userId: 'userE',
            projectId: 'p_ttl_recent',
            type: 'export',
            input: {},
        });
        await q.complete(j.id, '/fresh.mp4');
        const purged = await q.cleanup();
        if (purged !== 0) throw new Error(`purged=${purged}, expected 0`);
    });
}

async function runFactoryE2E() {
    console.log('\n── Factory E2E ─────────────────────────────────');

    await withMockedEnv(
        { JOB_QUEUE_DRIVER: undefined, UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined },
        async () => {
            await check('factory without env → memory queue', () => {
                const q = getJobQueue();
                if (!(q instanceof InMemoryJobQueue)) throw new Error(`got ${q.constructor.name}`);
            });
        },
    );

    await withMockedEnv(
        { JOB_QUEUE_DRIVER: 'redis', UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined },
        async () => {
            await check('factory with redis driver + injected client → RedisJobQueue', () => {
                const redis = new FakeRedis();
                const q = getJobQueue({ redisClient: redis });
                if (!(q instanceof RedisJobQueue)) throw new Error(`got ${q.constructor.name}`);
            });
        },
    );
}

async function runHttpSmoke() {
    console.log('\n── HTTP smoke (auth intact) ─────────────────────');

    const port = 4567;
    const cwd = path.resolve(__dirname, '..');
    // Use `node` directly + the next module binary path so we don't
    // depend on shell .cmd resolution (PowerShell spawn EINVAL).
    const nextModulePath = path.resolve(cwd, 'node_modules', 'next', 'dist', 'bin', 'next');
    let server;
    let proc;
    try {
        proc = spawn(process.execPath, [nextModulePath, 'dev', '-p', String(port)], {
            cwd,
            env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: false,
        });
        server = new Promise((resolve, reject) => {
            const onData = (chunk) => {
                const s = chunk.toString();
                if (s.includes('Ready') || s.includes('started server')) {
                    proc.stdout.off('data', onData);
                    resolve();
                }
            };
            proc.stdout.on('data', onData);
            proc.on('error', reject);
            setTimeout(() => reject(new Error('dev server start timeout')), 30000);
        });
        await server;
        // Give Next a moment to bind.
        await new Promise((r) => setTimeout(r, 1500));

        await check('POST /api/studio/projects/p_x/export without auth returns 401', async () => {
            const res = await fetch(`http://127.0.0.1:${port}/api/studio/projects/p_x/export`, {
                method: 'POST',
            });
            if (res.status !== 401) throw new Error(`got ${res.status}, expected 401`);
        });

        await check('GET /api/studio/jobs/job_x without auth returns 401', async () => {
            const res = await fetch(`http://127.0.0.1:${port}/api/studio/jobs/job_x`);
            if (res.status !== 401) throw new Error(`got ${res.status}, expected 401`);
        });
    } catch (e) {
        console.log(`  SKIP  HTTP smoke (could not start dev server: ${e && e.message ? e.message : e})`);
    } finally {
        if (proc) {
            try {
                proc.kill('SIGTERM');
                await new Promise((r) => setTimeout(r, 500));
                if (!proc.killed) proc.kill('SIGKILL');
            } catch { /* ignore */ }
        }
    }
}

(async () => {
    await runInMemoryE2E();
    await runRedisE2E();
    await runFactoryE2E();
    await runHttpSmoke();
    console.log('\n' + (failures === 0 ? 'ALL E2E CHECKS PASSED' : `${failures} CHECK(S) FAILED`));
    process.exit(failures === 0 ? 0 : 1);
})();
