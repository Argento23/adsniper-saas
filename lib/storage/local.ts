/**
 * Local filesystem storage adapter — dev/test only.
 *
 * Writes objects under a configurable directory (default
 * `<cwd>/public/exports/`) and returns `/exports/{key}` URLs
 * matching Next.js's static asset route. Mirrors the prior Phase 6G
 * behavior exactly, so existing tests and dev workflows continue to
 * work without configuration.
 *
 * For production, use `S3StorageAdapter` from `./s3.ts`.
 */

import { StorageAdapter, StorageError, UploadResult } from './types';

export interface LocalStorageAdapterOptions {
    /** Absolute path of the directory objects are stored under. */
    publicDir: string;
    /** URL prefix returned by `urlFor`. Default: `/exports`. */
    urlPrefix?: string;
    /** File-system operations, injectable for tests. */
    fs?: {
        writeFile: (path: string, data: Uint8Array) => Promise<void>;
        unlink: (path: string) => Promise<void>;
        mkdir: (path: string, opts: { recursive: boolean }) => Promise<void>;
    };
}

export class LocalStorageAdapter implements StorageAdapter {
    private readonly publicDir: string;
    private readonly urlPrefix: string;
    private readonly fs: NonNullable<LocalStorageAdapterOptions['fs']>;

    constructor(opts: LocalStorageAdapterOptions) {
        this.publicDir = opts.publicDir;
        this.urlPrefix = opts.urlPrefix ?? '/exports';
        this.fs = opts.fs ?? lazyFs();
    }

    async upload(
        key: string,
        body: Buffer | Uint8Array,
        _contentType?: string,
    ): Promise<UploadResult> {
        const fullPath = this.pathFor(key);
        await this.fs.mkdir(this.publicDir, { recursive: true });
        await this.fs.writeFile(fullPath, body);
        return { key, url: this.urlForSync(key) };
    }

    urlFor(key: string): Promise<string> {
        return Promise.resolve(this.urlForSync(key));
    }

    async delete(key: string): Promise<void> {
        const fullPath = this.pathFor(key);
        try {
            await this.fs.unlink(fullPath);
        } catch (e: unknown) {
            // ENOENT: object did not exist — treat as success.
            if (isEnoent(e)) return;
            throw new StorageError(`failed to delete ${key}`, e);
        }
    }

    /** Synchronous URL helper for code paths that don't await (tests, UI). */
    urlForSync(key: string): string {
        return `${this.urlPrefix}/${key}`;
    }

    /** Resolves a key to an absolute filesystem path. Exposed for tests. */
    pathFor(key: string): string {
        return `${this.publicDir}/${key}`;
    }
}

function lazyFs(): NonNullable<LocalStorageAdapterOptions['fs']> {
    // Lazily create the fs binding so the adapter can be constructed
    // in browser-like environments (tests set `globalThis.window`).
    // The actual `require('node:fs/promises')` only fires when the
    // adapter is first used — and only in Node.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeRequire = (id: string): unknown => require(id);
    const fs = (): typeof import('node:fs/promises') => {
        if (typeof process === 'undefined' || !process.versions?.node) {
            throw new Error('LocalStorageAdapter: filesystem not available outside Node');
        }
        return nodeRequire('node:fs/promises') as typeof import('node:fs/promises');
    };
    return {
        writeFile: async (path, data) => fs().writeFile(path, data),
        unlink: async (path) => fs().unlink(path),
        mkdir: async (path, opts) => { await fs().mkdir(path, opts); },
    };
}

function isEnoent(e: unknown): boolean {
    return (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code: unknown }).code === 'ENOENT'
    );
}
