/**
 * Unit tests for Phase 5 — Creative Director IA.
 *
 * Covers:
 *   - Brief validation
 *   - Storyboard plan for 15/20/30 seconds (scene count + slot distribution)
 *   - Prompt Builder (style application, slot-specific hints)
 *   - Style presets registry
 *   - Conversion SceneSpec → Scene (via parseBrief with mocked Groq)
 *   - Payload validation (missing fields, invalid enum values)
 *
 * No real network calls. Groq client is mocked.
 */

import assert from 'node:assert/strict';
import { test, run } from './harness';

// ── imports under test ──────────────────────────────────────────────────
import {
    validateBrief,
    parseBrief,
    buildLlmPrompt,
    type GroqClient,
} from '../lib/creative-director';
import { planStoryboard, SLOT_TITLES } from '../lib/creative-director/storyboard-generator';
import { buildVisualPrompt } from '../lib/creative-director/prompt-builder';
import { listStylePresets, STYLE_PRESETS } from '../lib/creative-director/styles';
import { CreativeBrief } from '../lib/creative-director/types';

// ── Brief validation ────────────────────────────────────────────────────
test('brief: rejects empty product', () => {
    const r = validateBrief({ businessName: 'X', category: 'cat', audience: 'a', cta: 'c', visualStyle: 'cinematografico' });
    assert.equal(r.ok, false);
});

test('brief: rejects invalid duration', () => {
    const r = validateBrief({
        businessName: 'X', product: 'p', category: 'cat', audience: 'a', cta: 'c',
        visualStyle: 'cinematografico', duration: 25,
    });
    assert.equal(r.ok, false);
});

test('brief: rejects invalid objective', () => {
    const r = validateBrief({
        businessName: 'X', product: 'p', category: 'cat', audience: 'a', cta: 'c',
        visualStyle: 'cinematografico', duration: 20, objective: 'invalid',
    });
    assert.equal(r.ok, false);
});

