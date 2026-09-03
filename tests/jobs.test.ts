/**
 * JobQueue tests — Phase 7.
 *
 * Coverage:
 *   - enqueue (memory + redis)
 *   - FIFO ordering (dequeue)
 *   - get / listByUser
 *   - update (status, progress, output)
 *   - complete / fail
 *   - auto-stamping of startedAt / completedAt on status transitions
 *   - recovery (requeueStaleJobs) for both backends
 *   - TTL cleanup
 *   - factory: driver selection (memory default, redis with env)
 *   - factory: error when Redis driver is requested without env vars
 *   - redis: serialization round-trip of job hash
 *   - redis: error path when a redis op throws
 */

import assert from 'node:assert/strict';
import { test } from './harness';

import { InMemoryJobQueue } from '../lib/jobs/memory';
import { RedisJobQueue } from '../lib/jobs/redis';
import { FakeRedis } from './fake-redis';
import { getJobQueue, resetJobQueue } from '../lib/jobs/factory';
import { GenerationJob } from '../lib/jobs/types';

// ── helpers ──────────────────────────────────────────────────────────────

function mkInput(overrides: Partial<Parameters<InMemoryJobQueue['enqueue']>[0]> = {}) {
    return {
        userId: 'userA',
        projectId: 'p1',
        type: 'export' as const,
        input: { foo: 'bar' },
        ...overrides,
    };
}

// ── InMemoryJobQueue ─────────────────────────────────────────────────────

test('memory: enqueue assigns id and status=queued', async () => {
    const q = new InMemoryJobQueue();
    const job = await q.enqueue(mkInput());
    assert.ok(job.id);
    assert.equal(job.status, 'queued');
    assert.equal(job.userId, 'userA');
    assert.equal(job.projectId, 'p1');
});

test('memory: dequeue returns FIFO order', async () => {
    const q = new InMemoryJobQueue();
    const a = await q.enqueue(mkInput({ userId: 'u1', type: 'export' }));
    const b = await q.enqueue(mkInput({ userId: 'u1', type: 'video' }));
    const c = await q.enqueue(mkInput({ userId: 'u1', type: 'export' }));

    const d1 = await q.dequeue();
    const d2 = await q.dequeue();
    const d3 = await q.dequeue();
    const d4 = await q.dequeue();

    assert.equal(d1?.id, a.id);
    assert.equal(d2?.id, b.id);
    assert.equal(d3?.id, c.id);
    assert.equal(d4, null);
});

test('memory: get returns the job by id', async () => {
    const q = new InMemoryJobQueue();
    const job = await q.enqueue(mkInput());
    const fetched = await q.get(job.id);
    assert.deepEqual(fetched, job);
});

test('memory: get returns undefined for missing id', async () => {
    const q = new InMemoryJobQueue();
    assert.equal(await q.get('missing'), undefined);
});

test('memory: listByUser returns jobs newest-first and filters by user', async () => {
    const q = new InMemoryJobQueue();
    const a = await q.enqueue(mkInput({ userId: 'u1' }));
    await new Promise(r => setTimeout(r, 5));
    const b = await q.enqueue(mkInput({ userId: 'u1' }));
    await q.enqueue(mkInput({ userId: 'u2' }));

    const u1Jobs = await q.listByUser('u1');
    assert.equal(u1Jobs.length, 2);
    assert.equal(u1Jobs[0].id, b.id);
    assert.equal(u1Jobs[1].id, a.id);
});

test('memory: update transitions queued → processing and stamps startedAt', async () => {
    const q = new InMemoryJobQueue();
    const job = await q.enqueue(mkInput());
    assert.equal(job.startedAt, undefined);

    const updated = await q.update(job.id, { status: 'processing' });
    assert.equal(updated?.status, 'processing');
    assert.ok(updated?.startedAt);
});

test('memory: update stamps completedAt on terminal transitions', async () => {
    const q = new InMemoryJobQueue();
    const job = await q.enqueue(mkInput());

    const completed = await q.update(job.id, { status: 'completed', outputUrl: '/x.mp4' });
    assert.ok(completed?.completedAt);

    const failed = await q.update(job.id, { status: 'failed', error: 'oops' });
    assert.ok(failed?.completedAt);
});

test('memory: update returns undefined for missing job', async () => {
    const q = new InMemoryJobQueue();
    assert.equal(await q.update('missing', { status: 'processing' }), undefined);
});

