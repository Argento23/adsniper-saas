"use strict";
/**
 * In-memory StorageAdapter for tests.
 *
 * Captures uploads + records signed URL calls so assertions can
 * verify the export runner's behavior without touching the real
 * filesystem or hitting S3.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFakeStorage = createFakeStorage;
function createFakeStorage(opts = {}) {
    const urlTemplate = opts.urlTemplate ?? ((key) => `/fake/${key}`);
    const uploads = [];
    const deletions = [];
    const signedUrls = [];
    let failNextUpload;
    let failNextUrl;
    const adapter = {
        uploads,
        deletions,
        signedUrls,
        get failNextUpload() { return failNextUpload; },
        set failNextUpload(v) { failNextUpload = v; },
        get failNextUrl() { return failNextUrl; },
        set failNextUrl(v) { failNextUrl = v; },
        async upload(key, body, contentType) {
            if (failNextUpload) {
                const msg = failNextUpload;
                failNextUpload = undefined;
                throw new Error(msg);
            }
            const size = body instanceof Buffer
                ? body.length
                : body.byteLength;
            uploads.push({ key, bodySize: size, contentType });
            return { key, url: urlTemplate(key) };
        },
        async urlFor(key) {
            if (failNextUrl) {
                const msg = failNextUrl;
                failNextUrl = undefined;
                throw new Error(msg);
            }
            const url = urlTemplate(key);
            signedUrls.push(url);
            return url;
        },
        async delete(key) {
            deletions.push(key);
        },
    };
    return adapter;
}
