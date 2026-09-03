import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
    parseBrief,
    realGroqClientWithFallback,
    validateBrief,
} from '@/lib/creative-director';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
        }

        const v = validateBrief(body);
        if (!v.ok) {
            return NextResponse.json(
                { error: 'invalid brief', validation: v.errors },
                { status: 400 },
            );
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey || apiKey.length < 10) {
            return NextResponse.json(
                { error: 'GROQ_API_KEY not configured' },
                { status: 503 },
            );
        }

        const projectId = typeof (body as { projectId?: unknown }).projectId === 'string'
            ? (body as { projectId: string }).projectId
            : '';

        if (!projectId) {
            return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
        }

        try {
            const result = await parseBrief(v.value, realGroqClientWithFallback(apiKey), projectId);
            return NextResponse.json({
                success: true,
                spec: result.spec,
                sceneDrafts: result.scenes,
            });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'unknown error';
            return NextResponse.json({ error: `creative director failed: ${msg}` }, { status: 502 });
        }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'unknown error';
        return NextResponse.json({ error: `internal error: ${msg}` }, { status: 500 });
    }
}
