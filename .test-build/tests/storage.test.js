"use strict";
/**
 * Unit tests for lib/storage — Production storage layer.
 *
 * Coverage:
 *   - LocalStorageAdapter: upload/urlFor/delete, in-memory fs injection,
 *     ENOENT on delete is no-op, publicDir creation
 *   - S3StorageAdapter: fullKey composition, upload/urlFor/delete via
 *     injected s3Client + signer, error wrapping
 *   - Factory: defaults, overrides, env selection, missing env error
 *   - FakeStorageAdapter: upload/urlFor/delete records, failNext* hooks
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const harness_1 = require("./harness");
const local_1 = require("../lib/storage/local");
const s3_1 = require("../lib/storage/s3");
const fake_1 = require("../lib/storage/fake");
const factory_1 = require("../lib/storage/factory");
const types_1 = require("../lib/storage/types");
// ── helpers ──────────────────────────────────────────────────────────────
function mkInMemoryFs() {
    const files = {};
    return {
        files,
        writeFile: async (path, data) => { files[path] = new Uint8Array(data); },
        unlink: async (path) => {
            if (!(path in files)) {
                const e = new Error('ENOENT');
                e.code = 'ENOENT';
                throw e;
            }
            delete files[path];
        },
        mkdir: async () => { },
        access: async (path) => {
            if (!(path in files))
                throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        },
    };
}
// ── LocalStorageAdapter ──────────────────────────────────────────────────
(0, harness_1.test)('local: upload writes file under publicDir and returns /exports/{key}', async () => {
    const fs = mkInMemoryFs();
    const adapter = new local_1.LocalStorageAdapter({ publicDir: '/tmp/test-exports', fs });
    const result = await adapter.upload('abc.mp4', new Uint8Array([1, 2, 3]), 'video/mp4');
    strict_1.default.equal(result.key, 'abc.mp4');
    strict_1.default.equal(result.url, '/exports/abc.mp4');
    strict_1.default.deepEqual(Array.from(fs.files['/tmp/test-exports/abc.mp4']), [1, 2, 3]);
});
(0, harness_1.test)('local: urlFor returns /exports/{key}', async () => {
    const adapter = new local_1.LocalStorageAdapter({ publicDir: '/x', fs: mkInMemoryFs() });
    strict_1.default.equal(await adapter.urlFor('foo.mp4'), '/exports/foo.mp4');
});
(0, harness_1.test)('local: urlForSync returns the same value synchronously', () => {
    const adapter = new local_1.LocalStorageAdapter({ publicDir: '/x', fs: mkInMemoryFs() });
    strict_1.default.equal(adapter.urlForSync('bar.mp4'), '/exports/bar.mp4');
});
(0, harness_1.test)('local: delete removes existing file', async () => {
    const fs = mkInMemoryFs();
    const adapter = new local_1.LocalStorageAdapter({ publicDir: '/x', fs });
    await adapter.upload('x.mp4', new Uint8Array([1]));
    strict_1.default.ok(fs.files['/x/x.mp4']);
    await adapter.delete('x.mp4');
    strict_1.default.equal(fs.files['/x/x.mp4'], undefined);
});
(0, harness_1.test)('local: delete on missing file is a no-op (ENOENT swallowed)', async () => {
    const fs = mkInMemoryFs();
    const adapter = new local_1.LocalStorageAdapter({ publicDir: '/x', fs });
    await adapter.delete('missing.mp4'); // should not throw
});
(0, harness_1.test)('local: delete wraps non-ENOENT errors in StorageError', async () => {
    const adapter = new local_1.LocalStorageAdapter({
        publicDir: '/x',
        fs: {
            ...mkInMemoryFs(),
            unlink: async () => { throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); },
        },
    });
    await strict_1.default.rejects(() => adapter.delete('x.mp4'), (e) => e instanceof types_1.StorageError && e.message.includes('failed to delete'));
});
(0, harness_1.test)('local: custom urlPrefix is honored', async () => {
    const adapter = new local_1.LocalStorageAdapter({ publicDir: '/x', urlPrefix: '/cdn/videos', fs: mkInMemoryFs() });
    strict_1.default.equal(adapter.urlForSync('a.mp4'), '/cdn/videos/a.mp4');
});
(0, harness_1.test)('local: pathFor returns absolute path joined with key', () => {
    const adapter = new local_1.LocalStorageAdapter({ publicDir: '/var/data', fs: mkInMemoryFs() });
    strict_1.default.equal(adapter.pathFor('x.mp4'), '/var/data/x.mp4');
});
// ── S3StorageAdapter ─────────────────────────────────────────────────────
function mkFakeS3Client() {
    const calls = [];
    return {
        calls,
        async send(command) {
            const cmd = command;
            const op = cmd.constructor?.name ?? 'Unknown';
            calls.push({ op, Bucket: cmd.Bucket, Key: cmd.Key, Body: cmd.Body, ContentType: cmd.ContentType });
            return { ok: true };
        },
    };
}
const mkFakeSigner = () => {
    const calls = [];
    const signer = ((client, command, opts) => {
        const cmd = command;
        calls.push({ key: cmd.Key, ttl: opts.expiresIn });
        return Promise.resolve(`https://signed.example.com/${cmd.Key}?ttl=${opts.expiresIn}`);
    });
    signer.calls = calls;
    return signer;
};
(0, harness_1.test)('s3: fullKey combines prefix and key, strips slashes', () => {
    const adapter = new s3_1.S3StorageAdapter({
        bucket: 'b',
        region: 'r',
        s3Client: mkFakeS3Client(),
        signer: mkFakeSigner(),
    });
    strict_1.default.equal(adapter.fullKey('foo.mp4'), 'exports/foo.mp4');
    strict_1.default.equal(adapter.fullKey('/foo.mp4'), 'exports/foo.mp4');
    strict_1.default.equal(adapter.fullKey('foo.mp4/'), 'exports/foo.mp4/'); // trailing slash kept
});
(0, harness_1.test)('s3: fullKey throws on empty key', () => {
    const adapter = new s3_1.S3StorageAdapter({
        bucket: 'b',
        region: 'r',
        s3Client: mkFakeS3Client(),
        signer: mkFakeSigner(),
    });
    strict_1.default.throws(() => adapter.fullKey(''), /key must be non-empty/);
});
(0, harness_1.test)('s3: fullKey with empty prefix returns bare key', () => {
    const adapter = new s3_1.S3StorageAdapter({
        bucket: 'b',
        region: 'r',
        keyPrefix: '',
        s3Client: mkFakeS3Client(),
        signer: mkFakeSigner(),
    });
    strict_1.default.equal(adapter.fullKey('foo.mp4'), 'foo.mp4');
});
(0, harness_1.test)('s3: upload sends PutObjectCommand and returns signed URL', async () => {
    const client = mkFakeS3Client();
    const signer = mkFakeSigner();
    const adapter = new s3_1.S3StorageAdapter({
        bucket: 'my-bucket',
        region: 'us-east-1',
        s3Client: client,
        signer,
    });
    const body = new Uint8Array([10, 20, 30]);
    const result = await adapter.upload('clip.mp4', body, 'video/mp4');
    strict_1.default.equal(result.key, 'exports/clip.mp4');
    strict_1.default.equal(result.url, 'https://signed.example.com/exports/clip.mp4?ttl=3600');
    strict_1.default.equal(client.calls.length, 1);
    strict_1.default.equal(client.calls[0].Bucket, 'my-bucket');
    strict_1.default.equal(client.calls[0].Key, 'exports/clip.mp4');
    strict_1.default.equal(client.calls[0].ContentType, 'video/mp4');
    strict_1.default.equal(signer.calls.length, 1);
    strict_1.default.equal(signer.calls[0].ttl, 3600);
});
(0, harness_1.test)('s3: urlFor returns presigned URL with configured TTL', async () => {
    const client = mkFakeS3Client();
    const signer = mkFakeSigner();
    const adapter = new s3_1.S3StorageAdapter({
        bucket: 'b',
        region: 'r',
        signedUrlTtlSec: 7200,
        s3Client: client,
        signer,
    });
    const url = await adapter.urlFor('clip.mp4');
    strict_1.default.equal(url, 'https://signed.example.com/exports/clip.mp4?ttl=7200');
});
(0, harness_1.test)('s3: upload wraps client errors in StorageError', async () => {
    const adapter = new s3_1.S3StorageAdapter({
        bucket: 'b',
        region: 'r',
        s3Client: {
            async send() { throw new Error('NetworkError'); },
        },
        signer: mkFakeSigner(),
    });
    await strict_1.default.rejects(() => adapter.upload('x.mp4', Buffer.from('data')), (e) => e instanceof types_1.StorageError && e.message.includes('failed to upload'));
});
(0, harness_1.test)('s3: delete wraps client errors in StorageError', async () => {
    const adapter = new s3_1.S3StorageAdapter({
        bucket: 'b',
        region: 'r',
        s3Client: {
            async send() { throw new Error('Forbidden'); },
        },
        signer: mkFakeSigner(),
    });
    await strict_1.default.rejects(() => adapter.delete('x.mp4'), (e) => e instanceof types_1.StorageError && e.message.includes('failed to delete'));
});
(0, harness_1.test)('s3: constructor requires bucket and region', () => {
    strict_1.default.throws(() => new s3_1.S3StorageAdapter({ bucket: '', region: 'r', s3Client: mkFakeS3Client(), signer: mkFakeSigner() }), (e) => e instanceof types_1.StorageError);
    strict_1.default.throws(() => new s3_1.S3StorageAdapter({ bucket: 'b', region: '', s3Client: mkFakeS3Client(), signer: mkFakeSigner() }), (e) => e instanceof types_1.StorageError);
});
// ── Factory ──────────────────────────────────────────────────────────────
(0, harness_1.test)('factory: defaults to local driver when STORAGE_DRIVER unset', () => {
    const savedDriver = process.env.STORAGE_DRIVER;
    delete process.env.STORAGE_DRIVER;
    try {
        const adapter = (0, factory_1.getStorage)({ localDir: '/custom/path', overrides: { local: undefined, s3: undefined } });
        strict_1.default.ok(adapter instanceof local_1.LocalStorageAdapter);
        strict_1.default.equal(adapter.urlForSync('x.mp4'), '/exports/x.mp4');
        strict_1.default.equal(adapter.pathFor('x.mp4'), '/custom/path/x.mp4');
    }
    finally {
        if (savedDriver !== undefined)
            process.env.STORAGE_DRIVER = savedDriver;
    }
});
(0, harness_1.test)('factory: explicit driver=local uses LocalStorageAdapter', () => {
    const adapter = (0, factory_1.getStorage)({ driver: 'local', localDir: '/x' });
    strict_1.default.ok(adapter instanceof local_1.LocalStorageAdapter);
});
(0, harness_1.test)('factory: STORAGE_DRIVER=s3 requires S3_BUCKET and S3_REGION', () => {
    const savedDriver = process.env.STORAGE_DRIVER;
    const savedBucket = process.env.S3_BUCKET;
    const savedRegion = process.env.S3_REGION;
    process.env.STORAGE_DRIVER = 's3';
    delete process.env.S3_BUCKET;
    delete process.env.S3_REGION;
    try {
        strict_1.default.throws(() => (0, factory_1.getStorage)(), (e) => e instanceof types_1.StorageError && e.message.includes('S3_BUCKET'));
    }
    finally {
        if (savedDriver !== undefined)
            process.env.STORAGE_DRIVER = savedDriver;
        else
            delete process.env.STORAGE_DRIVER;
        if (savedBucket !== undefined)
            process.env.S3_BUCKET = savedBucket;
        if (savedRegion !== undefined)
            process.env.S3_REGION = savedRegion;
    }
});
(0, harness_1.test)('factory: STORAGE_DRIVER=s3 with full env returns S3StorageAdapter', () => {
    const savedDriver = process.env.STORAGE_DRIVER;
    const savedBucket = process.env.S3_BUCKET;
    const savedRegion = process.env.S3_REGION;
    process.env.STORAGE_DRIVER = 's3';
    process.env.S3_BUCKET = 'b';
    process.env.S3_REGION = 'us-east-1';
    try {
        const adapter = (0, factory_1.getStorage)();
        strict_1.default.ok(adapter instanceof s3_1.S3StorageAdapter);
    }
    finally {
        if (savedDriver !== undefined)
            process.env.STORAGE_DRIVER = savedDriver;
        else
            delete process.env.STORAGE_DRIVER;
        if (savedBucket !== undefined)
            process.env.S3_BUCKET = savedBucket;
        else
            delete process.env.S3_BUCKET;
        if (savedRegion !== undefined)
            process.env.S3_REGION = savedRegion;
        else
            delete process.env.S3_REGION;
    }
});
(0, harness_1.test)('factory: unknown driver throws StorageError', () => {
    strict_1.default.throws(() => (0, factory_1.getStorage)({ driver: 'wat' }), (e) => e instanceof types_1.StorageError);
});
(0, harness_1.test)('factory: overrides.local takes precedence', () => {
    const fs = mkInMemoryFs();
    const custom = new local_1.LocalStorageAdapter({ publicDir: '/custom', fs });
    const adapter = (0, factory_1.getStorage)({ driver: 'local', overrides: { local: custom } });
    strict_1.default.equal(adapter, custom);
});
// ── FakeStorageAdapter ───────────────────────────────────────────────────
(0, harness_1.test)('fake: upload records the upload and returns the templated URL', async () => {
    const fake = (0, fake_1.createFakeStorage)();
    const result = await fake.upload('a.mp4', Buffer.from('hello'));
    strict_1.default.equal(result.key, 'a.mp4');
    strict_1.default.equal(result.url, '/fake/a.mp4');
    strict_1.default.equal(fake.uploads.length, 1);
    strict_1.default.deepEqual(fake.uploads[0], { key: 'a.mp4', bodySize: 5, contentType: undefined });
});
(0, harness_1.test)('fake: urlFor records the URL call', async () => {
    const fake = (0, fake_1.createFakeStorage)({ urlTemplate: (k) => `https://x/${k}` });
    const url = await fake.urlFor('b.mp4');
    strict_1.default.equal(url, 'https://x/b.mp4');
    strict_1.default.deepEqual(fake.signedUrls, ['https://x/b.mp4']);
});
(0, harness_1.test)('fake: delete records the deletion', async () => {
    const fake = (0, fake_1.createFakeStorage)();
    await fake.delete('c.mp4');
    strict_1.default.deepEqual(fake.deletions, ['c.mp4']);
});
(0, harness_1.test)('fake: failNextUpload throws once then succeeds', async () => {
    const fake = (0, fake_1.createFakeStorage)();
    fake.failNextUpload = 'transient';
    await strict_1.default.rejects(() => fake.upload('a.mp4', Buffer.from('x')), /transient/);
    // next call works
    const r = await fake.upload('b.mp4', Buffer.from('y'));
    strict_1.default.equal(r.key, 'b.mp4');
    strict_1.default.equal(fake.uploads.length, 1);
});
