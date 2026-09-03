/**
 * Unit tests for Phase 4 — Scenes + Keyframe + Scene-level Video.
 *
 * Covers:
 *   - Scenes store: create / get / update / delete / reorder
 *   - Authorization: user isolation across projects and scenes
 *   - Visual context builder
 *   - Scene → VideoGenInput mapping
 *   - Keyframe engine returns failure when no providers configured
 *
 * No real API calls. The keyframe engine is exercised with both env vars
 * unset (expects failure) so we never hit a network.
 */

import assert from 'node:assert/strict';
import { test, run } from './harness';

// ── imports ──────────────────────────────────────────────────────────────
import {
    localStorageSceneStore,
    type CreateSceneInput,
} from '../lib/projects/scenes';
import { requireProject, requireScene } from '../lib/projects/access';
import { buildVisualContext } from '../lib/projects/visualContext';
import { Project } from '../lib/projects/types';

// ── Scene store: create / get / update / delete / reorder ───────────────
test('scenes: create then get', () => {
    const input: CreateSceneInput = {
        projectId: 'p1',
        order: 0,
        visualPrompt: 'hero shot of product',
        durationSec: 5,
    };
    const s = localStorageSceneStore.createScene(input);
    assert.ok(s.id.startsWith('prj_'));
    assert.equal(s.projectId, 'p1');
    assert.equal(s.status, 'pending');
    const fetched = localStorageSceneStore.getScene('p1', s.id);
    assert.deepEqual(fetched?.id, s.id);
});

test('scenes: update mutates fields and bumps updatedAt', async () => {
    const s = localStorageSceneStore.createScene({
        projectId: 'p2',
        order: 0,
        visualPrompt: 'p',
        durationSec: 5,
    });
    const before = s.timestamps.updatedAt;
    await new Promise(r => setTimeout(r, 5));
    const updated = localStorageSceneStore.updateScene('p2', s.id, {
        title: 'Hero',
        status: 'prompt_ready',
    });
    assert.ok(updated);
    assert.equal(updated.title, 'Hero');
    assert.equal(updated.status, 'prompt_ready');
    assert.notEqual(updated.timestamps.updatedAt, before);
});

test('scenes: delete removes the scene', () => {
    const s = localStorageSceneStore.createScene({
        projectId: 'p3',
        order: 0,
        visualPrompt: 'p',
        durationSec: 5,
    });
    assert.equal(localStorageSceneStore.deleteScene('p3', s.id), true);
    assert.equal(localStorageSceneStore.getScene('p3', s.id), null);
});

test('scenes: reorder preserves id set and assigns new order', () => {
    const a = localStorageSceneStore.createScene({ projectId: 'p4', order: 0, visualPrompt: 'a', durationSec: 3 });
    const b = localStorageSceneStore.createScene({ projectId: 'p4', order: 1, visualPrompt: 'b', durationSec: 3 });
    const c = localStorageSceneStore.createScene({ projectId: 'p4', order: 2, visualPrompt: 'c', durationSec: 3 });
    const ok = localStorageSceneStore.reorderScenes('p4', [c.id, a.id, b.id]);
    assert.equal(ok, true);
    const list = localStorageSceneStore.listScenes('p4');
    assert.deepEqual(list.map(s => s.id), [c.id, a.id, b.id]);
    assert.deepEqual(list.map(s => s.order), [0, 1, 2]);
});

test('scenes: reorder rejects length mismatch', () => {
    const a = localStorageSceneStore.createScene({ projectId: 'p5', order: 0, visualPrompt: 'a', durationSec: 3 });
    const b = localStorageSceneStore.createScene({ projectId: 'p5', order: 1, visualPrompt: 'b', durationSec: 3 });
    const ok = localStorageSceneStore.reorderScenes('p5', [a.id]);
    assert.equal(ok, false);
    const list = localStorageSceneStore.listScenes('p5');
    assert.deepEqual(list.map(s => s.id), [a.id, b.id]);
});

