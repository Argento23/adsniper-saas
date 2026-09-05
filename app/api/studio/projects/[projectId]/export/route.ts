import { NextResponse } from 'next/server';
import { join } from 'node:path';
import { auth } from '@clerk/nextjs/server';
import { getJobQueue } from '@/lib/jobs/queue';
import {
    runExportPreFlight,
    runExport,
} from '@/lib/video/export-runner';
import { getStorage } from '@/lib/storage';
import { getAuthenticatedUserId, validateOwnership, createUnauthorizedResponse, createForbiddenResponse, createBadRequestResponse, createInternalErrorResponse } from '@/lib/projects/server-auth';
import { Timeline } from '@/lib/projects/timeline';
import { Scene } from '@/lib/projects/types';

export const dynamic = 'force-dynamic';

interface RouteContext {
    params: { projectId: string };
}

interface ExportPreFlightInput {
    project: {
        id: string;
        userId: string;
        name: string;
        format: string;
    };
    timeline: Timeline;
    scenes: Scene[];
}

/**
 * POST /api/studio/projects/[projectId]/export
 *
 * 1. authenticate user (Clerk)
 * 2. receive project, timeline, scenes from client (client reads from localStorage)
 * 3. validate ownership (Clerk userId matches project.userId)
 * 4. pre-flight: timeline exists, all clips have sourceUrl
 * 5. enqueue an `export` job
 * 6. fire-and-forget the runner
 * 7. respond with the job id (client polls /api/studio/jobs/[jobId])
 */
export async function POST(request: Request, { params }: RouteContext) {
    try {
        const authUserId = await getAuthenticatedUserId();

        let body: ExportPreFlightInput;
        try {
            body = await request.json();
        } catch {
            return createBadRequestResponse('invalid JSON');
        }

        const { project, timeline, scenes } = body;

        if (!project || !timeline || !scenes) {
            return createBadRequestResponse('project, timeline, and scenes are required');
        }

        // Validate ownership: Clerk userId must match project.userId
        if (!validateOwnership(authUserId, project.userId)) {
            return createForbiddenResponse();
        }

        // Verify projectId matches
        if (project.id !== params.projectId) {
            return createBadRequestResponse('projectId mismatch');
        }

        // Pre-flight using the provided data (no localStorage access)
        const pre = await runExportPreFlight({
            projectId: params.projectId,
            loadTimeline: () => timeline,
            loadScenes: () => scenes,
        });
        if (!pre.ok) {
            const status = pre.kind === 'no_timeline' || pre.kind === 'no_clips' ? 400 : 422;
            return NextResponse.json({ error: pre.errors.join(' '), kind: pre.kind, errors: pre.errors }, { status });
        }

        const job = await getJobQueue().enqueue({
            userId: authUserId,
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

        const storage = getStorage();
        runExport(job, {
            loadTimeline: () => timeline,
            loadScenes: () => scenes,
            markProcessing: (jobId) => { void getJobQueue().markProcessing(jobId); },
            markCompleted: (jobId, output) => {
                void getJobQueue().markCompleted(jobId, {
                    outputUrl: output.outputUrl,
                    outputAssetId: output.outputAssetId,
                });
            },
            markFailed: (jobId, error) => { void getJobQueue().markFailed(jobId, error); },
            storage,
            resolveWorkDir: (jobId) => join(process.cwd(), 'public', 'exports', `${jobId}_work`),
        }).catch((e) => {
            try { void getJobQueue().markFailed(job.id, e instanceof Error ? e.message : 'unknown error'); } catch { /* ignore */ }
        });

        return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
    } catch (e) {
        if (e instanceof Error && e.message === 'unauthorized') {
            return createUnauthorizedResponse();
        }
        return createInternalErrorResponse();
    }
}

/**
 * GET — list the most recent export jobs for this project.
 * Client sends project.userId in query params for ownership validation.
 */
export async function GET(request: Request, { params }: RouteContext) {
    try {
        const authUserId = await getAuthenticatedUserId();
        const { searchParams } = new URL(request.url);
        const projectUserId = searchParams.get('projectUserId');

        if (!projectUserId || !validateOwnership(authUserId, projectUserId)) {
            return createForbiddenResponse();
        }

        const allUserJobs = await getJobQueue().listByUser(authUserId);
        const jobs = allUserJobs.filter(j => j.type === 'export' && j.projectId === params.projectId);
        return NextResponse.json({ jobs });
    } catch (e) {
        if (e instanceof Error && e.message === 'unauthorized') {
            return createUnauthorizedResponse();
        }
        return createInternalErrorResponse();
    }
}