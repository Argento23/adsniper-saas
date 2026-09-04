"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wanProvider = void 0;
/**
 * WAN (Alibaba) via Replicate — wrapper adapter.
 *
 * IMPORTANT: underlying `generateReplicateVideo` in `lib/replicate.ts` is
 * synchronous/await-and-block: it polls internally and only resolves when
 * the final video URL is ready (or it throws). It does NOT expose an
 * external job id we can poll from outside.
 *
 * To respect the `VideoProvider` contract (submit -> handle -> pollStatus),
 * this adapter wraps the synchronous call in a fire-and-await pattern:
 *   - `generate()` kicks off the call without awaiting its completion and
 *     immediately returns a handle with an INTERNAL jobId (UUID).
 *   - The promise is tracked in an in-memory map keyed by that jobId.
 *   - `pollStatus(jobId)` reads that map and reports the current state.
 *   - `cancel(jobId)` marks the entry as cancelled (the underlying call,
 *     once started, cannot be aborted by Replicate in this integration).
 *
 * This is MVP behaviour. A future migration to Supabase-backed jobs will
 * preserve the same external contract.
 */
const replicate_1 = require("@/lib/replicate");
const jobs = new Map();
function newInternalId() {
    const g = globalThis;
    if (g.crypto && typeof g.crypto.randomUUID === 'function') {
        return `wan_${g.crypto.randomUUID()}`;
    }
    return `wan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
function ensureAspect(input) {
    if (input.aspectRatio === '4:5')
        return '1:1';
    return input.aspectRatio;
}
function capabilities() {
    return {
        audioNative: false,
        maxDurationSec: 10,
        aspectRatios: ['16:9', '9:16', '1:1'],
        resolutions: ['480p', '720p', '1080p'],
        imageToVideo: true,
        textToVideo: false,
        multiShot: false,
    };
}
exports.wanProvider = {
    id: 'wan',
    enabled: true,
    capabilities: capabilities(),
    async generate(input) {
        const jobId = newInternalId();
        const startedAt = new Date().toISOString();
        jobs.set(jobId, { kind: 'pending', startedAt });
        const aspect = ensureAspect(input);
        // Kick off without blocking the caller.
        // We do NOT await here — `generate` must return quickly.
        void (async () => {
            try {
                const imageUrl = input.imageUrl;
                if (!imageUrl) {
                    throw new Error('wan provider requires imageUrl (i2v)');
                }
                const outputUrl = await (0, replicate_1.generateReplicateVideo)(imageUrl, input.prompt);
                jobs.set(jobId, {
                    kind: 'completed',
                    outputUrl,
                    completedAt: new Date().toISOString(),
                });
            }
            catch (err) {
                const message = err instanceof Error ? err.message : 'unknown error';
                jobs.set(jobId, {
                    kind: 'failed',
                    error: redact(message),
                    completedAt: new Date().toISOString(),
                });
            }
        })();
        return {
            externalJobId: jobId,
            providerId: 'wan',
            estimatedCostUsd: undefined,
            startedAt,
        };
    },
    async pollStatus(externalJobId) {
        const state = jobs.get(externalJobId);
        if (!state) {
            return { externalJobId, state: 'failed', error: 'job not found' };
        }
        if (state.kind === 'pending') {
            return { externalJobId, state: 'processing' };
        }
        if (state.kind === 'completed') {
            return { externalJobId, state: 'completed', outputUrl: state.outputUrl };
        }
        if (state.kind === 'failed') {
            return { externalJobId, state: 'failed', error: state.error };
        }
        return { externalJobId, state: 'cancelled' };
    },
    async cancel(externalJobId) {
        const state = jobs.get(externalJobId);
        if (!state)
            return;
        if (state.kind === 'pending') {
            jobs.set(externalJobId, { kind: 'cancelled' });
        }
        // Already terminal states stay as-is.
    },
};
function redact(msg) {
    return msg.replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]');
}
