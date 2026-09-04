"use strict";
/**
 * JobQueue factory — selects backend by `JOB_QUEUE_DRIVER`.
 *
 *   JOB_QUEUE_DRIVER unset / "memory" → InMemoryJobQueue (default)
 *   JOB_QUEUE_DRIVER="redis"          → RedisJobQueue (Upstash)
 *
 * The factory caches the resolved queue per-process. Singleton is
 * intentional — recreating the queue on every call would defeat
 * the in-memory driver's caching AND add REST roundtrips for
 * Redis-based jobs.
 *
 * For tests, `resetJobQueue()` clears the cache so a new driver
 * can be selected (e.g. to swap to a fake Redis client).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJobQueue = getJobQueue;
exports.resetJobQueue = resetJobQueue;
const memory_1 = require("./memory");
const redis_1 = require("./redis");
let cached = null;
function getJobQueue(opts = {}) {
    if (cached)
        return cached;
    const rawDriver = (opts.driver ?? process.env.JOB_QUEUE_DRIVER ?? 'memory').toLowerCase();
    const driver = rawDriver === 'redis' ? 'redis' : 'memory';
    if (driver === 'memory') {
        cached = new memory_1.InMemoryJobQueue();
        return cached;
    }
    // Redis driver
    let client = opts.redisClient;
    if (!client) {
        const url = process.env.UPSTASH_REDIS_REST_URL;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN;
        if (!url || !token) {
            throw new Error('JOB_QUEUE_DRIVER=redis requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars');
        }
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Redis } = require('@upstash/redis');
        client = (0, redis_1.upstashToRedisLike)(new Redis({ url, token }));
    }
    cached = new redis_1.RedisJobQueue({
        redis: client,
        keyPrefix: opts.redisOptions?.keyPrefix ?? process.env.JOB_QUEUE_KEY_PREFIX,
        retentionHours: opts.redisOptions?.retentionHours ??
            parsePositive(process.env.JOB_RETENTION_HOURS) ??
            24,
        concurrency: opts.redisOptions?.concurrency ??
            parsePositive(process.env.JOB_CONCURRENCY) ??
            2,
    });
    return cached;
}
/**
 * Drops the cached queue. Useful in tests that swap drivers between
 * scenarios (e.g. memory → fake redis → memory).
 */
function resetJobQueue() {
    cached = null;
}
function parsePositive(raw) {
    if (!raw)
        return undefined;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
}