test('brief: accepts a complete valid brief', () => {
    const r = validateBrief({
        businessName: 'Cafe X', product: 'Cafe de origen', category: 'Gastronomia',
        objective: 'ventas',
        audience: 'Jovenes urbanos', platform: 'reels', duration: 20,
        visualStyle: 'cinematografico', language: 'es-AR', cta: 'Compra online',
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.duration, 20);
});

test('brief: rejects non es-AR language', () => {
    const r = validateBrief({
        businessName: 'X', product: 'p', category: 'cat', audience: 'a', cta: 'c',
        visualStyle: 'cinematografico', duration: 20, language: 'en-US',
    });
    assert.equal(r.ok, false);
});

// ── Storyboard plan ─────────────────────────────────────────────────────
test('plan 15s → 4 scenes summing to 15s', () => {
    const plan = planStoryboard(15);
    assert.equal(plan.slots.length, 4);
    const sum = plan.slots.reduce((s, x) => s + x.durationSec, 0);
    assert.equal(sum, 15);
});

test('plan 20s → 4 scenes summing to 20s', () => {
    const plan = planStoryboard(20);
    assert.equal(plan.slots.length, 4);
    const sum = plan.slots.reduce((s, x) => s + x.durationSec, 0);
    assert.equal(sum, 20);
});

test('plan 30s → 6 scenes summing to 30s', () => {
    const plan = planStoryboard(30);
    assert.equal(plan.slots.length, 6);
    const sum = plan.slots.reduce((s, x) => s + x.durationSec, 0);
    assert.equal(sum, 30);
});

test('plan 20s contains the four required roles', () => {
    const plan = planStoryboard(20);
    const roles = plan.slots.map(s => s.role);
    assert.ok(roles.includes('hook'));
    assert.ok(roles.includes('producto'));
    assert.ok(roles.includes('beneficio'));
    assert.ok(roles.includes('cta'));
});

test('plan 30s adds storytelling and prueba-social', () => {
    const plan = planStoryboard(30);
    const roles = plan.slots.map(s => s.role);
    assert.ok(roles.includes('storytelling'));
    assert.ok(roles.includes('prueba-social'));
});

// ── Style presets ───────────────────────────────────────────────────────
test('style: every preset has required visual tokens', () => {
    const presets = listStylePresets();
    assert.ok(presets.length >= 8);
    for (const p of presets) {
        assert.ok(p.lighting.length > 0, `${p.id} missing lighting`);
        assert.ok(p.lens.length > 0, `${p.id} missing lens`);
        assert.ok(p.colorGrade.length > 0, `${p.id} missing colorGrade`);
        assert.ok(p.realismLevel.length > 0, `${p.id} missing realismLevel`);
    }
});

test('style: getStylePreset falls back to cinematografico for unknown id', () => {
    const s = STYLE_PRESETS['unknown-id'];
    assert.equal(s, undefined);
    const { getStylePreset } = require('../lib/creative-director/styles');
    const fallback = getStylePreset('unknown-id');
    assert.equal(fallback.id, 'cinematografico');
});

// ── Prompt Builder ──────────────────────────────────────────────────────
test('prompt builder: includes product, brand, and style tokens', () => {
    const { visualPrompt, negativePrompt } = buildVisualPrompt({
        product: 'hamburguesa gourmet',
        businessName: 'Burger Lab',
        styleId: 'cinematografico',
        slot: 'producto',
    });
    assert.ok(visualPrompt.includes('hamburguesa gourmet'));
    assert.ok(visualPrompt.includes('Burger Lab'));
    assert.ok(visualPrompt.toLowerCase().includes('cinematic'));
    assert.ok(negativePrompt.length > 0);
});

test('prompt builder: slot hint differs between hook and cta', () => {
    const hook = buildVisualPrompt({ product: 'p', styleId: 'cinematografico', slot: 'hook' });
    const cta = buildVisualPrompt({ product: 'p', styleId: 'cinematografico', slot: 'cta' });
    assert.notEqual(hook.visualPrompt, cta.visualPrompt);
});

// ── Conversion SceneSpec → Scene via parseBrief (mocked Groq) ──────────
function makeMockGroq(brief: CreativeBrief): GroqClient {
    return async (req) => {
        // Sanity: validate the prompt structure
        assert.equal(req.model, 'llama-3.3-70b-versatile');
        assert.equal(req.messages.length, 2);
        assert.equal(req.messages[0].role, 'system');
        assert.equal(req.messages[1].role, 'user');
        const slots = (req.messages[1].content.match(/role="(\w+)"/g) ?? []).map(s => s.replace(/role="|"/g, ''));

        return {
            choices: [{
                message: {
                    content: JSON.stringify({
                        concept: 'Mostrar el producto como un objeto premium en movimiento.',
                        hook: 'Detenete: esto cambia todo.',
                        campaignTitle: brief.businessName + ' · Hero',
                        narrative: 'Un recorrido visual que lleva al espectador del asombro al deseo hasta la compra.',
                        caption: 'Probá ' + brief.product + '. Link en bio.',
                        hashtags: ['cafe', 'premium', 'foodie', 'argentina', 'reels'],
                        slots: slots.map((role: string) => ({
                            role,
                            onScreenText: `${role} text`,
                            voiceover: `Locución de ${role}`,
                            narrative: `Contexto visual para ${role}`,
                        })),
                    }),
                },
            }],
        };
    };
}

test('parseBrief: produces 4 scene drafts for 20s brief', async () => {
    const brief: CreativeBrief = {
        businessName: 'Cafe X',
        product: 'Cafe de origen',
        category: 'Gastronomia',
        objective: 'ventas',
        audience: 'Jovenes urbanos 18-35',
        platform: 'reels',
        duration: 20,
        visualStyle: 'cinematografico',
        language: 'es-AR',
        cta: 'Compra online',
    };
    const result = await parseBrief(brief, makeMockGroq(brief), 'p1');
    assert.equal(result.spec.scenes.length, 4);
    assert.equal(result.scenes.length, 4);
    assert.equal(result.spec.campaignTitle.includes('Cafe X'), true);
    assert.equal(result.spec.hashtags.length >= 3, true);

    // Each scene draft has the correct shape
    for (const scene of result.scenes) {
        assert.equal(scene.projectId, 'p1');
        assert.equal(scene.status, 'prompt_ready');
        assert.ok(scene.visualPrompt.length > 0);
        assert.ok(scene.timestamps.createdAt.length > 0);
        assert.ok(scene.durationSec > 0);
        // No empty IDs (will be assigned by store on commit)
        assert.equal(scene.id, '');
    }
});

test('parseBrief: produces 6 scene drafts for 30s brief', async () => {
    const brief: CreativeBrief = {
        businessName: 'X', product: 'p', category: 'c', objective: 'branding',
        audience: 'a', platform: 'tiktok', duration: 30,
        visualStyle: 'moda', language: 'es-AR', cta: 'c',
    };
    const result = await parseBrief(brief, makeMockGroq(brief), 'p1');
    assert.equal(result.spec.scenes.length, 6);
    assert.equal(result.scenes.length, 6);
});

test('parseBrief: scene durations sum to total duration', async () => {
    const brief: CreativeBrief = {
        businessName: 'X', product: 'p', category: 'c', objective: 'ventas',
        audience: 'a', platform: 'reels', duration: 30,
        visualStyle: 'fast-food-premium', language: 'es-AR', cta: 'c',
    };
    const result = await parseBrief(brief, makeMockGroq(brief), 'p1');
    const sum = result.scenes.reduce((s, x) => s + x.durationSec, 0);
    assert.equal(sum, 30);
});

test('parseBrief: visualPrompt differs by style preset', async () => {
    const baseBrief: CreativeBrief = {
        businessName: 'X', product: 'p', category: 'c', objective: 'ventas',
        audience: 'a', platform: 'reels', duration: 20,
        visualStyle: 'cinematografico', language: 'es-AR', cta: 'c',
    };
    const r1 = await parseBrief(baseBrief, makeMockGroq(baseBrief), 'p1');
    const r2 = await parseBrief({ ...baseBrief, visualStyle: 'minimalista' }, makeMockGroq(baseBrief), 'p1');
    assert.notEqual(r1.scenes[1].visualPrompt, r2.scenes[1].visualPrompt);
});

// ── LLM prompt structure ────────────────────────────────────────────────
test('buildLlmPrompt: includes the slot list for the requested duration', () => {
    const brief: CreativeBrief = {
        businessName: 'X', product: 'p', category: 'c', objective: 'ventas',
        audience: 'a', platform: 'reels', duration: 20,
        visualStyle: 'cinematografico', language: 'es-AR', cta: 'c',
    };
    const req = buildLlmPrompt(brief, [
        { role: 'hook', durationSec: 4 },
        { role: 'producto', durationSec: 5 },
        { role: 'beneficio', durationSec: 7 },
        { role: 'cta', durationSec: 4 },
    ]);
    assert.equal(req.messages[1].content.includes('hook'), true);
    assert.equal(req.messages[1].content.includes('cta'), true);
});

test('slot titles: every defined role has a title', () => {
    for (const role of Object.keys(SLOT_TITLES)) {
        assert.ok(SLOT_TITLES[role as keyof typeof SLOT_TITLES].length > 0);
    }
});

// ── Groq model fallback (Phase 7 hotfix) ────────────────────────────────

import {
    GROQ_MODEL_CHAIN,
    getGroqModelChain,
    isModelNotFoundError,
    realGroqClientWithFallback,
} from '../lib/creative-director';

test('fallback: model chain is non-empty and starts with the default', () => {
    assert.ok(GROQ_MODEL_CHAIN.length >= 2);
    assert.equal(GROQ_MODEL_CHAIN[0], 'llama-3.3-70b-versatile');
});

test('fallback: getGroqModelChain honours GROQ_MODEL override', () => {
    const saved = process.env.GROQ_MODEL;
    try {
        delete process.env.GROQ_MODEL;
        const def = getGroqModelChain();
        assert.deepEqual(def, [...GROQ_MODEL_CHAIN]);

        process.env.GROQ_MODEL = 'custom-model-x';
        const ov = getGroqModelChain();
        assert.equal(ov[0], 'custom-model-x');
        // Override must be deduplicated from the fallback chain.
        assert.equal(ov.filter(m => m === 'custom-model-x').length, 1);
    } finally {
        if (saved === undefined) delete process.env.GROQ_MODEL;
        else process.env.GROQ_MODEL = saved;
    }
});

test('fallback: isModelNotFoundError recognises 404 and model_not_found bodies', () => {
    assert.equal(isModelNotFoundError(404, '{"error":{"code":"model_not_found"}}'), true);
    assert.equal(isModelNotFoundError(400, '{"error":{"code":"model_not_found"}}'), true);
    assert.equal(isModelNotFoundError(400, '{"error":{"code":"model_not_available"}}'), true);
    // 401 (auth) is NOT a model error — must surface immediately.
    assert.equal(isModelNotFoundError(401, '{"error":{"code":"invalid_api_key"}}'), false);
    // 429 (rate limit) is NOT a model error.
    assert.equal(isModelNotFoundError(429, 'rate limit exceeded'), false);
});

test('fallback: realGroqClientWithFallback tries the next model after 404', async () => {
    let firstSeen: string | undefined;
    let secondSeen: string | undefined;
    const fetchImpl = async (url: string, init: { body: string }) => {
        const body = JSON.parse(init.body) as { model: string };
        if (!firstSeen) {
            firstSeen = body.model;
            return new Response('{"error":{"code":"model_not_found"}}', { status: 404 });
        }
        secondSeen = body.model;
        return new Response(
            JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
    };
    const client = realGroqClientWithFallback('test-key');
    // Patch global fetch to capture calls.
    const realFetch = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchImpl;
    try {
        const res = await client({ model: 'ignored', messages: [] });
        assert.ok(res.choices?.[0]?.message?.content);
    } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).fetch = realFetch;
    }
    assert.equal(firstSeen, GROQ_MODEL_CHAIN[0]);
    assert.equal(secondSeen, GROQ_MODEL_CHAIN[1]);
});

test('fallback: surfaces non-model errors (401) immediately', async () => {
    let attempts = 0;
    const realFetch = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () => {
        attempts++;
        return new Response('{"error":{"code":"invalid_api_key"}}', { status: 401 });
    };
    try {
        const client = realGroqClientWithFallback('bad-key');
        await assert.rejects(
            () => client({ model: 'x', messages: [] }),
            /401/,
        );
        assert.equal(attempts, 1, 'should NOT try other models on 401');
    } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).fetch = realFetch;
    }
});

test('fallback: throws the last model error when all models are unavailable', async () => {
    const realFetch = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = async () =>
        new Response('{"error":{"code":"model_not_found"}}', { status: 404 });
    try {
        const client = realGroqClientWithFallback('test-key');
        await assert.rejects(
            () => client({ model: 'x', messages: [] }),
            /model_not_found/,
        );
    } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).fetch = realFetch;
    }
});

// Test registration only. Real execution is driven by tests/run.js.
export {};
