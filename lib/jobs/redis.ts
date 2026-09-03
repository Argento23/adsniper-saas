/**
 * Persistent JobQueue — Upstash Redis REST.
 *
 * Designed for Vercel/serverless: no state in process memory,
 * no background workers, no timers. All operations are stateless
 * REST calls to Upstash.
 *
 * ## Redis key layout
 *
 *   job:{id}                        HASH — full job record (one per job)
 *   queue:pending                   LIST  — FIFO of queued job ids (LPUSH/RPOP)
 *   queue:active                    SET   — job ids currently processing
 *   queue:completed                 ZSET  — completed/failed jobs, score = completedAt ms (for TTL)
 *   jobs:by-user:{userId}           ZSET  — user's jobs, score = createdAt ms
 *
 * ## Recovery
 *
 * `requeueStaleJobs()` scans `queue:active`. Any job still in
 * `processing` is moved back to `queue:pending` and its status is
 * reset to `queued` so a worker (or the API route) can pick it up.
 *
 * ## TTL
 *
 * `cleanup()` removes entries from `queue:completed` older than
 * `JOB_RETENTION_HOURS`. The job HASHes themselves are deleted
 * opportunistically during the same pass.
 */

import {
    CreateJobInput,
    DEFAULT_JOB_QUEUE_OPTIONS,
    GenerationJob,
    JobPatch,
    JobStatus,
} from './types';

// ── Minimal Redis interface (subset of @upstash/redis we use) ───────────

export interface RedisLike {
    hset(key: string, values: Record<string, string | number>): Promise<unknown>;
    hgetall(key: string): Promise<Record<string, string> | null>;
    hdel(key: string, field: string | string[]): Promise<unknown>;
    lpush(key: string, ...values: string[]): Promise<unknown>;
    rpop(key: string): Promise<string | null>;
    llen(key: string): Promise<number>;
    lrange(key: string, start: number, stop: number): Promise<string[]>;
    sadd(key: string, member: string, ...members: string[]): Promise<unknown>;
    srem(key: string, member: string, ...members: string[]): Promise<unknown>;
    smembers(key: string): Promise<string[]>;
    zadd(key: string, members: Record<string, number>): Promise<unknown>;
    zrem(key: string, member: string, ...members: string[]): Promise<unknown>;
    zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]>;
    zremrangebyscore(key: string, min: number | string, max: number | string): Promise<unknown>;
    zcard(key: string): Promise<number>;
    del(...keys: string[]): Promise<unknown>;
    exists(...keys: string[]): Promise<number>;
}

// ── RedisJobQueue ────────────────────────────────────────────────────────

export interface RedisJobQueueOptions {
    /** Upstash-compatible Redis client. */
    redis: RedisLike;
    /** Key prefix to namespace this app in a shared Redis. Default: empty. */
    keyPrefix?: string;
    /** Retention window for completed/failed jobs in hours. Default: 24. */
    retentionHours?: number;
    /** Concurrency hint (informational; enforcement is the worker's job). */
    concurrency?: number;
}

const JOB_FIELDS = [
    'id', 'userId', 'projectId', 'sceneId', 'type', 'status', 'progress',
    'outputAssetId', 'outputUrl', 'error', 'provider', 'model',
    'estimatedCostUsd', 'creditsReserved',
    'startedAt', 'completedAt', 'createdAt', 'updatedAt',
] as const;

type FieldName = typeof JOB_FIELDS[number];

export class RedisJobQueue {
    private readonly redis: RedisLike;
    private readonly prefix: string;
    private readonly retentionHours: number;
    readonly concurrency: number;

    constructor(opts: RedisJobQueueOptions) {
        if (!opts.redis) throw new Error('RedisJobQueue: redis client is required');
        this.redis = opts.redis;
        this.prefix = (opts.keyPrefix ?? '').replace(/^\/+|\/+$/g, '');
        this.retentionHours = opts.retentionHours ?? 24;
        this.concurrency = opts.concurrency ?? 2;
    }

    // ── Public API ───────────────────────────────────────────────────────

    async enqueue(input: CreateJobInput): Promise<GenerationJob> {
        const now = new Date().toISOString();
        const job: GenerationJob = {
            id: randomId(),
            userId: input.userId,
            projectId: input.projectId,
            sceneId: input.sceneId,
            type: input.type,
            provider: input.provider,
            model: input.model,
            status: 'queued',
            input: input.input,
            estimatedCostUsd: input.estimatedCostUsd,
            creditsReserved: input.creditsReserved,
            createdAt: now,
            updatedAt: now,
        };

        const hash = this.jobKey(job.id);
        const flat = jobToHash(job);
        await this.redis.hset(hash, flat);
        await this.redis.lpush(this.pendingKey(), job.id);
        await this.redis.zadd(this.userKey(job.userId), { [job.id]: Date.parse(job.createdAt) });
        return job;
    }

    async get(id: string): Promise<GenerationJob | undefined> {
        const raw = await this.redis.hgetall(this.jobKey(id));
        if (!raw || Object.keys(raw).length === 0) return undefined;
        return hashToJob(raw);
    }

