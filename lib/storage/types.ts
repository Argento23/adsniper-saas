/**
 * Storage abstraction — Production prep.
 *
 * Decouples the export runner from the concrete storage backend.
 * Two implementations:
 *   - `LocalStorageAdapter`: writes under `public/exports/`,
 *     returns `/exports/{key}` (Next.js static path). Dev/test only.
 *   - `S3StorageAdapter`: uploads to S3/R2, returns presigned URLs.
 *     Production.
 *
 * The factory in `lib/storage/factory.ts` picks the implementation
 * based on the `STORAGE_DRIVER` env var (defaults to `local`).
 */

export interface UploadResult {
    /** Stable key the object was stored at. */
    key: string;
    /** Public or signed URL where the object can be retrieved. */
    url: string;
}

export interface StorageAdapter {
    /**
     * Upload a binary object. Replaces any existing object with the
     * same key. Returns the key + a URL for retrieval.
     */
    upload(
        key: string,
        body: Buffer | Uint8Array,
        contentType?: string,
    ): Promise<UploadResult>;

    /**
     * Return a retrievable URL for the given key. May be:
     *   - a static public URL (local adapter)
     *   - a short-lived presigned URL (s3 adapter)
     */
    urlFor(key: string): Promise<string>;

    /**
     * Remove an object. No-op if the object does not exist.
     */
    delete(key: string): Promise<void>;
}

/**
 * Errors raised by storage adapters. Wraps the underlying cause so
 * callers can surface a meaningful message without leaking driver
 * details to end users.
 */
export class StorageError extends Error {
    public readonly cause?: unknown;
    constructor(message: string, cause?: unknown) {
        super(message);
        this.name = 'StorageError';
        this.cause = cause;
    }
}
