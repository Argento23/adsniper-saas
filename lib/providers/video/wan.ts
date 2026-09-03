import { VideoProvider as VideoProviderContract } from '../types';

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

import { generateReplicateVideo } from '@/lib/replicate';
import {
    VideoGenInput,
    VideoGenHandle,
    VideoJobStatus,
    VideoProviderCapabilities,
} from '../types';

type InternalState =
    | { kind: 'pending'; startedAt: string }
    | { kind: 'completed'; outputUrl: string; completedAt: string }
    | { kind: 'failed'; error: string; completedAt: string }
    | { kind: 'cancelled' };

const jobs = new Map<string, InternalState>();

function newInternalId(): string {
    const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
    if (g.crypto && typeof g.crypto.randomUUID === 'function') {
        return `wan_${g.crypto.randomUUID()}`;
    }
    return `wan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureAspect(input: VideoGenInput): '16:9' | '9:16' | '1:1' {
    if (input.aspectRatio === '4:5') return '1:1';
    return input.aspectRatio;
}

function capabilities(): VideoProviderCapabilities {
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

export const wanProvider: VideoProviderContract = {
    id: 'wan',
    enabled: true,
    capabilities: capabilities(),

    async generate(input: VideoGenInput): Promise<VideoGenHandle> {
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
                const outputUrl = await generateReplicateVideo(
                    imageUrl,
                    input.prompt,
                );
                jobs.set(jobId, {
                    kind: 'completed',
                    outputUrl,
                    completedAt: new Date().toISOString(),
                });
            } catch (err: unknown) {
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

    async pollStatus(externalJobId: string): Promise<VideoJobStatus> {
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

    async cancel(externalJobId: string): Promise<void> {
        const state = jobs.get(externalJobId);
        if (!state) return;
        if (state.kind === 'pending') {
            jobs.set(externalJobId, { kind: 'cancelled' });
        }
        // Already terminal states stay as-is.
    },
};

function redact(msg: string): string {
    return msg.replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]');
}
