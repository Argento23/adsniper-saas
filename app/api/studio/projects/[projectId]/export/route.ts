import { NextResponse } from 'next/server';
import { join } from 'node:path';
import { auth } from '@clerk/nextjs/server';
import { requireProject } from '@/lib/projects/access';
import { getJobQueue } from '@/lib/jobs/queue';
import { getTimelineStore } from '@/lib/projects/timeline-store';
import { getSceneStore } from '@/lib/projects/scenes';
import {
    runExportPreFlight,
    runExport,
    publicUrlForJob,
} from '@/lib/video/export-runner';

export const dynamic = 'force-dynamic';

interface RouteContext {
    params: { projectId: string };
}

/**
 * POST /api/studio/projects/[projectId]/export
 *
 * 1. authenticate user (Clerk)
 * 2. verify project access (requireProject)
 * 3. pre-flight: timeline exists, all clips have sourceUrl
 * 4. enqueue an `export` job (reuse InMemoryJobQueue from lib/jobs/queue)
 * 5. fire-and-forget the runner (it updates the job state)
 * 6. respond with the job id (client polls /api/studio/jobs/[jobId])
 */
export async function POST(_request: Request, { params }: RouteContext) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

        const access = requireProject(userId, params.projectId);
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

        // Pre-flight using the same helpers the runner uses.
        const pre = await runExportPreFlight({
            projectId: params.projectId,
            loadTimeline: (pid) => getTimelineStore().getTimeline(pid),
            loadScenes: (pid) => getSceneStore().listScenes(pid),
        });
        if (!pre.ok) {
            const status = pre.kind === 'no_timeline' || pre.kind === 'no_clips' ? 400 : 422;
            return NextResponse.json({ error: pre.errors.join(' '), kind: pre.kind, errors: pre.errors }, { status });
        }

        const job = getJobQueue().enqueue({
            userId,
            projectId: params.projectId,
            type: 'export',
            input: {
                timelineId: pre.timeline.id,
                clipCount: pre.timeline.clips.length,
                durationSec: pre.timeline.duration,
                aspectRatio: pre.timeline.aspectRatio,
                fps: pre.timeline.fps,
            },
        });

        // Fire and forget — the runner updates the job state.
        const outputDir = join(process.cwd(), 'public', 'exports');
        runExport(job, {
            loadTimeline: (pid) => getTimelineStore().getTimeline(pid),
            loadScenes: (pid) => getSceneStore().listScenes(pid),
            markProcessing: (jobId) => { getJobQueue().markProcessing(jobId); },
            markCompleted: (jobId, output) => {
                getJobQueue().markCompleted(jobId, {
                    outputUrl: output.outputUrl ?? publicUrlForJob(jobId),
                    outputAssetId: output.outputAssetId,
                });
            },
            markFailed: (jobId, error) => { getJobQueue().markFailed(jobId, error); },
            resolveOutputDir: () => outputDir,
        }).catch((e) => {
            // Defensive: should never reach here because runExport
            // catches its own errors and calls markFailed.
            try { getJobQueue().markFailed(job.id, e instanceof Error ? e.message : 'unknown error'); } catch { /* ignore */ }
        });

        return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
    } catch {
        return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
}

/**
 * GET — list the most recent export jobs for this project. Useful for
 * the UI to show "last export: ..." without polling each jobId.
 */
export async function GET(_request: Request, { params }: RouteContext) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

        const access = requireProject(userId, params.projectId);
        if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

        const jobs = getJobQueue()
            .listByUser(userId)
            .filter(j => j.type === 'export' && j.projectId === params.projectId);
        return NextResponse.json({ jobs });
    } catch {
        return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
}
