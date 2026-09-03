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

import assert from 'node:assert/strict';
import { test, run } from './harness';

// ── imports under test ──────────────────────────────────────────────────
import {
    listEnabledVideoProviders,
    getVideoProvider,
    registerVideoProvider,
    veoProvider,
    wanProvider,
    klingProvider,
} from '../lib/providers/video';
import { classifyError, selectCandidates, runChain } from '../lib/providers/video/chain';
import { VideoProvider, VideoGenInput } from '../lib/providers/types';

// ── Registry ─────────────────────────────────────────────────────────────
test('registry lists exactly three providers', () => {
    const ids = [wanProvider.id, klingProvider.id, veoProvider.id].sort();
    const enabled = listEnabledVideoProviders().map(p => p.id).sort();
    assert.deepEqual(enabled, ids.filter(id => id !== 'veo'));
});

test('veo provider is registered but disabled', () => {
    const p = getVideoProvider('veo');
    assert.ok(p, 'veo must exist');
    assert.equal(p.enabled, false);
});

test('wan and kling are enabled', () => {
    assert.equal(getVideoProvider('wan')?.enabled, true);
    assert.equal(getVideoProvider('kling')?.enabled, true);
});

// ── Capabilities ─────────────────────────────────────────────────────────
test('selectCandidates returns wan+kling for i2v 9:16 10s', () => {
    const input: VideoGenInput = {
        prompt: 'cinematic slow motion',
        imageUrl: 'https://example.com/x.jpg',
        aspectRatio: '9:16',
        durationSec: 10,
    };
    const cands = selectCandidates(input, { requiresImageToVideo: true });
    const ids = cands.map(c => c.id).sort();
    assert.deepEqual(ids, ['kling', 'wan']);
});

test('selectCandidates drops providers exceeding max duration', () => {
    const input: VideoGenInput = {
        prompt: 'test',
        imageUrl: 'https://example.com/x.jpg',
        aspectRatio: '9:16',
        durationSec: 11,
    };
    const cands = selectCandidates(input, { requiresImageToVideo: true });
    assert.equal(cands.length, 0, 'no provider supports >10s');
});

test('selectCandidates drops providers not supporting the aspect ratio', () => {
    const input: VideoGenInput = {
        prompt: 'test',
        imageUrl: 'https://example.com/x.jpg',
        aspectRatio: '4:5',
        durationSec: 8,
    };
    const cands = selectCandidates(input, { requiresImageToVideo: true });
    // wan/kling advertise 1:1 in their adapter maps but not 4:5, so empty.
    assert.equal(cands.length, 0);
});

// ── Error classification ─────────────────────────────────────────────────
test('classifyError flags invalid input as non_retryable', () => {
    assert.equal(classifyError('invalid prompt: too short'), 'non_retryable');
    assert.equal(classifyError('authentication failed'), 'non_retryable');
    assert.equal(classifyError('requires imageUrl (i2v)'), 'non_retryable');
    assert.equal(classifyError('insufficient credits'), 'non_retryable');
});

test('classifyError flags timeouts and 429 as retryable', () => {
    assert.equal(classifyError('Request timeout'), 'retryable');
    assert.equal(classifyError('429 Too Many Requests'), 'retryable');
    assert.equal(classifyError('fetch failed'), 'retryable');
    assert.equal(classifyError('econnreset'), 'retryable');
});

// ── Chain with mocks ─────────────────────────────────────────────────────
function makeMockProvider(
    id: string,
    enabled: boolean,
    generateImpl: (i: VideoGenInput) => Promise<{ id: string }>,
): VideoProvider {
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
        async generate(i: VideoGenInput) {
            const out = await generateImpl(i);
            return {
                externalJobId: out.id,
                providerId: id,
                startedAt: new Date().toISOString(),
            };
        },
        async pollStatus(eid: string) {
            return { externalJobId: eid, state: 'processing' };
        },
        async cancel() { /* noop */ },
    };
}