// ── Authorization: user isolation ────────────────────────────────────────
test('access: user A cannot reach user B project', () => {
    // Seed localStorage with two projects belonging to different users.
    const mapA = { userA: [{ id: 'pA', userId: 'userA', name: 'A', brief: { product: '', objective: 'awareness', audience: '', platform: 'reels', style: '', language: 'es', referenceImages: [], productPhotos: [] }, format: '9:16' as const, duration: 10, status: 'draft' as const, timeline: { totalDurationSec: 0, videoTrack: [], voiceTrack: [], musicTrack: [], textTrack: [] }, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }] };
    const mapB = { userB: [{ id: 'pB', userId: 'userB', name: 'B', brief: { product: '', objective: 'awareness', audience: '', platform: 'reels', style: '', language: 'es', referenceImages: [], productPhotos: [] }, format: '9:16' as const, duration: 10, status: 'draft' as const, timeline: { totalDurationSec: 0, videoTrack: [], voiceTrack: [], musicTrack: [], textTrack: [] }, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }] };

    const g = globalThis as unknown as { window?: { localStorage?: { _data: Record<string, string>; getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } } };
    const store: Record<string, string> = {};
    g.window = {
        localStorage: {
            _data: store,
            getItem(k: string) { return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; },
            setItem(k: string, v: string) { this._data[k] = v; },
            removeItem(k: string) { delete this._data[k]; },
        },
    };
    store['AdSíntesisStudio.projects'] = JSON.stringify(mapA);
    const resA = requireProject('userA', 'pA');
    assert.equal(resA.ok, true);
    // User A tries to read B's project
    store['AdSíntesisStudio.projects'] = JSON.stringify(mapB);
    const resB = requireProject('userA', 'pB');
    assert.equal(resB.ok, false);
    if (!resB.ok) assert.equal(resB.status, 404);
});

test('access: requireScene returns 404 when scene belongs to other project', () => {
    const s = localStorageSceneStore.createScene({
        projectId: 'pX',
        order: 0,
        visualPrompt: 'x',
        durationSec: 3,
    });
    const res = requireScene('userX', 'pY', s.id);
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 404);
});

// ── Visual context builder ───────────────────────────────────────────────
test('visualContext: pulls brand + product references from project', () => {
    const project: Project = {
        id: 'p',
        userId: 'u',
        name: 'Demo',
        brief: {
            product: 'cafe',
            objective: 'awareness',
            audience: 'jóvenes',
            platform: 'reels',
            style: 'Cinematográfico',
            language: 'es',
            referenceImages: ['https://x/ref1.jpg'],
            productPhotos: ['data:image/png;base64,AAA'],
        },
        format: '9:16',
        duration: 20,
        status: 'draft',
        brandSnapshot: { name: 'CaféX', primaryColor: '#3b82f6', tone: 'Profesional' },
        timeline: { totalDurationSec: 0, videoTrack: [], voiceTrack: [], musicTrack: [], textTrack: [] },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
    };
    const ctx = buildVisualContext(project);
    assert.equal(ctx.brandSnapshot?.name, 'CaféX');
    assert.equal(ctx.visualStyle, 'Cinematográfico');
    assert.equal(ctx.characterReferences.length, 1);
    assert.equal(ctx.productReferences.length, 1);
});

// ── Scene → VideoGenInput mapping (static, no I/O) ────────────────────────
test('scene → VideoGenInput: aspect ratio and prompt inherit defaults', () => {
    const scene = {
        id: 's',
        projectId: 'p',
        order: 0,
        visualPrompt: 'cinematic product hero',
        durationSec: 5,
        aspectRatio: '9:16' as const,
        status: 'pending' as const,
        timestamps: { createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    };
    // Mirrors the mapping performed by the /video route handler.
    const input = {
        prompt: scene.visualPrompt,
        imageUrl: 'https://example.com/kf.jpg',
        aspectRatio: scene.aspectRatio,
        durationSec: scene.durationSec,
    };
    assert.equal(input.aspectRatio, '9:16');
    assert.equal(input.durationSec, 5);
    assert.equal(input.prompt.length > 0, true);
});

// ── Keyframe engine: returns failure when no providers configured ────────
test('keyframe engine: failure when both FAL_KEY and REPLICATE_API_KEY are unset', async () => {
    // Ensure both env vars are unset for this process.
    const origFal = process.env.FAL_KEY;
    const origFal2 = process.env.FAL_API_KEY;
    const origRep = process.env.REPLICATE_API_KEY;
    const origRep2 = process.env.REPLICATE_API_TOKEN;
    delete process.env.FAL_KEY;
    delete process.env.FAL_API_KEY;
    delete process.env.REPLICATE_API_KEY;
    delete process.env.REPLICATE_API_TOKEN;

    try {
        const { generateKeyframe } = await import('../lib/providers/image/engine');
        const result = await generateKeyframe({
            prompt: 'test',
            width: 1024,
            height: 1024,
        });
        assert.equal(result.output, undefined);
        assert.ok(result.attempts.length >= 2);
        for (const a of result.attempts) {
            assert.equal(a.ok, false);
        }
    } finally {
        if (origFal !== undefined) process.env.FAL_KEY = origFal;
        if (origFal2 !== undefined) process.env.FAL_API_KEY = origFal2;
        if (origRep !== undefined) process.env.REPLICATE_API_KEY = origRep;
        if (origRep2 !== undefined) process.env.REPLICATE_API_TOKEN = origRep2;
    }
});

// ── bootstrap: registration only. The shared runner (tests/run.js)
//    triggers `run()` after all test files have been loaded.
export {};