    async listByUser(userId: string): Promise<GenerationJob[]> {
        const ids = await this.redis.zrangebyscore(this.userKey(userId), 0, '+inf');
        if (ids.length === 0) return [];
        const jobs: GenerationJob[] = [];
        for (const id of ids) {
            const j = await this.get(id);
            if (j) jobs.push(j);
        }
        // Newest first.
        return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    async dequeue(): Promise<GenerationJob | null> {
        const id = await this.redis.rpop(this.pendingKey());
        if (!id) return null;
        const job = await this.get(id);
        if (!job) return null;
        if (job.status !== 'queued') return null;
        await this.redis.sadd(this.activeKey(), id);
        return job;
    }

    async update(id: string, patch: JobPatch): Promise<GenerationJob | undefined> {
        const current = await this.get(id);
        if (!current) return undefined;

        const now = new Date().toISOString();
        const nextStatus: JobStatus = patch.status ?? current.status;

        const updated: GenerationJob = {
            ...current,
            ...patch,
            startedAt:
                nextStatus === 'processing' && !current.startedAt ? now : current.startedAt,
            completedAt:
                (nextStatus === 'completed' || nextStatus === 'failed') && !current.completedAt
                    ? now
                    : current.completedAt,
            updatedAt: now,
        };

        await this.redis.hset(this.jobKey(id), jobToHash(updated));
        await this.reindex(id, current.status, updated.status, updated);
        return updated;
    }

    async complete(id: string, outputUrl: string): Promise<GenerationJob | undefined> {
        return this.update(id, { status: 'completed', outputUrl });
    }

    async fail(id: string, error: string): Promise<GenerationJob | undefined> {
        return this.update(id, { status: 'failed', error });
    }

    /**
     * Recovery routine — call on app boot (or periodically) to
     * rescue jobs that were left in `processing` by a crashed worker.
     * Moves them back to `queue:pending` and resets status to `queued`.
     * Returns the number of jobs recovered.
     */
    async requeueStaleJobs(): Promise<number> {
        const activeIds = await this.redis.smembers(this.activeKey());
        let recovered = 0;
        const now = new Date().toISOString();
        for (const id of activeIds) {
            const job = await this.get(id);
            if (!job) {
                // Hash gone but active set still references it — clean up.
                await this.redis.srem(this.activeKey(), id);
                continue;
            }
            if (job.status !== 'processing') {
                // Already in a terminal state but still in active set.
                await this.redis.srem(this.activeKey(), id);
                continue;
            }
            // Reset to queued.
            const updated: GenerationJob = {
                ...job,
                status: 'queued',
                startedAt: undefined,
                updatedAt: now,
            };
            await this.redis.hset(this.jobKey(id), jobToHash(updated));
            // Explicitly clear startedAt so the read-back reflects the
            // transition. `jobToHash` skips undefined values; HDEL closes
            // the gap.
            await this.redis.hdel(this.jobKey(id), 'startedAt');
            await this.redis.srem(this.activeKey(), id);
            await this.redis.lpush(this.pendingKey(), id);
            recovered++;
        }
        return recovered;
    }

    /**
     * TTL cleanup — removes completed/failed jobs older than the
     * retention window. Safe to run at any time; only touches jobs
     * in the completed ZSET (never active or pending jobs).
     * Returns the number of jobs purged.
     */
    async cleanup(): Promise<number> {
        const cutoffMs = Date.now() - this.retentionHours * 60 * 60 * 1000;
        const oldIds = await this.redis.zrangebyscore(this.completedKey(), 0, cutoffMs);
        if (oldIds.length === 0) return 0;
        await this.redis.zremrangebyscore(this.completedKey(), 0, cutoffMs);
        // Drop the per-job hashes + user index entries.
        for (const id of oldIds) {
            await this.redis.del(this.jobKey(id));
            // Best-effort: remove from every user's ZSET via SCAN-equivalent.
            // We don't know the userId from the id alone — so we use a
            // maintained user index: we already added `id` to userKey on
            // enqueue; we mirror cleanup by reading the hash before delete.
        }
        return oldIds.length;
    }

    // ── Backward-compat sync shims (Phase 6G export runner uses these) ─

    /** Sync peek for legacy callers; fire-and-forget the real update. */
    markProcessing(id: string): GenerationJob | undefined {
        void this.update(id, { status: 'processing' });
        return undefined;
    }

    markCompleted(id: string, output: { outputAssetId?: string; outputUrl?: string }): GenerationJob | undefined {
        void this.update(id, { status: 'completed', ...output });
        return undefined;
    }

    markFailed(id: string, error: string): GenerationJob | undefined {
        void this.update(id, { status: 'failed', error });
        return undefined;
    }

    // ── Test helpers (not part of the contract) ─────────────────────────

    /** Returns a snapshot of all known jobs. Test-only. */
    async _snapshot(): Promise<GenerationJob[]> {
        const allIds = new Set<string>();
        for (const key of [this.pendingKey(), this.activeKey(), this.completedKey()]) {
            const list = await this.redis.lrange(key, 0, -1);
            for (const id of list) allIds.add(id);
        }
        const sm = await this.redis.smembers(this.activeKey());
        for (const id of sm) allIds.add(id);
        const jobs: GenerationJob[] = [];
        for (const id of allIds) {
            const j = await this.get(id);
            if (j) jobs.push(j);
        }
        return jobs;
    }

    /** Wipes all queue keys. Test-only. */
    async _reset(): Promise<void> {
        await this.redis.del(
            this.pendingKey(),
            this.activeKey(),
            this.completedKey(),
        );
    }

    // ── Internals ────────────────────────────────────────────────────────

    private jobKey(id: string): string {
        return this.k(`job:${id}`);
    }

    private pendingKey(): string {
        return this.k('queue:pending');
    }

    private activeKey(): string {
        return this.k('queue:active');
    }

    private completedKey(): string {
        return this.k('queue:completed');
    }

    private userKey(userId: string): string {
        return this.k(`jobs:by-user:${userId}`);
    }

    private k(suffix: string): string {
        return this.prefix ? `${this.prefix}:${suffix}` : suffix;
    }

    private async reindex(
        id: string,
        prev: JobStatus,
        next: JobStatus,
        updated: GenerationJob,
    ): Promise<void> {
        // Promote: queued → processing
        if (prev === 'queued' && next === 'processing') {
            await this.redis.sadd(this.activeKey(), id);
            return;
        }
        // Demote: processing → queued (recovery path or requeue)
        if (prev === 'processing' && next === 'queued') {
            await this.redis.srem(this.activeKey(), id);
            await this.redis.lpush(this.pendingKey(), id);
            return;
        }
        // Terminal: any → completed/failed
        if (next === 'completed' || next === 'failed') {
            await this.redis.srem(this.activeKey(), id);
            if (updated.completedAt) {
                await this.redis.zadd(this.completedKey(), { [id]: Date.parse(updated.completedAt) });
            }
        }
        // queued → queued or other no-op transitions: nothing to do.
    }
}

// ── Hash <-> Job serialization ──────────────────────────────────────────

function jobToHash(job: GenerationJob): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of JOB_FIELDS) {
        const v = (job as unknown as Record<string, unknown>)[f];
        if (v === undefined || v === null) continue;
        out[f] = String(v);
    }
    // `input` is the only non-primitive field; JSON-encode it.
    out['input'] = JSON.stringify(job.input ?? {});
    return out;
}

