/**
 * Storage factory — selects adapter based on `STORAGE_DRIVER`.
 *
 * `STORAGE_DRIVER=local` (default for dev/test) → LocalStorageAdapter
 * `STORAGE_DRIVER=s3`  (production)            → S3StorageAdapter
 *
 * The factory is invoked once per export (cheap to construct) and
 * the resulting adapter is passed to the export runner via
 * `ExportRunnerDeps.storage`.
 *
 * No module-level singleton — keeps the runner fully injectable for
 * tests and avoids hidden state in serverless environments.
 */

import { join } from 'node:path';
import { LocalStorageAdapter } from './local';
import { S3StorageAdapter } from './s3';
import { StorageAdapter, StorageError } from './types';

export type StorageDriver = 'local' | 's3';

export interface GetStorageOptions {
    /** Override the driver (default: process.env.STORAGE_DRIVER or `local`). */
    driver?: string;
    /** Override the local public directory (default: `<cwd>/public/exports`). */
    localDir?: string;
    /** Pre-built adapters (for tests). */
    overrides?: {
        local?: LocalStorageAdapter;
        s3?: S3StorageAdapter;
    };
}

export function getStorage(opts: GetStorageOptions = {}): StorageAdapter {
    const driver = (opts.driver ?? process.env.STORAGE_DRIVER ?? 'local').toLowerCase();

    if (driver === 'local') {
        if (opts.overrides?.local) return opts.overrides.local;
        return new LocalStorageAdapter({
            publicDir: opts.localDir ?? join(process.cwd(), 'public', 'exports'),
            urlPrefix: '/exports',
        });
    }

    if (driver === 's3') {
        if (opts.overrides?.s3) return opts.overrides.s3;
        const bucket = process.env.S3_BUCKET;
        const region = process.env.S3_REGION;
        if (!bucket || !region) {
            throw new StorageError(
                'STORAGE_DRIVER=s3 requires S3_BUCKET and S3_REGION env vars',
            );
        }
        return new S3StorageAdapter({
            bucket,
            region,
            endpoint: process.env.S3_ENDPOINT,
            keyPrefix: process.env.S3_KEY_PREFIX,
            signedUrlTtlSec: parseTtl(process.env.S3_SIGNED_URL_TTL_SEC),
        });
    }

    throw new StorageError(`unknown STORAGE_DRIVER: ${driver}`);
}

function parseTtl(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
}
