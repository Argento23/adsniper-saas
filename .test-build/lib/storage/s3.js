"use strict";
/**
 * S3 / R2 storage adapter — production.
 *
 * Works with AWS S3 and any S3-compatible service (Cloudflare R2,
 * Backblaze B2, MinIO). Objects are stored private; `urlFor` returns
 * a presigned URL with a configurable TTL (default 1 hour).
 *
 * Required env:
 *   - `S3_BUCKET`            bucket name
 *   - `S3_REGION`            region (e.g. `us-east-1`, `auto` for R2)
 *
 * Optional env:
 *   - `S3_ENDPOINT`          custom endpoint (R2: `https://<account>.r2.cloudflarestorage.com`)
 *   - `S3_ACCESS_KEY_ID`     explicit credentials (else uses default credential chain)
 *   - `S3_SECRET_ACCESS_KEY` explicit credentials
 *   - `S3_KEY_PREFIX`        key prefix (default: `exports`)
 *   - `S3_SIGNED_URL_TTL_SEC` TTL for presigned URLs (default: 3600)
 *
 * For tests, `createS3Adapter` accepts an injected `s3Client` and
 * `signer`, so no AWS calls happen.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3StorageAdapter = void 0;
const types_1 = require("./types");
class S3StorageAdapter {
    bucket;
    keyPrefix;
    ttlSec;
    s3Client;
    signer;
    constructor(opts) {
        if (!opts.bucket)
            throw new types_1.StorageError('S3StorageAdapter: bucket is required');
        if (!opts.region)
            throw new types_1.StorageError('S3StorageAdapter: region is required');
        this.bucket = opts.bucket;
        this.keyPrefix = (opts.keyPrefix ?? 'exports').replace(/^\/+|\/+$/g, '');
        this.ttlSec = opts.signedUrlTtlSec ?? 3600;
        this.s3Client = opts.s3Client ?? createDefaultClient(opts);
        this.signer = opts.signer ?? defaultSigner();
    }
    async upload(key, body, contentType) {
        const fullKey = this.fullKey(key);
        try {
            await this.s3Client.send({
                Bucket: this.bucket,
                Key: fullKey,
                Body: body,
                ContentType: contentType ?? 'application/octet-stream',
            });
        }
        catch (e) {
            throw new types_1.StorageError(`failed to upload ${fullKey}`, e);
        }
        const url = await this.urlFor(key);
        return { key: fullKey, url };
    }
    async urlFor(key) {
        const fullKey = this.fullKey(key);
        try {
            return await this.signer(this.s3Client, { Bucket: this.bucket, Key: fullKey }, { expiresIn: this.ttlSec });
        }
        catch (e) {
            throw new types_1.StorageError(`failed to sign url for ${fullKey}`, e);
        }
    }
    async delete(key) {
        const fullKey = this.fullKey(key);
        try {
            await this.s3Client.send({ Bucket: this.bucket, Key: fullKey });
        }
        catch (e) {
            throw new types_1.StorageError(`failed to delete ${fullKey}`, e);
        }
    }
    /** Combines `keyPrefix` + `key`, stripping leading/trailing slashes. */
    fullKey(key) {
        if (!key)
            throw new types_1.StorageError('key must be non-empty');
        const cleanKey = key.replace(/^\/+/, '');
        return this.keyPrefix ? `${this.keyPrefix}/${cleanKey}` : cleanKey;
    }
}
exports.S3StorageAdapter = S3StorageAdapter;
function createDefaultClient(opts) {
    // Lazy-require so tests + browser bundles don't pull AWS SDK.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { S3Client } = require('@aws-sdk/client-s3');
    const clientOpts = { region: opts.region };
    if (opts.endpoint)
        clientOpts.endpoint = opts.endpoint;
    if (opts.bucket && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) {
        clientOpts.credentials = {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        };
    }
    return new S3Client(clientOpts);
}
function defaultSigner() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
    return ((client, command, opts) => 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSignedUrl(client, command, opts));
}
