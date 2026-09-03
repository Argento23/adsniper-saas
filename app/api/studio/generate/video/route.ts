import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getClerkUser } from '@/lib/clerkHelper';
import {
    VideoGenInput,
    VideoProviderChainConfig,
} from '@/lib/providers/types';
import { runChain } from '@/lib/providers/video/chain';
import { getVideoProvider } from '@/lib/providers/video';
import { getJobQueue } from '@/lib/jobs/queue';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'gustavodornhofer@gmail.com';

interface RawRequestBody {
    prompt?: unknown;
    imageUrl?: unknown;
    aspectRatio?: unknown;
    durationSec?: unknown;
    resolution?: unknown;
    seed?: unknown;
    chain?: unknown;
    projectId?: unknown;
    sceneId?: unknown;
    requiresImageToVideo?: unknown;
    requiresAudio?: unknown;
}

interface ValidationResult {
    ok: boolean;
    value?: VideoGenInput & { projectId?: string; sceneId?: string };
    error?: string;
}

function validate(body: RawRequestBody): ValidationResult {
    if (typeof body.prompt !== 'string' || body.prompt.trim().length === 0) {
        return { ok: false, error: 'prompt is required' };
    }
    const aspect = body.aspectRatio;
    if (aspect !== '9:16' && aspect !== '1:1' && aspect !== '16:9' && aspect !== '4:5') {
        return { ok: false, error: 'aspectRatio must be one of 9:16 | 1:1 | 16:9 | 4:5' };
    }
    const dur = typeof body.durationSec === 'number' ? body.durationSec : NaN;
    if (!Number.isFinite(dur) || dur < 1 || dur > 60) {
        return { ok: false, error: 'durationSec must be a number between 1 and 60' };
    }
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl : undefined;
    if (!imageUrl) {
        return { ok: false, error: 'imageUrl is required (image-to-video)' };
    }

    const value: VideoGenInput & { projectId?: string; sceneId?: string } = {
        prompt: body.prompt.trim(),
        imageUrl,
        aspectRatio: aspect,
        durationSec: dur,
    };
    if (typeof body.resolution === 'string') value.resolution = body.resolution;
    if (typeof body.seed === 'number') value.seed = body.seed;
    if (typeof body.projectId === 'string') value.projectId = body.projectId;
    if (typeof body.sceneId === 'string') value.sceneId = body.sceneId;
    return { ok: true, value };
}

function parseChain(raw: unknown): VideoProviderChainConfig | undefined {
    if (!Array.isArray(raw)) return undefined;
    const out: VideoProviderChainConfig = { chain: [] };
    for (const item of raw) {
        if (
            item &&
            typeof item === 'object' &&
            'providerId' in item &&
            typeof (item as { providerId: unknown }).providerId === 'string'
        ) {
            const providerId = (item as { providerId: string }).providerId;
            if (!getVideoProvider(providerId)) continue;
            const retriesRaw = (item as { retries?: unknown }).retries;
            const retries = typeof retriesRaw === 'number' && retriesRaw >= 1 && retriesRaw <= 3
                ? Math.floor(retriesRaw)
                : 1;
            out.chain.push({ providerId, retries });
        }
    }
    return out.chain.length > 0 ? out : undefined;
}

export async function POST(request: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let body: RawRequestBody;
        try {
            body = (await request.json()) as RawRequestBody;
        } catch {
            return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
        }

        const v = validate(body);
        if (!v.ok || !v.value) {
            return NextResponse.json({ error: v.error ?? 'invalid input' }, { status: 400 });
        }
        const input = v.value;

        // Admin gate: for now we mirror the existing pattern of the
        // codebase while the role/permission migration is pending.
        let isAdmin = false;
        try {
            const user = await getClerkUser(userId);
            const emails = user?.emailAddresses?.map((e: any) => e.emailAddress.toLowerCase().trim()) ?? [];
            isAdmin = emails.includes(ADMIN_EMAIL);
        } catch {
            /* ignore — fall back to non-admin */
        }

        // Placeholder for future credit check (does NOT touch the
        // existing credits API; only reads metadata).
        if (!isAdmin) {
            // Intentionally a no-op for now: the legacy `credits` field in
            // Clerk publicMetadata is the source of truth, but the Studio
            // video flow will get its own meter in a later phase.
        }

        const chain = parseChain(body.chain);

        const result = await runChain(
            {
                prompt: input.prompt,
                imageUrl: input.imageUrl,
                aspectRatio: input.aspectRatio,
                durationSec: input.durationSec,
                resolution: input.resolution,
                seed: input.seed,
            },
            chain,
        );

        if (!result.handle) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'All video providers failed',
                    attempts: result.attempts.map(a => ({
                        providerId: a.providerId,
                        status: a.status,
                        errorKind: a.errorKind,
                        error: a.error,
                        durationMs: a.durationMs,
                    })),
                },
                { status: 502 },
            );
        }

        const job = getJobQueue().enqueue({
            userId,
            projectId: input.projectId,
            sceneId: input.sceneId,
            type: 'video',
            provider: result.handle.providerId,
            input: {
                prompt: input.prompt,
                imageUrl: input.imageUrl,
                aspectRatio: input.aspectRatio,
                durationSec: input.durationSec,
                resolution: input.resolution,
                seed: input.seed,
            },
            estimatedCostUsd: result.handle.estimatedCostUsd,
        });

        return NextResponse.json({
            success: true,
            provider: result.handle.providerId,
            externalJobId: result.handle.externalJobId,
            job: {
                id: job.id,
                status: job.status,
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'unknown error';
        console.error('[studio/generate/video] error:', redact(message));
        return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
}

function redact(msg: string): string {
    return msg
        .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]')
        .replace(/(Key\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]')
        .replace(/(Token\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]');
}
