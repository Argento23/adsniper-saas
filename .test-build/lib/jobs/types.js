"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_JOB_QUEUE_OPTIONS = void 0;
exports.DEFAULT_JOB_QUEUE_OPTIONS = {
    maxConcurrentPerUser: 3,
};
