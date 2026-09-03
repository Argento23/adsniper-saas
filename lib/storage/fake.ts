/**
 * In-memory StorageAdapter for tests.
 *
 * Captures uploads + records signed URL calls so assertions can
 * verify the export runner's behavior without touching the real
 * filesystem or hitting S3.
 */

import { StorageAdapter, UploadResult } from './types';

export interface FakeStorageAdapter extends StorageAdapter {
    uploads: Array<{ key: string; bodySize: number; contentType?: string }>;
    deletions: string[];
    signedUrls: string[];
    failNextUpload?: string;
    failNextUrl?: string;
}

export interface FakeStorageOptions {
    /** Default URL returned by `urlFor`. Default: `/fake/{key}`. */
    urlTemplate?: (key: string) => string;
}

export function createFakeStorage(opts: FakeStorageOptions = {}): FakeStorageAdapter {
    const urlTemplate = opts.urlTemplate ?? ((key: string) => `/fake/${key}`);
    const uploads: Array<{ key: string; bodySize: number; contentType?: string }> = [];
    const deletions: string[] = [];
    const signedUrls: string[] = [];
    let failNextUpload: string | undefined;
    let failNextUrl: string | undefined;

    const adapter: FakeStorageAdapter = {
        uploads,
        deletions,
        signedUrls,
        get failNextUpload() { return failNextUpload; },
        set failNextUpload(v: string | undefined) { failNextUpload = v; },
        get failNextUrl() { return failNextUrl; },
        set failNextUrl(v: string | undefined) { failNextUrl = v; },

        async upload(key, body, contentType): Promise<UploadResult> {
            if (failNextUpload) {
                const msg = failNextUpload;
                failNextUpload = undefined;
                throw new Error(msg);
            }
            const size = body instanceof Buffer
                ? body.length
                : (body as Uint8Array).byteLength;
            uploads.push({ key, bodySize: size, contentType });
            return { key, url: urlTemplate(key) };
        },

        async urlFor(key): Promise<string> {
            if (failNextUrl) {
                const msg = failNextUrl;
                failNextUrl = undefined;
                throw new Error(msg);
            }
            const url = urlTemplate(key);
            signedUrls.push(url);
            return url;
        },

        async delete(key): Promise<void> {
            deletions.push(key);
        },
    };

    return adapter;
}
