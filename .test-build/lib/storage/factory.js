"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStorage = getStorage;
const node_path_1 = require("node:path");
const local_1 = require("./local");
const s3_1 = require("./s3");
const types_1 = require("./types");
function getStorage(opts = {}) {
    const driver = (opts.driver ?? process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
    if (driver === 'local') {
        if (opts.overrides?.local)
            return opts.overrides.local;
        return new local_1.LocalStorageAdapter({
            publicDir: opts.localDir ?? (0, node_path_1.join)(process.cwd(), 'public', 'exports'),
            urlPrefix: '/exports',
        });
    }
    if (driver === 's3') {
        if (opts.overrides?.s3)
            return opts.overrides.s3;
        const bucket = process.env.S3_BUCKET;
        const region = process.env.S3_REGION;
        if (!bucket || !region) {
            throw new types_1.StorageError('STORAGE_DRIVER=s3 requires S3_BUCKET and S3_REGION env vars');
        }
        return new s3_1.S3StorageAdapter({
            bucket,
            region,
            endpoint: process.env.S3_ENDPOINT,
            keyPrefix: process.env.S3_KEY_PREFIX,
            signedUrlTtlSec: parseTtl(process.env.S3_SIGNED_URL_TTL_SEC),
        });
    }
    throw new types_1.StorageError(`unknown STORAGE_DRIVER: ${driver}`);
}
function parseTtl(raw) {
    if (!raw)
        return undefined;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
}
