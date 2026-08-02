import { clerkClient } from '@clerk/nextjs/server';

/**
 * Safely gets user from Clerk regardless of whether clerkClient is an async function or an object.
 */
export async function getClerkUser(userId: string): Promise<any> {
    try {
        if (typeof clerkClient === 'function') {
            const client = await (clerkClient as any)();
            if (client && client.users) {
                return await client.users.getUser(userId);
            }
        }
    } catch (e) {
        console.warn('[Clerk Helper] clerkClient() function call failed, trying object access:', e);
    }

    try {
        if (clerkClient && (clerkClient as any).users) {
            return await (clerkClient as any).users.getUser(userId);
        }
    } catch (e) {
        console.error('[Clerk Helper] Failed to fetch user from Clerk:', e);
    }

    return null;
}

/**
 * Safely updates user metadata in Clerk.
 */
export async function updateClerkMetadata(userId: string, metadata: any): Promise<boolean> {
    try {
        if (typeof clerkClient === 'function') {
            const client = await (clerkClient as any)();
            if (client && client.users) {
                await client.users.updateUserMetadata(userId, metadata);
                return true;
            }
        }
    } catch (e) {
        console.warn('[Clerk Helper] clerkClient() function update failed, trying object access:', e);
    }

    try {
        if (clerkClient && (clerkClient as any).users) {
            await (clerkClient as any).users.updateUserMetadata(userId, metadata);
            return true;
        }
    } catch (e) {
        console.error('[Clerk Helper] Failed to update user metadata in Clerk:', e);
    }

    return false;
}