// Snapshot of the original providers so we can restore them after each
// test that mutates the registry via registerVideoProvider.
const originalRegistry: Record<string, VideoProvider> = {
    wan: wanProvider,
    kling: klingProvider,
    veo: veoProvider,
};

function withMockedProviders<T>(
    mocks: VideoProvider[],
    fn: () => Promise<T>,
): Promise<T> {
    for (const m of mocks) registerVideoProvider(m);
    return fn().finally(() => {
        for (const id of Object.keys(mocks)) {
            const orig = originalRegistry[id];
            if (orig) registerVideoProvider(orig);
        }
    });
}

test('chain: primary succeeds → fallback never invoked', async () => {
    let fallbackCalls = 0;
    const wanM = makeMockProvider('wan', true, async () => ({ id: 'wan_ok' }));
    const klingM = makeMockProvider('kling', true, async () => {
        fallbackCalls++;
        return { id: 'kling_ok' };
    });
    await withMockedProviders([wanM, klingM], async () => {
        const result = await runChain(
            { prompt: 'p', imageUrl: 'https://x', aspectRatio: '9:16', durationSec: 5 },
            { chain: [{ providerId: 'wan', retries: 1 }, { providerId: 'kling', retries: 1 }] },
        );
        assert.equal(fallbackCalls, 0);
        assert.equal(result.failedAll, false);
        assert.equal(result.handle?.providerId, 'wan');
    });
});

test('chain: primary fails → fallback invoked', async () => {
    let fallbackCalls = 0;
    const wanM = makeMockProvider('wan', true, async () => { throw new Error('timeout'); });
    const klingM = makeMockProvider('kling', true, async () => {
        fallbackCalls++;
        return { id: 'kling_ok' };
    });
    await withMockedProviders([wanM, klingM], async () => {
        const result = await runChain(
            { prompt: 'p', imageUrl: 'https://x', aspectRatio: '9:16', durationSec: 5 },
            { chain: [{ providerId: 'wan', retries: 1 }, { providerId: 'kling', retries: 1 }] },
        );
        assert.equal(fallbackCalls, 1);
        assert.equal(result.failedAll, false);
        assert.equal(result.handle?.providerId, 'kling');
    });
});

test('chain: non-retryable error short-circuits the chain', async () => {
    let fallbackCalls = 0;
    const wanM = makeMockProvider('wan', true, async () => {
        throw new Error('invalid prompt: too short');
    });
    const klingM = makeMockProvider('kling', true, async () => {
        fallbackCalls++;
        return { id: 'kling_ok' };
    });
    await withMockedProviders([wanM, klingM], async () => {
        const result = await runChain(
            { prompt: 'p', imageUrl: 'https://x', aspectRatio: '9:16', durationSec: 5 },
            { chain: [{ providerId: 'wan', retries: 1 }, { providerId: 'kling', retries: 1 }] },
        );
        assert.equal(fallbackCalls, 0, 'fallback must NOT be called for non-retryable errors');
        assert.equal(result.failedAll, true);
    });
});

test('chain: all providers fail → failedAll=true and attempts logged', async () => {
    const wanM = makeMockProvider('wan', true, async () => { throw new Error('timeout'); });
    const klingM = makeMockProvider('kling', true, async () => { throw new Error('network'); });
    await withMockedProviders([wanM, klingM], async () => {
        const result = await runChain(
            { prompt: 'p', imageUrl: 'https://x', aspectRatio: '9:16', durationSec: 5 },
            { chain: [{ providerId: 'wan', retries: 1 }, { providerId: 'kling', retries: 1 }] },
        );
        assert.equal(result.failedAll, true);
        assert.equal(result.attempts.length, 2);
    });
});

// ── bootstrap: registration only. The shared runner (tests/run.js)
//    triggers `run()` after all test files have been loaded.
export {};
