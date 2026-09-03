import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getSceneStore } from '@/lib/projects/scenes';
import { requireProject } from '@/lib/projects/access';

export const dynamic = 'force-dynamic';

interface RouteContext {
    params: { projectId: string };
}

export async function POST(request: Request, { params }: RouteContext) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

        const access = requireProject(userId, params.projectId);
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

        let body: { orderedSceneIds?: unknown };
        try {
            body = (await request.json()) as { orderedSceneIds?: unknown };
        } catch {
            return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
        }

        if (!Array.isArray(body.orderedSceneIds)) {
            return NextResponse.json({ error: 'orderedSceneIds must be an array of strings' }, { status: 400 });
        }
        const ids = body.orderedSceneIds.filter((x): x is string => typeof x === 'string');
        const ok = getSceneStore().reorderScenes(params.projectId, ids);
        if (!ok) return NextResponse.json({ error: 'reorder failed (unknown id or length mismatch)' }, { status: 400 });
        return NextResponse.json({ success: true, scenes: getSceneStore().listScenes(params.projectId) });
    } catch {
        return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
}
