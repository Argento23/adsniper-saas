/**
 * Job queue types — Phase 7.
 *
 * Status enum: spec called for `running` but we keep `processing`
 * for backward compat with the frontend (TimelineEditor.tsx checks
 * `status === 'processing'`). `processing` and `running` are
 * semantically identical.
 *
 * Field additions for Phase 7:
 *   - `progress` (0..100) — UI hook for long-running jobs
 *   - `startedAt` — set when transitioning to `processing`
 *   - `completedAt` — set when transitioning to terminal state
 */

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type JobType = 'image' | 'video' | 'voice' | 'music' | 'export';

export interface GenerationJob {
    id: string;
    userId: string;
    projectId?: string;
    sceneId?: string;
    type: JobType;
    provider?: string;
    model?: string;
    status: JobStatus;
    /** 0..100 — updated by the worker during execution. */
    progress?: number;
    input: Record<string, unknown>;
    outputAssetId?: string;
    outputUrl?: string;
    error?: string;
    estimatedCostUsd?: number;
    creditsReserved?: number;
    startedAt?: string;
    completedAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateJobInput {
    userId: string;
    projectId?: string;
    sceneId?: string;
    type: JobType;
    provider?: string;
    model?: string;
    input: Record<string, unknown>;
    estimatedCostUsd?: number;
    creditsReserved?: number;
}

export interface JobQueueOptions {
    maxConcurrentPerUser: number;
}

export const DEFAULT_JOB_QUEUE_OPTIONS: JobQueueOptions = {
    maxConcurrentPerUser: 3,
};

/**
 * Patch shape accepted by `JobQueue.update()`. All fields are
 * optional; only the provided ones are written. Setting `status`
 * to `processing` automatically stamps `startedAt`; setting it
 * to `completed`/`failed` automatically stamps `completedAt`.
 */
export interface JobPatch {
    status?: JobStatus;
    progress?: number;
    outputAssetId?: string;
    outputUrl?: string;
    error?: string;
    provider?: string;
    model?: string;
}
