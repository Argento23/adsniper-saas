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

import assert from 'node:assert/strict';
import { test } from './harness';

import { LocalStorageAdapter } from '../lib/storage/local';
import { S3StorageAdapter, S3ClientLike, Signer } from '../lib/storage/s3';
import { createFakeStorage } from '../lib/storage/fake';
import { getStorage } from '../lib/storage/factory';
import { StorageError } from '../lib/storage/types';

// ── helpers ──────────────────────────────────────────────────────────────

function mkInMemoryFs(): {
    files: Record<string, Uint8Array>;
    writeFile: (path: string, data: Uint8Array) => Promise<void>;
    unlink: (path: string) => Promise<void>;
    mkdir: (path: string, opts: { recursive: boolean }) => Promise<void>;
    access: (path: string) => Promise<void>;
} {
    const files: Record<string, Uint8Array> = {};
    return {
        files,
        writeFile: async (path, data) => { files[path] = new Uint8Array(data); },
        unlink: async (path) => {
            if (!(path in files)) {
                const e: NodeJS.ErrnoException = new Error('ENOENT');
                e.code = 'ENOENT';
                throw e;
            }
            delete files[path];
        },
        mkdir: async () => { /* noop for in-memory */ },
        access: async (path) => {
            if (!(path in files)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        },
    };
}

// ── LocalStorageAdapter ──────────────────────────────────────────────────

test('local: upload writes file under publicDir and returns /exports/{key}', async () => {
    const fs = mkInMemoryFs();
    const adapter = new LocalStorageAdapter({ publicDir: '/tmp/test-exports', fs });

    const result = await adapter.upload('abc.mp4', new Uint8Array([1, 2, 3]), 'video/mp4');

    assert.equal(result.key, 'abc.mp4');
    assert.equal(result.url, '/exports/abc.mp4');
    assert.deepEqual(Array.from(fs.files['/tmp/test-exports/abc.mp4']), [1, 2, 3]);
});

test('local: urlFor returns /exports/{key}', async () => {
    const adapter = new LocalStorageAdapter({ publicDir: '/x', fs: mkInMemoryFs() });
    assert.equal(await adapter.urlFor('foo.mp4'), '/exports/foo.mp4');
});

test('local: urlForSync returns the same value synchronously', () => {
    const adapter = new LocalStorageAdapter({ publicDir: '/x', fs: mkInMemoryFs() });
    assert.equal(adapter.urlForSync('bar.mp4'), '/exports/bar.mp4');
});

test('local: delete removes existing file', async () => {
    const fs = mkInMemoryFs();
    const adapter = new LocalStorageAdapter({ publicDir: '/x', fs });
    await adapter.upload('x.mp4', new Uint8Array([1]));
    assert.ok(fs.files['/x/x.mp4']);

    await adapter.delete('x.mp4');
    assert.equal(fs.files['/x/x.mp4'], undefined);
});

test('local: delete on missing file is a no-op (ENOENT swallowed)', async () => {
    const fs = mkInMemoryFs();
    const adapter = new LocalStorageAdapter({ publicDir: '/x', fs });

    await adapter.delete('missing.mp4'); // should not throw
});

test('local: delete wraps non-ENOENT errors in StorageError', async () => {
    const adapter = new LocalStorageAdapter({
        publicDir: '/x',
        fs: {
            ...mkInMemoryFs(),
            unlink: async () => { throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); },
        },
    });

    await assert.rejects(
        () => adapter.delete('x.mp4'),
        (e: unknown) => e instanceof StorageError && e.message.includes('failed to delete'),
    );
});

test('local: custom urlPrefix is honored', async () => {
    const adapter = new LocalStorageAdapter({ publicDir: '/x', urlPrefix: '/cdn/videos', fs: mkInMemoryFs() });
    assert.equal(adapter.urlForSync('a.mp4'), '/cdn/videos/a.mp4');
});

test('local: pathFor returns absolute path joined with key', () => {
    const adapter = new LocalStorageAdapter({ publicDir: '/var/data', fs: mkInMemoryFs() });
    assert.equal(adapter.pathFor('x.mp4'), '/var/data/x.mp4');
});

// ── S3StorageAdapter ─────────────────────────────────────────────────────

function mkFakeS3Client(): S3ClientLike & { calls: Array<{ op: string; Bucket: string; Key: string; Body?: Uint8Array; ContentType?: string }> } {
    const calls: Array<{ op: string; Bucket: string; Key: string; Body?: Uint8Array; ContentType?: string }> = [];
    return {
        calls,
        async send(command: unknown) {
            const cmd = command as { constructor?: { name: string }; Bucket: string; Key: string; Body?: Uint8Array; ContentType?: string };
            const op = cmd.constructor?.name ?? 'Unknown';
            calls.push({ op, Bucket: cmd.Bucket, Key: cmd.Key, Body: cmd.Body, ContentType: cmd.ContentType });
            return { ok: true };
        },
    };
}

