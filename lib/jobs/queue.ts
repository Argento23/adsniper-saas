import { CreateJobInput, GenerationJob, JobStatus, JobQueueOptions } from './types';

const DEFAULT_OPTIONS: JobQueueOptions = {
    maxConcurrentPerUser: 3,
};

export class InMemoryJobQueue {
    private jobs = new Map<string, GenerationJob>();
    private activeByUser = new Map<string, number>();
    private options: JobQueueOptions;

    constructor(options: Partial<JobQueueOptions> = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    enqueue(input: CreateJobInput): GenerationJob {
        const now = new Date().toISOString();
        const job: GenerationJob = {
            id: cryptoRandomId(),
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
        return job;
    }

    get(id: string): GenerationJob | undefined {
        return this.jobs.get(id);
    }

    listByUser(userId: string): GenerationJob[] {
        return Array.from(this.jobs.values())
            .filter(j => j.userId === userId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    canStart(userId: string): boolean {
        const active = this.activeByUser.get(userId) ?? 0;
        return active < this.options.maxConcurrentPerUser;
    }

    markProcessing(id: string): GenerationJob | undefined {
        const job = this.jobs.get(id);
        if (!job) return undefined;
        const now = new Date().toISOString();
        const updated: GenerationJob = {
            ...job,
            status: 'processing',
            startedAt: now,
            updatedAt: now,
        };
        this.jobs.set(id, updated);
        this.activeByUser.set(updated.userId, (this.activeByUser.get(updated.userId) ?? 0) + 1);
        return updated;
    }

    markCompleted(id: string, output: { outputAssetId?: string; outputUrl?: string }): GenerationJob | undefined {
        const job = this.jobs.get(id);
        if (!job) return undefined;
        const now = new Date().toISOString();
        const updated: GenerationJob = {
            ...job,
            status: 'completed',
            outputAssetId: output.outputAssetId,
            outputUrl: output.outputUrl,
            completedAt: now,
            updatedAt: now,
        };
        this.jobs.set(id, updated);
        this.decrementActive(updated.userId);
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
            completedAt: now,
            updatedAt: now,
        };
        this.jobs.set(id, updated);
        this.decrementActive(updated.userId);
        return updated;
    }

    cancel(id: string): GenerationJob | undefined {
        const job = this.jobs.get(id);
        if (!job) return undefined;
        if (job.status === 'completed' || job.status === 'failed') return job;
        const now = new Date().toISOString();
        const wasProcessing = job.status === 'processing';
        const updated: GenerationJob = {
            ...job,
            status: 'cancelled' as JobStatus,
            completedAt: now,
            updatedAt: now,
        };
        this.jobs.set(id, updated);
        if (wasProcessing) this.decrementActive(updated.userId);
        return updated;
    }

    private decrementActive(userId: string): void {
        const current = this.activeByUser.get(userId) ?? 0;
        const next = Math.max(0, current - 1);
        if (next === 0) {
            this.activeByUser.delete(userId);
        } else {
            this.activeByUser.set(userId, next);
        }
    }
}

function cryptoRandomId(): string {
    const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
    if (g.crypto && typeof g.crypto.randomUUID === 'function') {
        return g.crypto.randomUUID();
    }
    return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

let singleton: InMemoryJobQueue | null = null;

export function getJobQueue(): InMemoryJobQueue {
    if (!singleton) singleton = new InMemoryJobQueue();
    return singleton;
}
