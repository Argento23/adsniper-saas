"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const harness_1 = require("./harness");
const memory_1 = require("../lib/jobs/memory");
const redis_1 = require("../lib/jobs/redis");
const fake_redis_1 = require("./fake-redis");
const factory_1 = require("../lib/jobs/factory");
// ── helpers ──────────────────────────────────────────────────────────────
function mkInput(overrides = {}) {
    return {
        userId: 'userA',
        projectId: 'p1',
        type: 'export',
        input: { foo: 'bar' },
        ...overrides,
    };
}
// ── InMemoryJobQueue ─────────────────────────────────────────────────────
(0, harness_1.test)('memory: enqueue assigns id and status=queued', async () => {
    const q = new memory_1.InMemoryJobQueue();
    const job = await q.enqueue(mkInput());
    strict_1.default.ok(job.id);
    strict_1.default.equal(job.status, 'queued');
    strict_1.default.equal(job.userId, 'userA');
    strict_1.default.equal(job.projectId, 'p1');
});
(0, harness_1.test)('memory: dequeue returns FIFO order', async () => {
    const q = new memory_1.InMemoryJobQueue();
    const a = await q.enqueue(mkInput({ userId: 'u1', type: 'export' }));
    const b = await q.enqueue(mkInput({ userId: 'u1', type: 'video' }));
    const c = await q.enqueue(mkInput({ userId: 'u1', type: 'export' }));
    const d1 = await q.dequeue();
    const d2 = await q.dequeue();
    const d3 = await q.dequeue();
    const d4 = await q.dequeue();
    strict_1.default.equal(d1?.id, a.id);
    strict_1.default.equal(d2?.id, b.id);
    strict_1.default.equal(d3?.id, c.id);
    strict_1.default.equal(d4, null);
});
(0, harness_1.test)('memory: get returns the job by id', async () => {
    const q = new memory_1.InMemoryJobQueue();
    const job = await q.enqueue(mkInput());
    const fetched = await q.get(job.id);
    strict_1.default.deepEqual(fetched, job);
});
(0, harness_1.test)('memory: get returns undefined for missing id', async () => {
    const q = new memory_1.InMemoryJobQueue();
    strict_1.default.equal(await q.get('missing'), undefined);
});
(0, harness_1.test)('memory: listByUser returns jobs newest-first and filters by user', async () => {
    const q = new memory_1.InMemoryJobQueue();
    const a = await q.enqueue(mkInput({ userId: 'u1' }));
    await new Promise(r => setTimeout(r, 5));
    const b = await q.enqueue(mkInput({ userId: 'u1' }));
    await q.enqueue(mkInput({ userId: 'u2' }));
    const u1Jobs = await q.listByUser('u1');
    strict_1.default.equal(u1Jobs.length, 2);
    strict_1.default.equal(u1Jobs[0].id, b.id);
    strict_1.default.equal(u1Jobs[1].id, a.id);
});
(0, harness_1.test)('memory: update transitions queued → processing and stamps startedAt', async () => {
    const q = new memory_1.InMemoryJobQueue();
    const job = await q.enqueue(mkInput());
    strict_1.default.equal(job.startedAt, undefined);
    const updated = await q.update(job.id, { status: 'processing' });
    strict_1.default.equal(updated?.status, 'processing');
    strict_1.default.ok(updated?.startedAt);
});
(0, harness_1.test)('memory: update stamps completedAt on terminal transitions', async () => {
    const q = new memory_1.InMemoryJobQueue();
    const job = await q.enqueue(mkInput());
    const completed = await q.update(job.id, { status: 'completed', outputUrl: '/x.mp4' });
    strict_1.default.ok(completed?.completedAt);
    const failed = await q.update(job.id, { status: 'failed', error: 'oops' });
    strict_1.default.ok(failed?.completedAt);
});
(0, harness_1.test)('memory: update returns undefined for missing job', async () => {
    const q = new memory_1.InMemoryJobQueue();
    strict_1.default.equal(await q.update('missing', { status: 'processing' }), undefined);
});
(0, harness_1.test)('memory: update accepts progress patch', async () => {
    const q = new memory_1.InMemoryJobQueue();
    const job = await q.enqueue(mkInput());
    await q.update(job.id, { status: 'processing' });
    const updated = await q.update(job.id, { progress: 45 });
    strict_1.default.equal(updated?.progress, 45);
});
(0, harness_1.test)('memory: complete sets status=completed and outputUrl', async () => {
    const q = new memory_1.InMemoryJobQueue();
    const job = await q.enqueue(mkInput());
    const done = await q.complete(job.id, 'https://cdn/x.mp4');
    strict_1.default.equal(done?.status, 'completed');
    strict_1.default.equal(done?.outputUrl, 'https://cdn/x.mp4');
    strict_1.default.ok(done?.completedAt);
});
(0, harness_1.test)('memory: fail sets status=failed and error', async () => {
    const q = new memory_1.InMemoryJobQueue();
    const job = await q.enqueue(mkInput());
    const failed = await q.fail(job.id, 'ffmpeg exited with code 1');
    strict_1.default.equal(failed?.status, 'failed');
    strict_1.default.equal(failed?.error, 'ffmpeg exited with code 1');
    strict_1.default.ok(failed?.completedAt);
});
(0, harness_1.test)('memory: requeueStaleJobs moves processing back to queued', async () => {
    const q = new memory_1.InMemoryJobQueue();
    const job = await q.enqueue(mkInput());
    await q.update(job.id, { status: 'processing' });
    const recovered = await q.requeueStaleJobs();
    strict_1.default.equal(recovered, 1);
    const refreshed = await q.get(job.id);
    strict_1.default.equal(refreshed?.status, 'queued');
    strict_1.default.equal(refreshed?.startedAt, undefined);
    // Should be re-dequeueable.
    const next = await q.dequeue();
    strict_1.default.equal(next?.id, job.id);
});
(0, harness_1.test)('memory: requeueStaleJobs does not touch terminal jobs', async () => {
    const q = new memory_1.InMemoryJobQueue();
    const a = await q.enqueue(mkInput());
    const b = await q.enqueue(mkInput());
    await q.complete(a.id, '/a.mp4');
    await q.fail(b.id, 'nope');
    const recovered = await q.requeueStaleJobs();
    strict_1.default.equal(recovered, 0);
    strict_1.default.equal((await q.get(a.id))?.status, 'completed');
    strict_1.default.equal((await q.get(b.id))?.status, 'failed');
});
(0, harness_1.test)('memory: back-compat markProcessing / markCompleted / markFailed', async () => {
    const q = new memory_1.InMemoryJobQueue();
    const job = await q.enqueue(mkInput());
    q.markProcessing(job.id);
    // Allow async update to flush.
    await new Promise(r => setImmediate(r));
    let fetched = await q.get(job.id);
    strict_1.default.equal(fetched?.status, 'processing');
    q.markCompleted(job.id, { outputUrl: '/x.mp4' });
    await new Promise(r => setImmediate(r));
    fetched = await q.get(job.id);
    strict_1.default.equal(fetched?.status, 'completed');
    strict_1.default.equal(fetched?.outputUrl, '/x.mp4');
    const job2 = await q.enqueue(mkInput({ userId: 'u2' }));
    q.markFailed(job2.id, 'oops');
    await new Promise(r => setImmediate(r));
    const fetched2 = await q.get(job2.id);
    strict_1.default.equal(fetched2?.status, 'failed');
    strict_1.default.equal(fetched2?.error, 'oops');
});
// ── RedisJobQueue (FakeRedis) ────────────────────────────────────────────
function mkRedisQueue() {
    const redis = new fake_redis_1.FakeRedis();
    const q = new redis_1.RedisJobQueue({ redis, retentionHours: 24 });
    return { q, redis };
}
(0, harness_1.test)('redis: enqueue writes hash + pushes to pending list + adds to user index', async () => {
    const { q, redis } = mkRedisQueue();
    const job = await q.enqueue(mkInput());
    const hash = await redis.hgetall(`job:${job.id}`);
    strict_1.default.ok(hash);
    strict_1.default.equal(hash.id, job.id);
    strict_1.default.equal(hash.status, 'queued');
    strict_1.default.equal(hash.userId, 'userA');
    const pending = await redis.lrange('queue:pending', 0, -1);
    strict_1.default.deepEqual(pending, [job.id]);
    const userIdx = await redis.zrangebyscore(`jobs:by-user:userA`, 0, '+inf');
    strict_1.default.deepEqual(userIdx, [job.id]);
});
(0, harness_1.test)('redis: dequeue pops in FIFO and adds to active set', async () => {
    const { q, redis } = mkRedisQueue();
    const a = await q.enqueue(mkInput({ userId: 'u1' }));
    const b = await q.enqueue(mkInput({ userId: 'u1' }));
    const d1 = await q.dequeue();
    strict_1.default.equal(d1?.id, a.id);
    const active = await redis.smembers('queue:active');
    strict_1.default.deepEqual(active, [a.id]);
    const d2 = await q.dequeue();
    strict_1.default.equal(d2?.id, b.id);
});
(0, harness_1.test)('redis: get returns the job (round-trip via hash)', async () => {
    const { q } = mkRedisQueue();
    const job = await q.enqueue(mkInput({ input: { foo: 'bar', n: 42 } }));
    const fetched = await q.get(job.id);
    strict_1.default.ok(fetched);
    strict_1.default.equal(fetched?.id, job.id);
    strict_1.default.deepEqual(fetched?.input, { foo: 'bar', n: 42 });
});
(0, harness_1.test)('redis: get returns undefined for missing id', async () => {
    const { q } = mkRedisQueue();
    strict_1.default.equal(await q.get('nope'), undefined);
});
(0, harness_1.test)('redis: listByUser returns newest-first', async () => {
    const { q } = mkRedisQueue();
    const a = await q.enqueue(mkInput({ userId: 'u1' }));
    await new Promise(r => setTimeout(r, 5));
    const b = await q.enqueue(mkInput({ userId: 'u1' }));
    await q.enqueue(mkInput({ userId: 'u2' }));
    const u1Jobs = await q.listByUser('u1');
    strict_1.default.equal(u1Jobs.length, 2);
    strict_1.default.equal(u1Jobs[0].id, b.id);
    strict_1.default.equal(u1Jobs[1].id, a.id);
});
(0, harness_1.test)('redis: update stamps startedAt on processing and completedAt on terminal', async () => {
    const { q } = mkRedisQueue();
    const job = await q.enqueue(mkInput());
    const processing = await q.update(job.id, { status: 'processing' });
    strict_1.default.ok(processing?.startedAt);
    strict_1.default.equal(processing?.status, 'processing');
    const completed = await q.update(job.id, { status: 'completed', outputUrl: 'https://x/y.mp4' });
    strict_1.default.ok(completed?.completedAt);
    strict_1.default.equal(completed?.outputUrl, 'https://x/y.mp4');
});
(0, harness_1.test)('redis: update accepts progress and preserves existing fields', async () => {
    const { q } = mkRedisQueue();
    const job = await q.enqueue(mkInput());
    await q.update(job.id, { status: 'processing' });
    const updated = await q.update(job.id, { progress: 75 });
    strict_1.default.equal(updated?.progress, 75);
    strict_1.default.equal(updated?.userId, 'userA');
    strict_1.default.equal(updated?.status, 'processing');
});
(0, harness_1.test)('redis: complete + fail terminal transitions', async () => {
    const { q } = mkRedisQueue();
    const job = await q.enqueue(mkInput());
    const done = await q.complete(job.id, 'https://cdn/x.mp4');
    strict_1.default.equal(done?.status, 'completed');
    strict_1.default.equal(done?.outputUrl, 'https://cdn/x.mp4');
    const job2 = await q.enqueue(mkInput({ userId: 'u2' }));
    const failed = await q.fail(job2.id, 'crashed');
    strict_1.default.equal(failed?.status, 'failed');
    strict_1.default.equal(failed?.error, 'crashed');
});
(0, harness_1.test)('redis: requeueStaleJobs recovers processing jobs and re-pushes to pending', async () => {
    const { q, redis } = mkRedisQueue();
    const job = await q.enqueue(mkInput());
    await q.update(job.id, { status: 'processing' });
    const recovered = await q.requeueStaleJobs();
    strict_1.default.equal(recovered, 1);
    const refreshed = await q.get(job.id);
    strict_1.default.equal(refreshed?.status, 'queued');
    strict_1.default.equal(refreshed?.startedAt, undefined);
    const pending = await redis.lrange('queue:pending', 0, -1);
    strict_1.default.ok(pending.includes(job.id));
    const active = await redis.smembers('queue:active');
    strict_1.default.equal(active.includes(job.id), false);
});
(0, harness_1.test)('redis: cleanup purges completed jobs older than retentionHours', async () => {
    const { q, redis } = mkRedisQueue();
    const job = await q.enqueue(mkInput());
    await q.update(job.id, { status: 'completed', outputUrl: '/old.mp4' });
    // Backdate the completedAt score to 48h ago so it's outside retention.
    const past = Date.now() - 48 * 60 * 60 * 1000;
    await redis.zadd('queue:completed', { [job.id]: past });
    const purged = await q.cleanup();
    strict_1.default.equal(purged, 1);
    const remaining = await redis.zcard('queue:completed');
    strict_1.default.equal(remaining, 0);
    const hash = await redis.hgetall(`job:${job.id}`);
    strict_1.default.equal(hash, null);
});
(0, harness_1.test)('redis: cleanup does NOT purge recent completed jobs', async () => {
    const { q } = mkRedisQueue();
    const job = await q.enqueue(mkInput());
    await q.update(job.id, { status: 'completed', outputUrl: '/fresh.mp4' });
    const purged = await q.cleanup();
    strict_1.default.equal(purged, 0);
    const refreshed = await q.get(job.id);
    strict_1.default.equal(refreshed?.status, 'completed');
});
(0, harness_1.test)('redis: error from redis propagates as a rejection', async () => {
    const { q, redis } = mkRedisQueue();
    redis.failNext.set('lpush', 'redis: connection lost');
    await strict_1.default.rejects(() => q.enqueue(mkInput()), /connection lost/);
});
(0, harness_1.test)('redis: serialized hash round-trips complex input', async () => {
    const { q } = mkRedisQueue();
    const job = await q.enqueue(mkInput({ input: { nested: { a: 1 }, list: [1, 2, 3] } }));
    const fetched = await q.get(job.id);
    strict_1.default.deepEqual(fetched?.input, { nested: { a: 1 }, list: [1, 2, 3] });
});
(0, harness_1.test)('redis: concurrency option is exposed', () => {
    const redis = new fake_redis_1.FakeRedis();
    const q = new redis_1.RedisJobQueue({ redis, concurrency: 5 });
    strict_1.default.equal(q.concurrency, 5);
});
// ── Factory ──────────────────────────────────────────────────────────────
(0, harness_1.test)('factory: defaults to memory driver when JOB_QUEUE_DRIVER unset', async () => {
    const savedDriver = process.env.JOB_QUEUE_DRIVER;
    delete process.env.JOB_QUEUE_DRIVER;
    (0, factory_1.resetJobQueue)();
    try {
        const q = (0, factory_1.getJobQueue)();
        strict_1.default.ok(q instanceof memory_1.InMemoryJobQueue);
        const job = await q.enqueue(mkInput());
        strict_1.default.equal(job.status, 'queued');
    }
    finally {
        if (savedDriver !== undefined)
            process.env.JOB_QUEUE_DRIVER = savedDriver;
        (0, factory_1.resetJobQueue)();
    }
});
(0, harness_1.test)('factory: explicit memory driver returns InMemoryJobQueue', () => {
    (0, factory_1.resetJobQueue)();
    const q = (0, factory_1.getJobQueue)({ driver: 'memory' });
    strict_1.default.ok(q instanceof memory_1.InMemoryJobQueue);
});
(0, harness_1.test)('factory: redis driver with injected client returns RedisJobQueue', () => {
    (0, factory_1.resetJobQueue)();
    const redis = new fake_redis_1.FakeRedis();
    const q = (0, factory_1.getJobQueue)({ driver: 'redis', redisClient: redis });
    strict_1.default.ok(q instanceof redis_1.RedisJobQueue);
});
(0, harness_1.test)('factory: redis driver without env or client throws', () => {
    const savedDriver = process.env.JOB_QUEUE_DRIVER;
    const savedUrl = process.env.UPSTASH_REDIS_REST_URL;
    const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.JOB_QUEUE_DRIVER = 'redis';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    (0, factory_1.resetJobQueue)();
    try {
        strict_1.default.throws(() => (0, factory_1.getJobQueue)(), /UPSTASH_REDIS_REST_URL/);
    }
    finally {
        if (savedDriver !== undefined)
            process.env.JOB_QUEUE_DRIVER = savedDriver;
        else
            delete process.env.JOB_QUEUE_DRIVER;
        if (savedUrl !== undefined)
            process.env.UPSTASH_REDIS_REST_URL = savedUrl;
        if (savedToken !== undefined)
            process.env.UPSTASH_REDIS_REST_TOKEN = savedToken;
        (0, factory_1.resetJobQueue)();
    }
});
(0, harness_1.test)('factory: resetJobQueue clears the cache', async () => {
    const a = (0, factory_1.getJobQueue)();
    (0, factory_1.resetJobQueue)();
    const b = (0, factory_1.getJobQueue)();
    strict_1.default.notEqual(a, b);
});
(0, harness_1.test)('factory: redis driver respects retentionHours env var', async () => {
    const savedDriver = process.env.JOB_QUEUE_DRIVER;
    const savedRetention = process.env.JOB_RETENTION_HOURS;
    process.env.JOB_QUEUE_DRIVER = 'redis';
    process.env.JOB_RETENTION_HOURS = '48';
    (0, factory_1.resetJobQueue)();
    try {
        const redis = new fake_redis_1.FakeRedis();
        const q = (0, factory_1.getJobQueue)({ driver: 'redis', redisClient: redis });
        // Retention is private; verify via cleanup behavior — 48h retention means
        // a 36h-old job is NOT purged.
        const job = await q.enqueue(mkInput());
        await q.update(job.id, { status: 'completed' });
        // Backdate 36h ago.
        const past = Date.now() - 36 * 60 * 60 * 1000;
        await redis.zadd('queue:completed', { [job.id]: past });
        const purged = await q.cleanup();
        strict_1.default.equal(purged, 0);
    }
    finally {
        if (savedDriver !== undefined)
            process.env.JOB_QUEUE_DRIVER = savedDriver;
        else
            delete process.env.JOB_QUEUE_DRIVER;
        if (savedRetention !== undefined)
            process.env.JOB_RETENTION_HOURS = savedRetention;
        else
            delete process.env.JOB_RETENTION_HOURS;
        (0, factory_1.resetJobQueue)();
    }
});