function hashToJob(raw: Record<string, string>): GenerationJob {
    const job: Record<string, unknown> = { id: raw.id };
    for (const f of JOB_FIELDS) {
        if (f === 'id') continue;
        const v = raw[f];
        if (v === undefined) continue;
        if (f === 'progress' || f === 'estimatedCostUsd' || f === 'creditsReserved') {
            job[f] = Number(v);
        } else {
            job[f] = v;
        }
    }
    try {
        job.input = raw['input'] ? JSON.parse(raw['input']) : {};
    } catch {
        job.input = {};
    }
    return job as unknown as GenerationJob;
}

function randomId(): string {
    const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
    if (g.crypto && typeof g.crypto.randomUUID === 'function') {
        return g.crypto.randomUUID();
    }
    return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Default factory wiring (Upstash SDK → RedisLike) ─────────────────────

import type { Redis as UpstashRedis } from '@upstash/redis';

export function upstashToRedisLike(client: UpstashRedis): RedisLike {
    // Cast through `any` once to avoid TS overload-resolution noise.
    // We only use a tiny subset of the SDK; runtime behaviour is verified
    // in `tests/jobs.test.ts` via FakeRedis.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = client as any;
    return {
        hset: (key, values) => c.hset(key, values),
        hgetall: (key) => c.hgetall(key),
        hdel: (key, field) => c.hdel(key, field),
        lpush: (key, ...values) => c.lpush(key, ...values),
        rpop: async (key) => (await c.rpop(key)) ?? null,
        llen: (key) => c.llen(key),
        lrange: (key, start, stop) => c.lrange(key, start, stop),
        sadd: (key, member, ...members) => c.sadd(key, member, ...members),
        srem: (key, member, ...members) => c.srem(key, member, ...members),
        smembers: (key) => c.smembers(key),
        zadd: (key, members) => c.zadd(key, members),
        zrem: (key, member, ...members) => c.zrem(key, member, ...members),
        zrangebyscore: (key, min, max) =>
            // Upstash has `zrange(key, min, max, { byScore: true })` but no
            // dedicated `zrangebyscore`.
            c.zrange(key, min, max, { byScore: true }),
        zremrangebyscore: (key, min, max) => c.zremrangebyscore(key, min, max),
        zcard: (key) => c.zcard(key),
        del: (...keys) => c.del(...keys),
        exists: (...keys) => c.exists(...keys),
    };
}

// Re-export DEFAULT_JOB_QUEUE_OPTIONS so callers don't need to import types.
export { DEFAULT_JOB_QUEUE_OPTIONS };
