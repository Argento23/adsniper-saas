"use strict";
/**
 * Unit tests for the Video Provider Engine.
 *
 * These tests do NOT call any external API. They cover:
 *   - Registry: enabled/disabled listing, get-by-id.
 *   - Capabilities: provider compatible/incompatible with an input.
 *   - Chain: primary success, primary fail → fallback, all-fail,
 *     non-retryable short-circuit.
 *   - Input validation (in API route is integration; here we cover the
 *     classifier used by the chain).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const harness_1 = require("./harness");
// ── imports under test ──────────────────────────────────────────────────
const video_1 = require("../lib/providers/video");
const chain_1 = require("../lib/providers/video/chain");
// ── Registry ─────────────────────────────────────────────────────────────
(0, harness_1.test)('registry lists exactly three providers', () => {
    const ids = [video_1.wanProvider.id, video_1.klingProvider.id, video_1.veoProvider.id].sort();
    const enabled = (0, video_1.listEnabledVideoProviders)().map(p => p.id).sort();
    strict_1.default.deepEqual(enabled, ids.filter(id => id !== 'veo'));
});
(0, harness_1.test)('veo provider is registered but disabled', () => {
    const p = (0, video_1.getVideoProvider)('veo');
    strict_1.default.ok(p, 'veo must exist');
    strict_1.default.equal(p.enabled, false);
});
(0, harness_1.test)('wan and kling are enabled', () => {
    strict_1.default.equal((0, video_1.getVideoProvider)('wan')?.enabled, true);
    strict_1.default.equal((0, video_1.getVideoProvider)('kling')?.enabled, true);
});
// ── Capabilities ─────────────────────────────────────────────────────────
(0, harness_1.test)('selectCandidates returns wan+kling for i2v 9:16 10s', () => {
    const input = {
        prompt: 'cinematic slow motion',
        imageUrl: 'https://example.com/x.jpg',
        aspectRatio: '9:16',
        durationSec: 10,
    };
    const cands = (0, chain_1.selectCandidates)(input, { requiresImageToVideo: true });
    const ids = cands.map(c => c.id).sort();
    strict_1.default.deepEqual(ids, ['kling', 'wan']);
});
(0, harness_1.test)('selectCandidates drops providers exceeding max duration', () => {
    const input = {
        prompt: 'test',
        imageUrl: 'https://example.com/x.jpg',
        aspectRatio: '9:16',
        durationSec: 11,
    };
    const cands = (0, chain_1.selectCandidates)(input, { requiresImageToVideo: true });
    strict_1.default.equal(cands.length, 0, 'no provider supports >10s');
});
(0, harness_1.test)('selectCandidates drops providers not supporting the aspect ratio', () => {
    const input = {
        prompt: 'test',
        imageUrl: 'https://example.com/x.jpg',
        aspectRatio: '4:5',
        durationSec: 8,
    };
    const cands = (0, chain_1.selectCandidates)(input, { requiresImageToVideo: true });
    // wan/kling advertise 1:1 in their adapter maps but not 4:5, so empty.
    strict_1.default.equal(cands.length, 0);
});
// ── Error classification ─────────────────────────────────────────────────
(0, harness_1.test)('classifyError flags invalid input as non_retryable', () => {
    strict_1.default.equal((0, chain_1.classifyError)('invalid prompt: too short'), 'non_retryable');
    strict_1.default.equal((0, chain_1.classifyError)('authentication failed'), 'non_retryable');
    strict_1.default.equal((0, chain_1.classifyError)('requires imageUrl (i2v)'), 'non_retryable');
    strict_1.default.equal((0, chain_1.classifyError)('insufficient credits'), 'non_retryable');
});
(0, harness_1.test)('classifyError flags timeouts and 429 as retryable', () => {
    strict_1.default.equal((0, chain_1.classifyError)('Request timeout'), 'retryable');
    strict_1.default.equal((0, chain_1.classifyError)('429 Too Many Requests'), 'retryable');
    strict_1.default.equal((0, chain_1.classifyError)('fetch failed'), 'retryable');
    strict_1.default.equal((0, chain_1.classifyError)('econnreset'), 'retryable');
});
// ── Chain with mocks ─────────────────────────────────────────────────────
function makeMockProvider(id, enabled, generateImpl) {
    return {
        id,
        enabled,
        capabilities: {
            audioNative: false,
            maxDurationSec: 10,
            aspectRatios: ['9:16'],
            resolutions: ['720p'],
            imageToVideo: true,
            textToVideo: false,
            multiShot: false,
        },
        async generate(i) {
            const out = await generateImpl(i);
            return {
                externalJobId: out.id,
                providerId: id,
                startedAt: new Date().toISOString(),
            };
        },
        async pollStatus(eid) {
            return { externalJobId: eid, state: 'processing' };
        },
        async cancel() { },
    };
}
// Snapshot of the original providers so we can restore them after each
// test that mutates the registry via registerVideoProvider.
const originalRegistry = {
    wan: video_1.wanProvider,
    kling: video_1.klingProvider,
    veo: video_1.veoProvider,
};
function withMockedProviders(mocks, fn) {
    for (const m of mocks)
        (0, video_1.registerVideoProvider)(m);
    return fn().finally(() => {
        for (const id of Object.keys(mocks)) {
            const orig = originalRegistry[id];
            if (orig)
                (0, video_1.registerVideoProvider)(orig);
        }
    });
}
(0, harness_1.test)('chain: primary succeeds → fallback never invoked', async () => {
    let fallbackCalls = 0;
    const wanM = makeMockProvider('wan', true, async () => ({ id: 'wan_ok' }));
    const klingM = makeMockProvider('kling', true, async () => {
        fallbackCalls++;
        return { id: 'kling_ok' };
    });
    await withMockedProviders([wanM, klingM], async () => {
        const result = await (0, chain_1.runChain)({ prompt: 'p', imageUrl: 'https://x', aspectRatio: '9:16', durationSec: 5 }, { chain: [{ providerId: 'wan', retries: 1 }, { providerId: 'kling', retries: 1 }] });
        strict_1.default.equal(fallbackCalls, 0);
        strict_1.default.equal(result.failedAll, false);
        strict_1.default.equal(result.handle?.providerId, 'wan');
    });
});
(0, harness_1.test)('chain: primary fails → fallback invoked', async () => {
    let fallbackCalls = 0;
    const wanM = makeMockProvider('wan', true, async () => { throw new Error('timeout'); });
    const klingM = makeMockProvider('kling', true, async () => {
        fallbackCalls++;
        return { id: 'kling_ok' };
    });
    await withMockedProviders([wanM, klingM], async () => {
        const result = await (0, chain_1.runChain)({ prompt: 'p', imageUrl: 'https://x', aspectRatio: '9:16', durationSec: 5 }, { chain: [{ providerId: 'wan', retries: 1 }, { providerId: 'kling', retries: 1 }] });
        strict_1.default.equal(fallbackCalls, 1);
        strict_1.default.equal(result.failedAll, false);
        strict_1.default.equal(result.handle?.providerId, 'kling');
    });
});
(0, harness_1.test)('chain: non-retryable error short-circuits the chain', async () => {
    let fallbackCalls = 0;
    const wanM = makeMockProvider('wan', true, async () => {
        throw new Error('invalid prompt: too short');
    });
    const klingM = makeMockProvider('kling', true, async () => {
        fallbackCalls++;
        return { id: 'kling_ok' };
    });
    await withMockedProviders([wanM, klingM], async () => {
        const result = await (0, chain_1.runChain)({ prompt: 'p', imageUrl: 'https://x', aspectRatio: '9:16', durationSec: 5 }, { chain: [{ providerId: 'wan', retries: 1 }, { providerId: 'kling', retries: 1 }] });
        strict_1.default.equal(fallbackCalls, 0, 'fallback must NOT be called for non-retryable errors');
        strict_1.default.equal(result.failedAll, true);
    });
});
(0, harness_1.test)('chain: all providers fail → failedAll=true and attempts logged', async () => {
    const wanM = makeMockProvider('wan', true, async () => { throw new Error('timeout'); });
    const klingM = makeMockProvider('kling', true, async () => { throw new Error('network'); });
    await withMockedProviders([wanM, klingM], async () => {
        const result = await (0, chain_1.runChain)({ prompt: 'p', imageUrl: 'https://x', aspectRatio: '9:16', durationSec: 5 }, { chain: [{ providerId: 'wan', retries: 1 }, { providerId: 'kling', retries: 1 }] });
        strict_1.default.equal(result.failedAll, true);
        strict_1.default.equal(result.attempts.length, 2);
    });
});
