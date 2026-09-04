"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageError = void 0;
/**
 * Errors raised by storage adapters. Wraps the underlying cause so
 * callers can surface a meaningful message without leaking driver
 * details to end users.
 */
class StorageError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.name = 'StorageError';
        this.cause = cause;
    }
}
exports.StorageError = StorageError;
