export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

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
