import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getJobQueue } from '@/lib/jobs/queue';
import { getVideoProvider } from '@/lib/providers/video';

export const dynamic = 'force-dynamic';

interface RouteContext {
    params: { jobId: string };
}

export async function GET(_request: Request, { params }: RouteContext) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const job = getJobQueue().get(params.jobId);
        if (!job) {
            return NextResponse.json({ error: 'job not found' }, { status: 404 });
        }
        if (job.userId !== userId) {
            return NextResponse.json({ error: 'forbidden' }, { status: 403 });
        }

        // If the job is still processing and we have a provider handle,
        // query the provider's internal state and update the job.
        let providerStatus: { state: string; outputUrl?: string; error?: string } | undefined;
        if (job.status === 'processing' && job.provider) {
            const provider = getVideoProvider(job.provider);
            if (provider) {
                const externalJobId = (job.input as { externalJobId?: string }).externalJobId;
                if (externalJobId) {
                    try {
                        const s = await provider.pollStatus(externalJobId);
                        providerStatus = {
                            state: s.state,
                            outputUrl: s.outputUrl,
                            error: s.error,
                        };
                        if (s.state === 'completed' && s.outputUrl) {
                            getJobQueue().markCompleted(job.id, { outputUrl: s.outputUrl });
                        } else if (s.state === 'failed') {
                            getJobQueue().markFailed(job.id, s.error ?? 'provider reported failure');
                        }
                    } catch {
                        /* provider temporarily unavailable */
                    }
                }
            }
        }

        const updated = getJobQueue().get(job.id);
        return NextResponse.json({
            job: updated,
            providerStatus,
        });
    } catch {
        return NextResponse.json({ error: 'internal error' }, { status: 500 });
    }
}