test('memory: update accepts progress patch', async () => {
    const q = new InMemoryJobQueue();
    const job = await q.enqueue(mkInput());
    await q.update(job.id, { status: 'processing' });
    const updated = await q.update(job.id, { progress: 45 });
    assert.equal(updated?.progress, 45);
});

test('memory: complete sets status=completed and outputUrl', async () => {
    const q = new InMemoryJobQueue();
    const job = await q.enqueue(mkInput());
    const done = await q.complete(job.id, 'https://cdn/x.mp4');
    assert.equal(done?.status, 'completed');
    assert.equal(done?.outputUrl, 'https://cdn/x.mp4');
    assert.ok(done?.completedAt);
});

test('memory: fail sets status=failed and error', async () => {
    const q = new InMemoryJobQueue();
    const job = await q.enqueue(mkInput());
    const failed = await q.fail(job.id, 'ffmpeg exited with code 1');
    assert.equal(failed?.status, 'failed');
    assert.equal(failed?.error, 'ffmpeg exited with code 1');
    assert.ok(failed?.completedAt);
});

test('memory: requeueStaleJobs moves processing back to queued', async () => {
    const q = new InMemoryJobQueue();
    const job = await q.enqueue(mkInput());
    await q.update(job.id, { status: 'processing' });

    const recovered = await q.requeueStaleJobs();
    assert.equal(recovered, 1);

    const refreshed = await q.get(job.id);
    assert.equal(refreshed?.status, 'queued');
    assert.equal(refreshed?.startedAt, undefined);

    // Should be re-dequeueable.
    const next = await q.dequeue();
    assert.equal(next?.id, job.id);
});

test('memory: requeueStaleJobs does not touch terminal jobs', async () => {
    const q = new InMemoryJobQueue();
    const a = await q.enqueue(mkInput());
    const b = await q.enqueue(mkInput());
    await q.complete(a.id, '/a.mp4');
    await q.fail(b.id, 'nope');

    const recovered = await q.requeueStaleJobs();
    assert.equal(recovered, 0);

    assert.equal((await q.get(a.id))?.status, 'completed');
    assert.equal((await q.get(b.id))?.status, 'failed');
});

test('memory: back-compat markProcessing / markCompleted / markFailed', async () => {
    const q = new InMemoryJobQueue();
    const job = await q.enqueue(mkInput());
    q.markProcessing(job.id);
    // Allow async update to flush.
    await new Promise(r => setImmediate(r));
    let fetched = await q.get(job.id);
    assert.equal(fetched?.status, 'processing');

    q.markCompleted(job.id, { outputUrl: '/x.mp4' });
    await new Promise(r => setImmediate(r));
    fetched = await q.get(job.id);
    assert.equal(fetched?.status, 'completed');
    assert.equal(fetched?.outputUrl, '/x.mp4');

    const job2 = await q.enqueue(mkInput({ userId: 'u2' }));
    q.markFailed(job2.id, 'oops');
    await new Promise(r => setImmediate(r));
    const fetched2 = await q.get(job2.id);
    assert.equal(fetched2?.status, 'failed');
    assert.equal(fetched2?.error, 'oops');
});

// ── RedisJobQueue (FakeRedis) ────────────────────────────────────────────

function mkRedisQueue(): { q: RedisJobQueue; redis: FakeRedis } {
    const redis = new FakeRedis();
    const q = new RedisJobQueue({ redis, retentionHours: 24 });
    return { q, redis };
}

test('redis: enqueue writes hash + pushes to pending list + adds to user index', async () => {
    const { q, redis } = mkRedisQueue();
    const job = await q.enqueue(mkInput());

    const hash = await redis.hgetall(`job:${job.id}`);
    assert.ok(hash);
    assert.equal(hash.id, job.id);
    assert.equal(hash.status, 'queued');
    assert.equal(hash.userId, 'userA');

    const pending = await redis.lrange('queue:pending', 0, -1);
    assert.deepEqual(pending, [job.id]);

    const userIdx = await redis.zrangebyscore(`jobs:by-user:userA`, 0, '+inf');
    assert.deepEqual(userIdx, [job.id]);
});

test('redis: dequeue pops in FIFO and adds to active set', async () => {
    const { q, redis } = mkRedisQueue();
    const a = await q.enqueue(mkInput({ userId: 'u1' }));
    const b = await q.enqueue(mkInput({ userId: 'u1' }));

    const d1 = await q.dequeue();
    assert.equal(d1?.id, a.id);

    const active = await redis.smembers('queue:active');
    assert.deepEqual(active, [a.id]);

    const d2 = await q.dequeue();
    assert.equal(d2?.id, b.id);
});

