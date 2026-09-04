"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalStorageAdapter = void 0;
const types_1 = require("./types");
class LocalStorageAdapter {
    publicDir;
    urlPrefix;
    fs;
    constructor(opts) {
        this.publicDir = opts.publicDir;
        this.urlPrefix = opts.urlPrefix ?? '/exports';
        this.fs = opts.fs ?? lazyFs();
    }
    async upload(key, body, _contentType) {
        const fullPath = this.pathFor(key);
        await this.fs.mkdir(this.publicDir, { recursive: true });
        await this.fs.writeFile(fullPath, body);
        return { key, url: this.urlForSync(key) };
    }
    urlFor(key) {
        return Promise.resolve(this.urlForSync(key));
    }
    async delete(key) {
        const fullPath = this.pathFor(key);
        try {
            await this.fs.unlink(fullPath);
        }
        catch (e) {
            // ENOENT: object did not exist — treat as success.
            if (isEnoent(e))
                return;
            throw new types_1.StorageError(`failed to delete ${key}`, e);
        }
    }
    /** Synchronous URL helper for code paths that don't await (tests, UI). */
    urlForSync(key) {
        return `${this.urlPrefix}/${key}`;
    }
    /** Resolves a key to an absolute filesystem path. Exposed for tests. */
    pathFor(key) {
        return `${this.publicDir}/${key}`;
    }
}
exports.LocalStorageAdapter = LocalStorageAdapter;
function lazyFs() {
    // Lazily create the fs binding so the adapter can be constructed
    // in browser-like environments (tests set `globalThis.window`).
    // The actual `require('node:fs/promises')` only fires when the
    // adapter is first used — and only in Node.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeRequire = (id) => require(id);
    const fs = () => {
        if (typeof process === 'undefined' || !process.versions?.node) {
            throw new Error('LocalStorageAdapter: filesystem not available outside Node');
        }
        return nodeRequire('node:fs/promises');
    };
    return {
        writeFile: async (path, data) => fs().writeFile(path, data),
        unlink: async (path) => fs().unlink(path),
        mkdir: async (path, opts) => { await fs().mkdir(path, opts); },
    };
}
function isEnoent(e) {
    return (typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        e.code === 'ENOENT');
}
