/**
 * In-memory JobQueue — dev/test only.
 *
 * Implements the same `JobQueue` interface as `redis.ts` but keeps
 * everything in process memory. Used when `JOB_QUEUE_DRIVER=memory`
 * (default) and in tests.
 *
 * Jobs are stored in a `Map` indexed by id. FIFO order is preserved
 * via a parallel `Array` of ids for `dequeue()`.
 */

import {
    CreateJobInput,
    DEFAULT_JOB_QUEUE_OPTIONS,
    GenerationJob,
    JobPatch,
    JobQueueOptions,
    JobStatus,
} from './types';

export interface InMemoryJobQueueOptions extends Partial<JobQueueOptions> {}

export class InMemoryJobQueue {
    private jobs = new Map<string, GenerationJob>();
    private pendingIds: string[] = [];
    private activeIds = new Set<string>();
    private completedIds = new Set<string>();
    private options: JobQueueOptions;

    constructor(options: InMemoryJobQueueOptions = {}) {
        this.options = { ...DEFAULT_JOB_QUEUE_OPTIONS, ...options };
    }

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
        this.jobs.set(job.id, job);
        this.pendingIds.push(job.id);
        return job;
    }

    async get(id: string): Promise<GenerationJob | undefined> {
        return this.jobs.get(id);
    }

    async listByUser(userId: string): Promise<GenerationJob[]> {
        return Array.from(this.jobs.values())
            .filter(j => j.userId === userId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    async dequeue(): Promise<GenerationJob | null> {
        // FIFO: take the first pending id.
        const id = this.pendingIds.shift();
        if (!id) return null;
        const job = this.jobs.get(id);
        if (!job || job.status !== 'queued') return null;
        this.pendingIds = this.pendingIds.filter(x => x !== id);
        this.activeIds.add(id);
        return job;
    }

    async update(id: string, patch: JobPatch): Promise<GenerationJob | undefined> {
        const job = this.jobs.get(id);
        if (!job) return undefined;
        const now = new Date().toISOString();
        const updated: GenerationJob = {
            ...job,
            ...patch,
            // Auto-stamp timestamps on status transitions.
            startedAt:
                patch.status === 'processing' && !job.startedAt
                    ? now
                    : job.startedAt,
            completedAt:
                (patch.status === 'completed' || patch.status === 'failed') && !job.completedAt
                    ? now
                    : job.completedAt,
            updatedAt: now,
        };
        this.jobs.set(id, updated);
        this.reindex(id, updated.status);
        return updated;
    }

    async complete(id: string, outputUrl: string): Promise<GenerationJob | undefined> {
        return this.update(id, { status: 'completed', outputUrl });
    }

    async fail(id: string, error: string): Promise<GenerationJob | undefined> {
        return this.update(id, { status: 'failed', error });
    }

    async requeueStaleJobs(): Promise<number> {
        let count = 0;
        const now = new Date().toISOString();
        for (const id of Array.from(this.activeIds)) {
            const job = this.jobs.get(id);
            if (!job) continue;
            if (job.status !== 'processing') {
                this.activeIds.delete(id);
                continue;
            }
            // Simulate restart: move back to pending.
            const updated: GenerationJob = {
                ...job,
                status: 'queued',
                startedAt: undefined,
                updatedAt: now,
            };
            this.jobs.set(id, updated);
            this.activeIds.delete(id);
            this.pendingIds.push(id);
            count++;
        }
        return count;
    }

    // ── Backward-compat sync shims (Phase 6G export runner uses these) ──

    /**
     * Sync update for the in-memory queue — the storage is process-local
     * and we want the call site to see the new state immediately. For the
     * Redis queue this is fire-and-forget (network is async).
     */
    markProcessing(id: string): GenerationJob | undefined {
        const job = this.jobs.get(id);
        if (!job) return undefined;
        const now = new Date().toISOString();
        const updated: GenerationJob = {
            ...job,
            status: 'processing',
            startedAt: job.startedAt ?? now,
            updatedAt: now,
        };
        this.jobs.set(id, updated);
        this.reindex(id, updated.status);
        return updated;
    }

    markCompleted(id: string, output: { outputAssetId?: string; outputUrl?: string }): GenerationJob | undefined {
        const job = this.jobs.get(id);
        if (!job) return undefined;
        const now = new Date().toISOString();
        const updated: GenerationJob = {
            ...job,
            status: 'completed',
            ...output,
            completedAt: job.completedAt ?? now,
            updatedAt: now,
        };
        this.jobs.set(id, updated);
        this.reindex(id, updated.status);
        return updated;
    }

    markFailed(id: string, error: string): GenerationJob | undefined {
        const job = this.jobs.get(id);
        if (!job) return undefined;
        const now = new Date().toISOString();
        const updated: GenerationJob = {
            ...job,
            status: 'failed',
            error,
            completedAt: job.completedAt ?? now,
            updatedAt: now,
        };
        this.jobs.set(id, updated);
        this.reindex(id, updated.status);
        return updated;
    }

    // ── Test helpers (not part of the JobQueue contract) ──────────────

    /** Returns a snapshot of every job. Test-only. */
    _snapshot(): GenerationJob[] {
        return Array.from(this.jobs.values());
    }

    /** Resets the queue to empty. Test-only. */
    _reset(): void {
        this.jobs.clear();
        this.pendingIds = [];
        this.activeIds.clear();
        this.completedIds.clear();
    }

    private reindex(id: string, status: JobStatus): void {
        if (status === 'queued') {
            if (!this.pendingIds.includes(id)) this.pendingIds.push(id);
            this.activeIds.delete(id);
        } else if (status === 'processing') {
            this.pendingIds = this.pendingIds.filter(x => x !== id);
            this.activeIds.add(id);
        } else {
            this.pendingIds = this.pendingIds.filter(x => x !== id);
            this.activeIds.delete(id);
            this.completedIds.add(id);
        }
    }
}

function randomId(): string {
    const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
    if (g.crypto && typeof g.crypto.randomUUID === 'function') {
        return g.crypto.randomUUID();
    }
    return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
