// Runtime alias resolver + localStorage mock + test bootstrap.
const Module = require('node:module');
const path = require('node:path');

// Minimal localStorage polyfill.
const _store = {};
globalThis.localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
    setItem(k, v) { _store[k] = String(v); },
    removeItem(k) { delete _store[k]; },
    clear() { for (const k of Object.keys(_store)) delete _store[k]; },
    key(i) { return Object.keys(_store)[i] ?? null; },
    get length() { return Object.keys(_store).length; },
};
globalThis.window = globalThis;

const ROOT = path.resolve(__dirname, '..', '.test-build');

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
    // Rewrite @/ imports to use a stable absolute path so Node's native
    // module cache works correctly (no double-evaluation).
    if (typeof request === 'string' && request.startsWith('@/')) {
        const rel = request.slice(2);
        const abs = path.join(ROOT, rel);
        // Try as exact file first, then as directory + /index.js.
        // Let Node's native resolver handle the extension lookup.
        request = abs;
    }
    return originalResolveFilename.call(this, request, parent, ...rest);
};

require('../.test-build/tests/video-providers.test.js');
require('../.test-build/tests/scenes.test.js');
require('../.test-build/tests/creative-director.test.js');
require('../.test-build/tests/timeline.test.js');
require('../.test-build/tests/timeline-api.test.js');
require('../.test-build/tests/timeline-editor.test.js');
require('../.test-build/tests/scene-timeline-integration.test.js');
require('../.test-build/tests/video-composer.test.js');
require('../.test-build/tests/subtitles.test.js');
require('../.test-build/tests/export.test.js');
require('../.test-build/tests/storage.test.js');
require('../.test-build/tests/fake-redis.js');
require('../.test-build/tests/jobs.test.js');

const { run } = require('../.test-build/tests/harness.js');
run().then(r => process.exit(r.failed === 0 ? 0 : 1));
