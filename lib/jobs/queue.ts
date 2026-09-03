/**
 * BACKWARD-COMPATIBILITY SHIM.
 *
 * Phase 7 split the monolithic `queue.ts` into:
 *   - `lib/jobs/memory.ts` (InMemoryJobQueue)
 *   - `lib/jobs/redis.ts`  (RedisJobQueue)
 *   - `lib/jobs/factory.ts` (getJobQueue)
 *   - `lib/jobs/index.ts`  (barrel)
 *
 * New code should import from `@/lib/jobs` (the barrel) or directly
 * from `@/lib/jobs/factory` for the queue instance. This shim keeps
 * existing imports working without modification.
 */

export { getJobQueue, resetJobQueue } from './factory';
export type { JobQueueDriver, GetJobQueueOptions } from './factory';
export { InMemoryJobQueue } from './memory';
export { RedisJobQueue } from './redis';
export type { RedisLike, RedisJobQueueOptions } from './redis';
export {
    DEFAULT_JOB_QUEUE_OPTIONS,
} from './types';
export type {
    GenerationJob,
    CreateJobInput,
    JobStatus,
    JobType,
    JobPatch,
    JobQueueOptions,
} from './types';