const mkFakeSigner = (): Signer & { calls: Array<{ key: string; ttl: number }> } => {
    const calls: Array<{ key: string; ttl: number }> = [];
    const signer: Signer & { calls: typeof calls } = ((client, command, opts) => {
        const cmd = command as { Key: string };
        calls.push({ key: cmd.Key, ttl: opts.expiresIn });
        return Promise.resolve(`https://signed.example.com/${cmd.Key}?ttl=${opts.expiresIn}`);
    }) as Signer & { calls: typeof calls };
    signer.calls = calls;
    return signer;
};

test('s3: fullKey combines prefix and key, strips slashes', () => {
    const adapter = new S3StorageAdapter({
        bucket: 'b',
        region: 'r',
        s3Client: mkFakeS3Client(),
        signer: mkFakeSigner(),
    });
    assert.equal(adapter.fullKey('foo.mp4'), 'exports/foo.mp4');
    assert.equal(adapter.fullKey('/foo.mp4'), 'exports/foo.mp4');
    assert.equal(adapter.fullKey('foo.mp4/'), 'exports/foo.mp4/'); // trailing slash kept
});

test('s3: fullKey throws on empty key', () => {
    const adapter = new S3StorageAdapter({
        bucket: 'b',
        region: 'r',
        s3Client: mkFakeS3Client(),
        signer: mkFakeSigner(),
    });
    assert.throws(() => adapter.fullKey(''), /key must be non-empty/);
});

test('s3: fullKey with empty prefix returns bare key', () => {
    const adapter = new S3StorageAdapter({
        bucket: 'b',
        region: 'r',
        keyPrefix: '',
        s3Client: mkFakeS3Client(),
        signer: mkFakeSigner(),
    });
    assert.equal(adapter.fullKey('foo.mp4'), 'foo.mp4');
});

test('s3: upload sends PutObjectCommand and returns signed URL', async () => {
    const client = mkFakeS3Client();
    const signer = mkFakeSigner();
    const adapter = new S3StorageAdapter({
        bucket: 'my-bucket',
        region: 'us-east-1',
        s3Client: client,
        signer,
    });

    const body = new Uint8Array([10, 20, 30]);
    const result = await adapter.upload('clip.mp4', body, 'video/mp4');

    assert.equal(result.key, 'exports/clip.mp4');
    assert.equal(result.url, 'https://signed.example.com/exports/clip.mp4?ttl=3600');
    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].Bucket, 'my-bucket');
    assert.equal(client.calls[0].Key, 'exports/clip.mp4');
    assert.equal(client.calls[0].ContentType, 'video/mp4');
    assert.equal(signer.calls.length, 1);
    assert.equal(signer.calls[0].ttl, 3600);
});

test('s3: urlFor returns presigned URL with configured TTL', async () => {
    const client = mkFakeS3Client();
    const signer = mkFakeSigner();
    const adapter = new S3StorageAdapter({
        bucket: 'b',
        region: 'r',
        signedUrlTtlSec: 7200,
        s3Client: client,
        signer,
    });

    const url = await adapter.urlFor('clip.mp4');
    assert.equal(url, 'https://signed.example.com/exports/clip.mp4?ttl=7200');
});

test('s3: upload wraps client errors in StorageError', async () => {
    const adapter = new S3StorageAdapter({
        bucket: 'b',
        region: 'r',
        s3Client: {
            async send() { throw new Error('NetworkError'); },
        },
        signer: mkFakeSigner(),
    });

    await assert.rejects(
        () => adapter.upload('x.mp4', Buffer.from('data')),
        (e: unknown) => e instanceof StorageError && e.message.includes('failed to upload'),
    );
});

test('s3: delete wraps client errors in StorageError', async () => {
    const adapter = new S3StorageAdapter({
        bucket: 'b',
        region: 'r',
        s3Client: {
            async send() { throw new Error('Forbidden'); },
        },
        signer: mkFakeSigner(),
    });

    await assert.rejects(
        () => adapter.delete('x.mp4'),
        (e: unknown) => e instanceof StorageError && e.message.includes('failed to delete'),
    );
});

test('s3: constructor requires bucket and region', () => {
    assert.throws(() => new S3StorageAdapter({ bucket: '', region: 'r', s3Client: mkFakeS3Client(), signer: mkFakeSigner() }),
        (e: unknown) => e instanceof StorageError);
    assert.throws(() => new S3StorageAdapter({ bucket: 'b', region: '', s3Client: mkFakeS3Client(), signer: mkFakeSigner() }),
        (e: unknown) => e instanceof StorageError);
});

