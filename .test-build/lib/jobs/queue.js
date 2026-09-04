"use strict";
/**
 * BACKWARD-COMPATIBILITY SHIM.
 *
 * Phase 7 split the monolithic `queue.ts` into:
 *   - `lib/jobs/memory.ts` (InMemoryJobQueue)
 *   - `lib/jobs/redis.ts`  (RedisJobQueue)
 *   - `lib/jobs/factory.ts` (getJobQueue)
 *   - `lib/jobs/index.ts`  (barrel)
 *
 * New code should import from `@/lib/jobs` (the barrel) or directly
 * from `@/lib/jobs/factory` for the queue instance. This shim keeps
 * existing imports working without modification.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_JOB_QUEUE_OPTIONS = exports.RedisJobQueue = exports.InMemoryJobQueue = exports.resetJobQueue = exports.getJobQueue = void 0;
var factory_1 = require("./factory");
Object.defineProperty(exports, "getJobQueue", { enumerable: true, get: function () { return factory_1.getJobQueue; } });
Object.defineProperty(exports, "resetJobQueue", { enumerable: true, get: function () { return factory_1.resetJobQueue; } });
var memory_1 = require("./memory");
Object.defineProperty(exports, "InMemoryJobQueue", { enumerable: true, get: function () { return memory_1.InMemoryJobQueue; } });
var redis_1 = require("./redis");
Object.defineProperty(exports, "RedisJobQueue", { enumerable: true, get: function () { return redis_1.RedisJobQueue; } });
var types_1 = require("./types");
Object.defineProperty(exports, "DEFAULT_JOB_QUEUE_OPTIONS", { enumerable: true, get: function () { return types_1.DEFAULT_JOB_QUEUE_OPTIONS; } });