test('redis: get returns the job (round-trip via hash)', async () => {
    const { q } = mkRedisQueue();
    const job = await q.enqueue(mkInput({ input: { foo: 'bar', n: 42 } }));
    const fetched = await q.get(job.id);
    assert.ok(fetched);
    assert.equal(fetched?.id, job.id);
    assert.deepEqual(fetched?.input, { foo: 'bar', n: 42 });
});

test('redis: get returns undefined for missing id', async () => {
    const { q } = mkRedisQueue();
    assert.equal(await q.get('nope'), undefined);
});

test('redis: listByUser returns newest-first', async () => {
    const { q } = mkRedisQueue();
    const a = await q.enqueue(mkInput({ userId: 'u1' }));
    await new Promise(r => setTimeout(r, 5));
    const b = await q.enqueue(mkInput({ userId: 'u1' }));
    await q.enqueue(mkInput({ userId: 'u2' }));

    const u1Jobs = await q.listByUser('u1');
    assert.equal(u1Jobs.length, 2);
    assert.equal(u1Jobs[0].id, b.id);
    assert.equal(u1Jobs[1].id, a.id);
});

test('redis: update stamps startedAt on processing and completedAt on terminal', async () => {
    const { q } = mkRedisQueue();
    const job = await q.enqueue(mkInput());

    const processing = await q.update(job.id, { status: 'processing' });
    assert.ok(processing?.startedAt);
    assert.equal(processing?.status, 'processing');

    const completed = await q.update(job.id, { status: 'completed', outputUrl: 'https://x/y.mp4' });
    assert.ok(completed?.completedAt);
    assert.equal(completed?.outputUrl, 'https://x/y.mp4');
});

test('redis: update accepts progress and preserves existing fields', async () => {
    const { q } = mkRedisQueue();
    const job = await q.enqueue(mkInput());
    await q.update(job.id, { status: 'processing' });
    const updated = await q.update(job.id, { progress: 75 });

    assert.equal(updated?.progress, 75);
    assert.equal(updated?.userId, 'userA');
    assert.equal(updated?.status, 'processing');
});

test('redis: complete + fail terminal transitions', async () => {
    const { q } = mkRedisQueue();
    const job = await q.enqueue(mkInput());
    const done = await q.complete(job.id, 'https://cdn/x.mp4');
    assert.equal(done?.status, 'completed');
    assert.equal(done?.outputUrl, 'https://cdn/x.mp4');

    const job2 = await q.enqueue(mkInput({ userId: 'u2' }));
    const failed = await q.fail(job2.id, 'crashed');
    assert.equal(failed?.status, 'failed');
    assert.equal(failed?.error, 'crashed');
});

test('redis: requeueStaleJobs recovers processing jobs and re-pushes to pending', async () => {
    const { q, redis } = mkRedisQueue();
    const job = await q.enqueue(mkInput());
    await q.update(job.id, { status: 'processing' });

    const recovered = await q.requeueStaleJobs();
    assert.equal(recovered, 1);

    const refreshed = await q.get(job.id);
    assert.equal(refreshed?.status, 'queued');
    assert.equal(refreshed?.startedAt, undefined);

    const pending = await redis.lrange('queue:pending', 0, -1);
    assert.ok(pending.includes(job.id));

    const active = await redis.smembers('queue:active');
    assert.equal(active.includes(job.id), false);
});

test('redis: cleanup purges completed jobs older than retentionHours', async () => {
    const { q, redis } = mkRedisQueue();
    const job = await q.enqueue(mkInput());
    await q.update(job.id, { status: 'completed', outputUrl: '/old.mp4' });

    // Backdate the completedAt score to 48h ago so it's outside retention.
    const past = Date.now() - 48 * 60 * 60 * 1000;
    await redis.zadd('queue:completed', { [job.id]: past });

    const purged = await q.cleanup();
    assert.equal(purged, 1);

    const remaining = await redis.zcard('queue:completed');
    assert.equal(remaining, 0);

    const hash = await redis.hgetall(`job:${job.id}`);
    assert.equal(hash, null);
});