// ── Factory ──────────────────────────────────────────────────────────────

test('factory: defaults to local driver when STORAGE_DRIVER unset', () => {
    const savedDriver = process.env.STORAGE_DRIVER;
    delete process.env.STORAGE_DRIVER;
    try {
        const adapter = getStorage({ localDir: '/custom/path', overrides: { local: undefined, s3: undefined } });
        assert.ok(adapter instanceof LocalStorageAdapter);
        assert.equal((adapter as LocalStorageAdapter).urlForSync('x.mp4'), '/exports/x.mp4');
        assert.equal((adapter as LocalStorageAdapter).pathFor('x.mp4'), '/custom/path/x.mp4');
    } finally {
        if (savedDriver !== undefined) process.env.STORAGE_DRIVER = savedDriver;
    }
});

test('factory: explicit driver=local uses LocalStorageAdapter', () => {
    const adapter = getStorage({ driver: 'local', localDir: '/x' });
    assert.ok(adapter instanceof LocalStorageAdapter);
});

test('factory: STORAGE_DRIVER=s3 requires S3_BUCKET and S3_REGION', () => {
    const savedDriver = process.env.STORAGE_DRIVER;
    const savedBucket = process.env.S3_BUCKET;
    const savedRegion = process.env.S3_REGION;
    process.env.STORAGE_DRIVER = 's3';
    delete process.env.S3_BUCKET;
    delete process.env.S3_REGION;
    try {
        assert.throws(() => getStorage(), (e: unknown) => e instanceof StorageError && e.message.includes('S3_BUCKET'));
    } finally {
        if (savedDriver !== undefined) process.env.STORAGE_DRIVER = savedDriver; else delete process.env.STORAGE_DRIVER;
        if (savedBucket !== undefined) process.env.S3_BUCKET = savedBucket;
        if (savedRegion !== undefined) process.env.S3_REGION = savedRegion;
    }
});

test('factory: STORAGE_DRIVER=s3 with full env returns S3StorageAdapter', () => {
    const savedDriver = process.env.STORAGE_DRIVER;
    const savedBucket = process.env.S3_BUCKET;
    const savedRegion = process.env.S3_REGION;
    process.env.STORAGE_DRIVER = 's3';
    process.env.S3_BUCKET = 'b';
    process.env.S3_REGION = 'us-east-1';
    try {
        const adapter = getStorage();
        assert.ok(adapter instanceof S3StorageAdapter);
    } finally {
        if (savedDriver !== undefined) process.env.STORAGE_DRIVER = savedDriver; else delete process.env.STORAGE_DRIVER;
        if (savedBucket !== undefined) process.env.S3_BUCKET = savedBucket; else delete process.env.S3_BUCKET;
        if (savedRegion !== undefined) process.env.S3_REGION = savedRegion; else delete process.env.S3_REGION;
    }
});

test('factory: unknown driver throws StorageError', () => {
    assert.throws(() => getStorage({ driver: 'wat' }), (e: unknown) => e instanceof StorageError);
});

test('factory: overrides.local takes precedence', () => {
    const fs = mkInMemoryFs();
    const custom = new LocalStorageAdapter({ publicDir: '/custom', fs });
    const adapter = getStorage({ driver: 'local', overrides: { local: custom } });
    assert.equal(adapter, custom);
});

// ── FakeStorageAdapter ───────────────────────────────────────────────────

test('fake: upload records the upload and returns the templated URL', async () => {
    const fake = createFakeStorage();
    const result = await fake.upload('a.mp4', Buffer.from('hello'));
    assert.equal(result.key, 'a.mp4');
    assert.equal(result.url, '/fake/a.mp4');
    assert.equal(fake.uploads.length, 1);
    assert.deepEqual(fake.uploads[0], { key: 'a.mp4', bodySize: 5, contentType: undefined });
});

test('fake: urlFor records the URL call', async () => {
    const fake = createFakeStorage({ urlTemplate: (k) => `https://x/${k}` });
    const url = await fake.urlFor('b.mp4');
    assert.equal(url, 'https://x/b.mp4');
    assert.deepEqual(fake.signedUrls, ['https://x/b.mp4']);
});

test('fake: delete records the deletion', async () => {
    const fake = createFakeStorage();
    await fake.delete('c.mp4');
    assert.deepEqual(fake.deletions, ['c.mp4']);
});

test('fake: failNextUpload throws once then succeeds', async () => {
    const fake = createFakeStorage();
    fake.failNextUpload = 'transient';
    await assert.rejects(() => fake.upload('a.mp4', Buffer.from('x')), /transient/);
    // next call works
    const r = await fake.upload('b.mp4', Buffer.from('y'));
    assert.equal(r.key, 'b.mp4');
    assert.equal(fake.uploads.length, 1);
});

export {};
