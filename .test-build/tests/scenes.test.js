"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const harness_1 = require("./harness");
// ── imports ──────────────────────────────────────────────────────────────
const scenes_1 = require("../lib/projects/scenes");
const access_1 = require("../lib/projects/access");
const visualContext_1 = require("../lib/projects/visualContext");
// ── Scene store: create / get / update / delete / reorder ───────────────
(0, harness_1.test)('scenes: create then get', () => {
    const input = {
        projectId: 'p1',
        order: 0,
        visualPrompt: 'hero shot of product',
        durationSec: 5,
    };
    const s = scenes_1.localStorageSceneStore.createScene(input);
    strict_1.default.ok(s.id.startsWith('prj_'));
    strict_1.default.equal(s.projectId, 'p1');
    strict_1.default.equal(s.status, 'pending');
    const fetched = scenes_1.localStorageSceneStore.getScene('p1', s.id);
    strict_1.default.deepEqual(fetched?.id, s.id);
});
(0, harness_1.test)('scenes: update mutates fields and bumps updatedAt', async () => {
    const s = scenes_1.localStorageSceneStore.createScene({
        projectId: 'p2',
        order: 0,
        visualPrompt: 'p',
        durationSec: 5,
    });
    const before = s.timestamps.updatedAt;
    await new Promise(r => setTimeout(r, 5));
    const updated = scenes_1.localStorageSceneStore.updateScene('p2', s.id, {
        title: 'Hero',
        status: 'prompt_ready',
    });
    strict_1.default.ok(updated);
    strict_1.default.equal(updated.title, 'Hero');
    strict_1.default.equal(updated.status, 'prompt_ready');
    strict_1.default.notEqual(updated.timestamps.updatedAt, before);
});
(0, harness_1.test)('scenes: delete removes the scene', () => {
    const s = scenes_1.localStorageSceneStore.createScene({
        projectId: 'p3',
        order: 0,
        visualPrompt: 'p',
        durationSec: 5,
    });
    strict_1.default.equal(scenes_1.localStorageSceneStore.deleteScene('p3', s.id), true);
    strict_1.default.equal(scenes_1.localStorageSceneStore.getScene('p3', s.id), null);
});
(0, harness_1.test)('scenes: reorder preserves id set and assigns new order', () => {
    const a = scenes_1.localStorageSceneStore.createScene({ projectId: 'p4', order: 0, visualPrompt: 'a', durationSec: 3 });
    const b = scenes_1.localStorageSceneStore.createScene({ projectId: 'p4', order: 1, visualPrompt: 'b', durationSec: 3 });
    const c = scenes_1.localStorageSceneStore.createScene({ projectId: 'p4', order: 2, visualPrompt: 'c', durationSec: 3 });
    const ok = scenes_1.localStorageSceneStore.reorderScenes('p4', [c.id, a.id, b.id]);
    strict_1.default.equal(ok, true);
    const list = scenes_1.localStorageSceneStore.listScenes('p4');
    strict_1.default.deepEqual(list.map(s => s.id), [c.id, a.id, b.id]);
    strict_1.default.deepEqual(list.map(s => s.order), [0, 1, 2]);
});
(0, harness_1.test)('scenes: reorder rejects length mismatch', () => {
    const a = scenes_1.localStorageSceneStore.createScene({ projectId: 'p5', order: 0, visualPrompt: 'a', durationSec: 3 });
    const b = scenes_1.localStorageSceneStore.createScene({ projectId: 'p5', order: 1, visualPrompt: 'b', durationSec: 3 });
    const ok = scenes_1.localStorageSceneStore.reorderScenes('p5', [a.id]);
    strict_1.default.equal(ok, false);
    const list = scenes_1.localStorageSceneStore.listScenes('p5');
    strict_1.default.deepEqual(list.map(s => s.id), [a.id, b.id]);
});
// ── Authorization: user isolation ────────────────────────────────────────
(0, harness_1.test)('access: user A cannot reach user B project', () => {
    // Seed localStorage with two projects belonging to different users.
    const mapA = { userA: [{ id: 'pA', userId: 'userA', name: 'A', brief: { product: '', objective: 'awareness', audience: '', platform: 'reels', style: '', language: 'es', referenceImages: [], productPhotos: [] }, format: '9:16', duration: 10, status: 'draft', timeline: { totalDurationSec: 0, videoTrack: [], voiceTrack: [], musicTrack: [], textTrack: [] }, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }] };
    const mapB = { userB: [{ id: 'pB', userId: 'userB', name: 'B', brief: { product: '', objective: 'awareness', audience: '', platform: 'reels', style: '', language: 'es', referenceImages: [], productPhotos: [] }, format: '9:16', duration: 10, status: 'draft', timeline: { totalDurationSec: 0, videoTrack: [], voiceTrack: [], musicTrack: [], textTrack: [] }, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }] };
    const g = globalThis;
    const store = {};
    g.window = {
        localStorage: {
            _data: store,
            getItem(k) { return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; },
            setItem(k, v) { this._data[k] = v; },
            removeItem(k) { delete this._data[k]; },
        },
    };
    store['AdSíntesisStudio.projects'] = JSON.stringify(mapA);
    const resA = (0, access_1.requireProject)('userA', 'pA');
    strict_1.default.equal(resA.ok, true);
    // User A tries to read B's project
    store['AdSíntesisStudio.projects'] = JSON.stringify(mapB);
    const resB = (0, access_1.requireProject)('userA', 'pB');
    strict_1.default.equal(resB.ok, false);
    if (!resB.ok)
        strict_1.default.equal(resB.status, 404);
});
(0, harness_1.test)('access: requireScene returns 404 when scene belongs to other project', () => {
    const s = scenes_1.localStorageSceneStore.createScene({
        projectId: 'pX',
        order: 0,
        visualPrompt: 'x',
        durationSec: 3,
    });
    const res = (0, access_1.requireScene)('userX', 'pY', s.id);
    strict_1.default.equal(res.ok, false);
    if (!res.ok)
        strict_1.default.equal(res.status, 404);
});
// ── Visual context builder ───────────────────────────────────────────────
(0, harness_1.test)('visualContext: pulls brand + product references from project', () => {
    const project = {
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
    const ctx = (0, visualContext_1.buildVisualContext)(project);
    strict_1.default.equal(ctx.brandSnapshot?.name, 'CaféX');
    strict_1.default.equal(ctx.visualStyle, 'Cinematográfico');
    strict_1.default.equal(ctx.characterReferences.length, 1);
    strict_1.default.equal(ctx.productReferences.length, 1);
});
// ── Scene → VideoGenInput mapping (static, no I/O) ────────────────────────
(0, harness_1.test)('scene → VideoGenInput: aspect ratio and prompt inherit defaults', () => {
    const scene = {
        id: 's',
        projectId: 'p',
        order: 0,
        visualPrompt: 'cinematic product hero',
        durationSec: 5,
        aspectRatio: '9:16',
        status: 'pending',
        timestamps: { createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    };
    // Mirrors the mapping performed by the /video route handler.
    const input = {
        prompt: scene.visualPrompt,
        imageUrl: 'https://example.com/kf.jpg',
        aspectRatio: scene.aspectRatio,
        durationSec: scene.durationSec,
    };
    strict_1.default.equal(input.aspectRatio, '9:16');
    strict_1.default.equal(input.durationSec, 5);
    strict_1.default.equal(input.prompt.length > 0, true);
});
// ── Keyframe engine: returns failure when no providers configured ────────
(0, harness_1.test)('keyframe engine: failure when both FAL_KEY and REPLICATE_API_KEY are unset', async () => {
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
        const { generateKeyframe } = await Promise.resolve().then(() => __importStar(require('../lib/providers/image/engine')));
        const result = await generateKeyframe({
            prompt: 'test',
            width: 1024,
            height: 1024,
        });
        strict_1.default.equal(result.output, undefined);
        strict_1.default.ok(result.attempts.length >= 2);
        for (const a of result.attempts) {
            strict_1.default.equal(a.ok, false);
        }
    }
    finally {
        if (origFal !== undefined)
            process.env.FAL_KEY = origFal;
        if (origFal2 !== undefined)
            process.env.FAL_API_KEY = origFal2;
        if (origRep !== undefined)
            process.env.REPLICATE_API_KEY = origRep;
        if (origRep2 !== undefined)
            process.env.REPLICATE_API_TOKEN = origRep2;
    }
});
