"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.klingProvider = void 0;
/**
 * KLING (Kuaishou) via Fal.ai — wrapper adapter.
 *
 * Same fire-and-await pattern as the Wan adapter. Underlying
 * `generateFalKlingVideo` in `lib/fal.ts` is synchronous/await-and-block:
 * it submits a prediction and polls until completion internally, only
 * resolving with the final URL. It does NOT expose an external job id.
 *
 * Contract mapping is identical to the Wan adapter:
 *   - `generate()` returns immediately with an INTERNAL jobId (UUID).
 *   - The async work is tracked in an in-memory map.
 *   - `pollStatus(jobId)` reads the map.
 *   - `cancel(jobId)` is best-effort; the underlying Fal prediction,
 *     once submitted, is not abortable from this integration.
 */
const fal_1 = require("@/lib/fal");
const jobs = new Map();
function newInternalId() {
    const g = globalThis;
    if (g.crypto && typeof g.crypto.randomUUID === 'function') {
        return `kling_${g.crypto.randomUUID()}`;
    }
    return `kling_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
function capabilities() {
    return {
        audioNative: false,
        maxDurationSec: 10,
        aspectRatios: ['16:9', '9:16', '1:1'],
        resolutions: ['720p', '1080p'],
        imageToVideo: true,
        textToVideo: false,
        multiShot: false,
    };
}
exports.klingProvider = {
    id: 'kling',
    enabled: true,
    capabilities: capabilities(),
    async generate(input) {
        const jobId = newInternalId();
        const startedAt = new Date().toISOString();
        jobs.set(jobId, { kind: 'pending', startedAt });
        const aspect = input.aspectRatio === '4:5' ? '1:1' : input.aspectRatio;
        void (async () => {
            try {
                const imageUrl = input.imageUrl;
                if (!imageUrl) {
                    throw new Error('kling provider requires imageUrl (i2v)');
                }
                const outputUrl = await (0, fal_1.generateFalKlingVideo)(imageUrl, input.prompt, aspect);
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
            providerId: 'kling',
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
    },
};
function redact(msg) {
    return msg.replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]');
}
