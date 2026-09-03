/**
 * Image Provider Engine.
 *
 * Reuses the existing image generators in `lib/fal.ts` and
 * `lib/replicate.ts` without modifying them. The current Scene flow
 * only needs text-to-image for keyframes; image-to-image / IP-Adapter
 * is reserved for future continuity features.
 *
 * Strategy: deterministic preference order. The first enabled provider
 * is used; failures fall back to the next. There is NO infinite cascade:
 * a single failure short-circuits the chain so we do not burn credits.
 *
 * Each provider returns `{ imageUrl, seed? }` matching the
 * `ImageGenOutput` contract in `lib/providers/types.ts`.
 */

import { generateFalImage } from '@/lib/fal';
import { generateReplicateFluxDev, generateReplicateImage } from '@/lib/replicate';
import { ImageGenInput, ImageGenOutput } from '../types';

export interface ImageGenFailure {
    providerId: string;
    error: string;
}

export interface ImageGenResult {
    output?: ImageGenOutput;
    providerId?: string;
    attempts: { providerId: string; ok: boolean; error?: string }[];
}

function aspectToFalSize(
    ratio: '9:16' | '1:1' | '16:9' | '4:5' | undefined,
): 'square_hd' | 'portrait_4_3' | 'landscape_4_3' | 'square' {
    if (ratio === '9:16' || ratio === '4:5') return 'portrait_4_3';
    if (ratio === '16:9') return 'landscape_4_3';
    return 'square_hd';
}

function aspectToReplicateSize(
    ratio: '9:16' | '1:1' | '16:9' | '4:5' | undefined,
): { width: number; height: number } {
    if (ratio === '9:16') return { width: 768, height: 1360 };
    if (ratio === '16:9') return { width: 1360, height: 768 };
    if (ratio === '4:5') return { width: 1024, height: 1280 };
    return { width: 1024, height: 1024 };
}

function isFalConfigured(): boolean {
    return !!(process.env.FAL_KEY || process.env.FAL_API_KEY);
}

function isReplicateConfigured(): boolean {
    return !!(process.env.REPLICATE_API_KEY || process.env.REPLICATE_API_TOKEN);
}

export async function generateKeyframe(input: ImageGenInput): Promise<ImageGenResult> {
    const attempts: ImageGenResult['attempts'] = [];
    const aspect = input.width && input.height ? guessAspect(input.width, input.height) : undefined;

    if (isFalConfigured()) {
        try {
            const r = await generateFalImage(input.prompt, aspectToFalSize(aspect));
            attempts.push({ providerId: 'fal-flux-dev', ok: true });
            return {
                output: { imageUrl: r.imageUrl, seed: r.seed },
                providerId: 'fal-flux-dev',
                attempts,
            };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'unknown error';
            attempts.push({ providerId: 'fal-flux-dev', ok: false, error: redact(msg) });
        }
    } else {
        attempts.push({ providerId: 'fal-flux-dev', ok: false, error: 'FAL_KEY not configured' });
    }

    if (isReplicateConfigured()) {
        try {
            const dims = aspectToReplicateSize(aspect);
            const r = await generateReplicateFluxDev(input.prompt, dims.width, dims.height);
            attempts.push({ providerId: 'replicate-flux-dev', ok: true });
            return {
                output: { imageUrl: r.imageUrl, seed: undefined },
                providerId: 'replicate-flux-dev',
                attempts,
            };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'unknown error';
            attempts.push({ providerId: 'replicate-flux-dev', ok: false, error: redact(msg) });
        }
    } else {
        attempts.push({ providerId: 'replicate-flux-dev', ok: false, error: 'REPLICATE_API_KEY not configured' });
    }

    // Last-resort: Replicate schnell (cheapest). Do NOT pollute further; if
    // this also fails, we surface the failure to the API and stop.
    if (isReplicateConfigured()) {
        try {
            const dims = aspectToReplicateSize(aspect);
            const r = await generateReplicateImage(input.prompt, dims.width, dims.height);
            attempts.push({ providerId: 'replicate-flux-schnell', ok: true });
            return {
                output: { imageUrl: r.imageUrl, seed: undefined },
                providerId: 'replicate-flux-schnell',
                attempts,
            };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'unknown error';
            attempts.push({ providerId: 'replicate-flux-schnell', ok: false, error: redact(msg) });
        }
    }

    return { attempts };
}

function guessAspect(w: number, h: number): '9:16' | '1:1' | '16:9' | '4:5' {
    const r = w / h;
    if (r < 0.7) return '9:16';
    if (r > 1.6) return '16:9';
    if (r < 0.95) return '4:5';
    return '1:1';
}

function redact(msg: string): string {
    return msg
        .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]')
        .replace(/(Key\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]')
        .replace(/(Token\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]');
}
