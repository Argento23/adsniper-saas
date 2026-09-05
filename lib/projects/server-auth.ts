import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export interface AuthenticatedUser {
    userId: string;
}

/**
 * Server-side auth helper.
 * Returns the authenticated userId or throws if not authenticated.
 * Does NOT check localStorage - client must send required data in body.
 */
export async function getAuthenticatedUserId(): Promise<string> {
    const { userId } = await auth();
    if (!userId) {
        throw new Error('unauthorized');
    }
    return userId;
}

/**
 * Validates that the Clerk userId matches the userId in the provided data.
 * Use this for server-side operations where client sends project/scene data.
 */
export function validateOwnership(authUserId: string, dataUserId: string | undefined): boolean {
    return authUserId === dataUserId;
}

export function createUnauthorizedResponse() {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

export function createForbiddenResponse() {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}

export function createNotFoundResponse(message = 'not found') {
    return NextResponse.json({ error: message }, { status: 404 });
}

export function createBadRequestResponse(message: string) {
    return NextResponse.json({ error: message }, { status: 400 });
}

export function createInternalErrorResponse() {
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
}