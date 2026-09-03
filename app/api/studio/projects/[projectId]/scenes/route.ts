import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSceneStore, CreateSceneInput } from '@/lib/projects/scenes';
import { requireProject } from '@/lib/projects/access';
import { AspectRatio, TransitionType } from '@/lib/projects/types';

export const dynamic = 'force-dynamic';

interface RouteContext {
    params: { projectId: string };
}

const VALID_ASPECTS: AspectRatio[] = ['9:16', '1:1', '16:9', '4:5'];
const VALID_TRANSITIONS: TransitionType[] = ['cut', 'fade', 'dissolve'];

interface RawCreateBody {
    title?: unknown;
    description?: unknown;
    prompt?: unknown;
    visualPrompt?: unknown;
    negativePrompt?: unknown;
    camera?: unknown;
    voiceover?: unknown;
    onScreenText?: unknown;
    durationSec?: unknown;
    aspectRatio?: unknown;
    transitionIn?: unknown;
    order?: unknown;
}

function validate(body: RawCreateBody): { ok: true; value: CreateSceneInput } | { ok: false; error: string } {
    if (typeof body.visualPrompt !== 'string' || body.visualPrompt.trim().length === 0) {
        return { ok: false, error: 'visualPrompt is required' };
    }
    const dur = typeof body.durationSec === 'number' ? body.durationSec : NaN;
    if (!Number.isFinite(dur) || dur < 1 || dur > 60) {
        return { ok: false, error: 'durationSec must be a number between 1 and 60' };
    }
    const aspect = body.aspectRatio;
    if (aspect !== undefined && !VALID_ASPECTS.includes(aspect as AspectRatio)) {
        return { ok: false, error: 'aspectRatio invalid' };
    }
    const transition = body.transitionIn;
    if (transition !== undefined && !VALID_TRANSITIONS.includes(transition as TransitionType)) {
        return { ok: false, error: 'transitionIn invalid' };
    }

    const value: CreateSceneInput = {
        projectId: '', // assigned below
        order: typeof body.order === 'number' ? Math.floor(body.order) : 0,
        visualPrompt: body.visualPrompt.trim(),
        durationSec: Math.floor(dur),
    };
    if (typeof body.title === 'string') value.title = body.title.trim();
    if (typeof body.description === 'string') value.description = body.description.trim();
    if (typeof body.prompt === 'string') value.prompt = body.prompt.trim();
    if (typeof body.negativePrompt === 'string') value.negativePrompt = body.negativePrompt.trim();
    if (typeof body.camera === 'string') value.camera = body.camera.trim();
    if (typeof body.voiceover === 'string') value.voiceover = body.voiceover.trim();
    if (typeof body.onScreenText === 'string') value.onScreenText = body.onScreenText.trim();
    if (typeof aspect === 'string') value.aspectRatio = aspect as AspectRatio;
    if (typeof transition === 'string') value.transitionIn = transition as TransitionType;
    return { ok: true, value };
}

export async function GET(_request: Request, { params }: RouteContext) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

        const access = requireProject(userId, params.projectId);
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

        const scenes = getSceneStore().listScenes(params.projectId);
        return NextResponse.json({ scenes });
    } catch {
        return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
}

export async function POST(request: Request, { params }: RouteContext) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

        const access = requireProject(userId, params.projectId);
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

        let body: RawCreateBody;
        try {
            body = (await request.json()) as RawCreateBody;
        } catch {
            return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
        }

        const v = validate(body);
        if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

        // Auto-assign order to the end if not provided.
        const existing = getSceneStore().listScenes(params.projectId);
        const input: CreateSceneInput = {
            ...v.value,
            projectId: params.projectId,
            order: typeof body.order === 'number' ? v.value.order : existing.length,
        };

        const scene = getSceneStore().createScene(input);
        return NextResponse.json({ scene }, { status: 201 });
    } catch {
        return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
}