test('redis: cleanup does NOT purge recent completed jobs', async () => {
    const { q } = mkRedisQueue();
    const job = await q.enqueue(mkInput());
    await q.update(job.id, { status: 'completed', outputUrl: '/fresh.mp4' });

    const purged = await q.cleanup();
    assert.equal(purged, 0);

    const refreshed = await q.get(job.id);
    assert.equal(refreshed?.status, 'completed');
});

test('redis: error from redis propagates as a rejection', async () => {
    const { q, redis } = mkRedisQueue();
    redis.failNext.set('lpush', 'redis: connection lost');
    await assert.rejects(() => q.enqueue(mkInput()), /connection lost/);
});

test('redis: serialized hash round-trips complex input', async () => {
    const { q } = mkRedisQueue();
    const job = await q.enqueue(mkInput({ input: { nested: { a: 1 }, list: [1, 2, 3] } }));
    const fetched = await q.get(job.id);
    assert.deepEqual(fetched?.input, { nested: { a: 1 }, list: [1, 2, 3] });
});

test('redis: concurrency option is exposed', () => {
    const redis = new FakeRedis();
    const q = new RedisJobQueue({ redis, concurrency: 5 });
    assert.equal(q.concurrency, 5);
});

// ── Factory ──────────────────────────────────────────────────────────────

test('factory: defaults to memory driver when JOB_QUEUE_DRIVER unset', async () => {
    const savedDriver = process.env.JOB_QUEUE_DRIVER;
    delete process.env.JOB_QUEUE_DRIVER;
    resetJobQueue();
    try {
        const q = getJobQueue();
        assert.ok(q instanceof InMemoryJobQueue);
        const job = await q.enqueue(mkInput());
        assert.equal(job.status, 'queued');
    } finally {
        if (savedDriver !== undefined) process.env.JOB_QUEUE_DRIVER = savedDriver;
        resetJobQueue();
    }
});

test('factory: explicit memory driver returns InMemoryJobQueue', () => {
    resetJobQueue();
    const q = getJobQueue({ driver: 'memory' });
    assert.ok(q instanceof InMemoryJobQueue);
});

test('factory: redis driver with injected client returns RedisJobQueue', () => {
    resetJobQueue();
    const redis = new FakeRedis();
    const q = getJobQueue({ driver: 'redis', redisClient: redis });
    assert.ok(q instanceof RedisJobQueue);
});

test('factory: redis driver without env or client throws', () => {
    const savedDriver = process.env.JOB_QUEUE_DRIVER;
    const savedUrl = process.env.UPSTASH_REDIS_REST_URL;
    const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.JOB_QUEUE_DRIVER = 'redis';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetJobQueue();
    try {
        assert.throws(
            () => getJobQueue(),
            /UPSTASH_REDIS_REST_URL/,
        );
    } finally {
        if (savedDriver !== undefined) process.env.JOB_QUEUE_DRIVER = savedDriver; else delete process.env.JOB_QUEUE_DRIVER;
        if (savedUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = savedUrl;
        if (savedToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken;
        resetJobQueue();
    }
});

test('factory: resetJobQueue clears the cache', async () => {
    const a = getJobQueue();
    resetJobQueue();
    const b = getJobQueue();
    assert.notEqual(a, b);
});

test('factory: redis driver respects retentionHours env var', async () => {
    const savedDriver = process.env.JOB_QUEUE_DRIVER;
    const savedRetention = process.env.JOB_RETENTION_HOURS;
    process.env.JOB_QUEUE_DRIVER = 'redis';
    process.env.JOB_RETENTION_HOURS = '48';
    resetJobQueue();
    try {
        const redis = new FakeRedis();
        const q = getJobQueue({ driver: 'redis', redisClient: redis }) as RedisJobQueue;
        // Retention is private; verify via cleanup behavior — 48h retention means
        // a 36h-old job is NOT purged.
        const job = await q.enqueue(mkInput());
        await q.update(job.id, { status: 'completed' });
        // Backdate 36h ago.
        const past = Date.now() - 36 * 60 * 60 * 1000;
        await (redis as FakeRedis).zadd('queue:completed', { [job.id]: past });
        const purged = await q.cleanup();
        assert.equal(purged, 0);
    } finally {
        if (savedDriver !== undefined) process.env.JOB_QUEUE_DRIVER = savedDriver; else delete process.env.JOB_QUEUE_DRIVER;
        if (savedRetention !== undefined) process.env.JOB_RETENTION_HOURS = savedRetention; else delete process.env.JOB_RETENTION_HOURS;
        resetJobQueue();
    }
});

export {};
