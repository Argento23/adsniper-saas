/**
 * Video Provider Chain — capability-aware routing + bounded retry/fallback.
 *
 * Pipeline:
 *   INPUT REQUIREMENTS  →  FILTER CAPABILITIES  →  CANDIDATES
 *   →  for each candidate (in declared order):
 *        try up to `retries` times; classify error; continue or stop.
 *
 * Error classification:
 *   - Retryable:    timeout, network error, 429/5xx, transient provider error.
 *   - Non-retryable: invalid input, auth failure, unsupported capability.
 *
 * Non-retryable errors short-circuit the chain (no point burning credits
 * on other providers when the problem is in the input).
 */

import {
    VideoGenInput,
    VideoGenHandle,
    VideoJobStatus,
    VideoProvider,
    VideoProviderId,
    VideoProviderChainEntry,
    VideoProviderChainConfig,
    VideoJobState,
} from '../types';
import {
    getVideoProvider,
    listEnabledVideoProviders,
} from './index';

export type ProviderErrorKind =
    | 'retryable'
    | 'non_retryable'
    | 'cancelled';

export interface ProviderAttemptLog {
    providerId: VideoProviderId;
    model?: string;
    startedAt: string;
    completedAt?: string;
    status: VideoJobState;
    error?: string;
    errorKind?: ProviderErrorKind;
    durationMs?: number;
}

export interface ChainResult {
    handle?: VideoGenHandle;
    finalStatus?: VideoJobStatus;
    attempts: ProviderAttemptLog[];
    failedAll: boolean;
}

export const DEFAULT_CHAIN: VideoProviderChainConfig = {
    chain: [
        { providerId: 'veo', retries: 1 },
        { providerId: 'wan', retries: 1 },
        { providerId: 'kling', retries: 1 },
    ],
};

const NON_RETRYABLE_PATTERNS = [
    /invalid prompt/i,
    /unsupported/i,
    /authentication/i,
    /unauthorised/i,
    /unauthorized/i,
    /invalid parameter/i,
    /missing image/i,
    /requires imageUrl/i,
    /imageUrl required/i,
    /not configured/i,
    /not enabled/i,
    /insufficient credits/i,
];

const RETRYABLE_PATTERNS = [
    /timeout/i,
    /timed out/i,
    /network/i,
    /fetch failed/i,
    /econnreset/i,
    /etimedout/i,
    /429/,
    /5\d\d/,
    /temporal/i,
    /transient/i,
    /rate limit/i,
];

export function classifyError(message: string): ProviderErrorKind {
    for (const p of NON_RETRYABLE_PATTERNS) {
        if (p.test(message)) return 'non_retryable';
    }
    for (const p of RETRYABLE_PATTERNS) {
        if (p.test(message)) return 'retryable';
    }
    return 'retryable';
}

export interface SelectOptions {
    requiresImageToVideo?: boolean;
    requiresAudio?: boolean;
    maxDurationSec?: number;
}

export function selectCandidates(
    input: VideoGenInput,
    opts: SelectOptions = {},
): VideoProvider[] {
    const all = listEnabledVideoProviders();
    return all.filter(p => {
        if (opts.requiresImageToVideo && !p.capabilities.imageToVideo) return false;
        if (opts.requiresAudio && !p.capabilities.audioNative) return false;
        if (!p.capabilities.aspectRatios.includes(input.aspectRatio)) return false;
        if (input.durationSec > p.capabilities.maxDurationSec) return false;
        if (input.imageUrl && !p.capabilities.imageToVideo) return false;
        return true;
    });
}

export async function runChain(
    input: VideoGenInput,
    config: VideoProviderChainConfig = DEFAULT_CHAIN,
): Promise<ChainResult> {
    const attempts: ProviderAttemptLog[] = [];

    for (const entry of config.chain) {
        const provider = getVideoProvider(entry.providerId);
        if (!provider || !provider.enabled) {
            attempts.push({
                providerId: entry.providerId,
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                status: 'failed',
                error: 'provider not available or disabled',
                errorKind: 'non_retryable',
            });
            continue;
        }

        let lastError: { message: string; kind: ProviderErrorKind } | undefined;

        for (let attempt = 0; attempt < entry.retries; attempt++) {
            const startedAt = new Date().toISOString();
            const startMs = Date.now();
            try {
                const handle = await provider.generate(input);
                const log: ProviderAttemptLog = {
                    providerId: provider.id,
                    startedAt,
                    completedAt: new Date().toISOString(),
                    status: 'processing',
                    durationMs: Date.now() - startMs,
                };
                attempts.push(log);
                return {
                    handle,
                    finalStatus: {
                        externalJobId: handle.externalJobId,
                        state: 'processing',
                    },
                    attempts,
                    failedAll: false,
                };
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'unknown error';
                const kind = classifyError(message);
                lastError = { message, kind };
                attempts.push({
                    providerId: provider.id,
                    startedAt,
                    completedAt: new Date().toISOString(),
                    status: 'failed',
                    error: redact(message),
                    errorKind: kind,
                    durationMs: Date.now() - startMs,
                });
                if (kind === 'non_retryable') {
                    return { attempts, failedAll: true };
                }
            }
        }

        // All retries for this provider exhausted; move to next.
        if (lastError?.kind === 'non_retryable') {
            return { attempts, failedAll: true };
        }
    }

    return { attempts, failedAll: true };
}

function redact(msg: string): string {
    return msg
        .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]')
        .replace(/(Key\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]')
        .replace(/(Token\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]');
}
