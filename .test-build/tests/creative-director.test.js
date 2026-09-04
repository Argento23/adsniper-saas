"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const harness_1 = require("./harness");
// ── imports under test ──────────────────────────────────────────────────
const creative_director_1 = require("../lib/creative-director");
const storyboard_generator_1 = require("../lib/creative-director/storyboard-generator");
const prompt_builder_1 = require("../lib/creative-director/prompt-builder");
const styles_1 = require("../lib/creative-director/styles");
// ── Brief validation ────────────────────────────────────────────────────
(0, harness_1.test)('brief: rejects empty product', () => {
    const r = (0, creative_director_1.validateBrief)({ businessName: 'X', category: 'cat', audience: 'a', cta: 'c', visualStyle: 'cinematografico' });
    strict_1.default.equal(r.ok, false);
});
(0, harness_1.test)('brief: rejects invalid duration', () => {
    const r = (0, creative_director_1.validateBrief)({
        businessName: 'X', product: 'p', category: 'cat', audience: 'a', cta: 'c',
        visualStyle: 'cinematografico', duration: 25,
    });
    strict_1.default.equal(r.ok, false);
});
(0, harness_1.test)('brief: rejects invalid objective', () => {
    const r = (0, creative_director_1.validateBrief)({
        businessName: 'X', product: 'p', category: 'cat', audience: 'a', cta: 'c',
        visualStyle: 'cinematografico', duration: 20, objective: 'invalid',
    });
    strict_1.default.equal(r.ok, false);
});
(0, harness_1.test)('brief: accepts a complete valid brief', () => {
    const r = (0, creative_director_1.validateBrief)({
        businessName: 'Cafe X', product: 'Cafe de origen', category: 'Gastronomia',
        objective: 'ventas',
        audience: 'Jovenes urbanos', platform: 'reels', duration: 20,
        visualStyle: 'cinematografico', language: 'es-AR', cta: 'Compra online',
    });
    strict_1.default.equal(r.ok, true);
    if (r.ok)
        strict_1.default.equal(r.value.duration, 20);
});
(0, harness_1.test)('brief: rejects non es-AR language', () => {
    const r = (0, creative_director_1.validateBrief)({
        businessName: 'X', product: 'p', category: 'cat', audience: 'a', cta: 'c',
        visualStyle: 'cinematografico', duration: 20, language: 'en-US',
    });
    strict_1.default.equal(r.ok, false);
});
// ── Storyboard plan ─────────────────────────────────────────────────────
(0, harness_1.test)('plan 15s → 4 scenes summing to 15s', () => {
    const plan = (0, storyboard_generator_1.planStoryboard)(15);
    strict_1.default.equal(plan.slots.length, 4);
    const sum = plan.slots.reduce((s, x) => s + x.durationSec, 0);
    strict_1.default.equal(sum, 15);
});
(0, harness_1.test)('plan 20s → 4 scenes summing to 20s', () => {
    const plan = (0, storyboard_generator_1.planStoryboard)(20);
    strict_1.default.equal(plan.slots.length, 4);
    const sum = plan.slots.reduce((s, x) => s + x.durationSec, 0);
    strict_1.default.equal(sum, 20);
});
(0, harness_1.test)('plan 30s → 6 scenes summing to 30s', () => {
    const plan = (0, storyboard_generator_1.planStoryboard)(30);
    strict_1.default.equal(plan.slots.length, 6);
    const sum = plan.slots.reduce((s, x) => s + x.durationSec, 0);
    strict_1.default.equal(sum, 30);
});
(0, harness_1.test)('plan 20s contains the four required roles', () => {
    const plan = (0, storyboard_generator_1.planStoryboard)(20);
    const roles = plan.slots.map(s => s.role);
    strict_1.default.ok(roles.includes('hook'));
    strict_1.default.ok(roles.includes('producto'));
    strict_1.default.ok(roles.includes('beneficio'));
    strict_1.default.ok(roles.includes('cta'));
});
(0, harness_1.test)('plan 30s adds storytelling and prueba-social', () => {
    const plan = (0, storyboard_generator_1.planStoryboard)(30);
    const roles = plan.slots.map(s => s.role);
    strict_1.default.ok(roles.includes('storytelling'));
    strict_1.default.ok(roles.includes('prueba-social'));
});
// ── Style presets ───────────────────────────────────────────────────────
(0, harness_1.test)('style: every preset has required visual tokens', () => {
    const presets = (0, styles_1.listStylePresets)();
    strict_1.default.ok(presets.length >= 8);
    for (const p of presets) {
        strict_1.default.ok(p.lighting.length > 0, `${p.id} missing lighting`);
        strict_1.default.ok(p.lens.length > 0, `${p.id} missing lens`);
        strict_1.default.ok(p.colorGrade.length > 0, `${p.id} missing colorGrade`);
        strict_1.default.ok(p.realismLevel.length > 0, `${p.id} missing realismLevel`);
    }
});
(0, harness_1.test)('style: getStylePreset falls back to cinematografico for unknown id', () => {
    const s = styles_1.STYLE_PRESETS['unknown-id'];
    strict_1.default.equal(s, undefined);
    const { getStylePreset } = require('../lib/creative-director/styles');
    const fallback = getStylePreset('unknown-id');
    strict_1.default.equal(fallback.id, 'cinematografico');
});
// ── Prompt Builder ──────────────────────────────────────────────────────
(0, harness_1.test)('prompt builder: includes product, brand, and style tokens', () => {
    const { visualPrompt, negativePrompt } = (0, prompt_builder_1.buildVisualPrompt)({
        product: 'hamburguesa gourmet',
        businessName: 'Burger Lab',
        styleId: 'cinematografico',
        slot: 'producto',
    });
    strict_1.default.ok(visualPrompt.includes('hamburguesa gourmet'));
    strict_1.default.ok(visualPrompt.includes('Burger Lab'));
    strict_1.default.ok(visualPrompt.toLowerCase().includes('cinematic'));
    strict_1.default.ok(negativePrompt.length > 0);
});
(0, harness_1.test)('prompt builder: slot hint differs between hook and cta', () => {
    const hook = (0, prompt_builder_1.buildVisualPrompt)({ product: 'p', styleId: 'cinematografico', slot: 'hook' });
    const cta = (0, prompt_builder_1.buildVisualPrompt)({ product: 'p', styleId: 'cinematografico', slot: 'cta' });
    strict_1.default.notEqual(hook.visualPrompt, cta.visualPrompt);
});
// ── Conversion SceneSpec → Scene via parseBrief (mocked Groq) ──────────
function makeMockGroq(brief) {
    return async (req) => {
        // Sanity: validate the prompt structure
        strict_1.default.equal(req.model, 'openai/gpt-oss-120b');
        strict_1.default.equal(req.messages.length, 2);
        strict_1.default.equal(req.messages[0].role, 'system');
        strict_1.default.equal(req.messages[1].role, 'user');
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
                            slots: slots.map((role) => ({
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
(0, harness_1.test)('parseBrief: produces 4 scene drafts for 20s brief', async () => {
    const brief = {
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
    const result = await (0, creative_director_1.parseBrief)(brief, makeMockGroq(brief), 'p1');
    strict_1.default.equal(result.spec.scenes.length, 4);
    strict_1.default.equal(result.scenes.length, 4);
    strict_1.default.equal(result.spec.campaignTitle.includes('Cafe X'), true);
    strict_1.default.equal(result.spec.hashtags.length >= 3, true);
    // Each scene draft has the correct shape
    for (const scene of result.scenes) {
        strict_1.default.equal(scene.projectId, 'p1');
        strict_1.default.equal(scene.status, 'prompt_ready');
        strict_1.default.ok(scene.visualPrompt.length > 0);
        strict_1.default.ok(scene.timestamps.createdAt.length > 0);
        strict_1.default.ok(scene.durationSec > 0);
        // No empty IDs (will be assigned by store on commit)
        strict_1.default.equal(scene.id, '');
    }
});
(0, harness_1.test)('parseBrief: produces 6 scene drafts for 30s brief', async () => {
    const brief = {
        businessName: 'X', product: 'p', category: 'c', objective: 'branding',
        audience: 'a', platform: 'tiktok', duration: 30,
        visualStyle: 'moda', language: 'es-AR', cta: 'c',
    };
    const result = await (0, creative_director_1.parseBrief)(brief, makeMockGroq(brief), 'p1');
    strict_1.default.equal(result.spec.scenes.length, 6);
    strict_1.default.equal(result.scenes.length, 6);
});
(0, harness_1.test)('parseBrief: scene durations sum to total duration', async () => {
    const brief = {
        businessName: 'X', product: 'p', category: 'c', objective: 'ventas',
        audience: 'a', platform: 'reels', duration: 30,
        visualStyle: 'fast-food-premium', language: 'es-AR', cta: 'c',
    };
    const result = await (0, creative_director_1.parseBrief)(brief, makeMockGroq(brief), 'p1');
    const sum = result.scenes.reduce((s, x) => s + x.durationSec, 0);
    strict_1.default.equal(sum, 30);
});
(0, harness_1.test)('parseBrief: visualPrompt differs by style preset', async () => {
    const baseBrief = {
        businessName: 'X', product: 'p', category: 'c', objective: 'ventas',
        audience: 'a', platform: 'reels', duration: 20,
        visualStyle: 'cinematografico', language: 'es-AR', cta: 'c',
    };
    const r1 = await (0, creative_director_1.parseBrief)(baseBrief, makeMockGroq(baseBrief), 'p1');
    const r2 = await (0, creative_director_1.parseBrief)({ ...baseBrief, visualStyle: 'minimalista' }, makeMockGroq(baseBrief), 'p1');
    strict_1.default.notEqual(r1.scenes[1].visualPrompt, r2.scenes[1].visualPrompt);
});
// ── LLM prompt structure ────────────────────────────────────────────────
(0, harness_1.test)('buildLlmPrompt: includes the slot list for the requested duration', () => {
    const brief = {
        businessName: 'X', product: 'p', category: 'c', objective: 'ventas',
        audience: 'a', platform: 'reels', duration: 20,
        visualStyle: 'cinematografico', language: 'es-AR', cta: 'c',
    };
    const req = (0, creative_director_1.buildLlmPrompt)(brief, [
        { role: 'hook', durationSec: 4 },
        { role: 'producto', durationSec: 5 },
        { role: 'beneficio', durationSec: 7 },
        { role: 'cta', durationSec: 4 },
    ]);
    strict_1.default.equal(req.messages[1].content.includes('hook'), true);
    strict_1.default.equal(req.messages[1].content.includes('cta'), true);
});
(0, harness_1.test)('slot titles: every defined role has a title', () => {
    for (const role of Object.keys(storyboard_generator_1.SLOT_TITLES)) {
        strict_1.default.ok(storyboard_generator_1.SLOT_TITLES[role].length > 0);
    }
});
// ── Groq model fallback (Phase 7 hotfix) ────────────────────────────────
const creative_director_2 = require("../lib/creative-director");
(0, harness_1.test)('fallback: model chain is non-empty and starts with the default', () => {
    strict_1.default.ok(creative_director_2.GROQ_MODEL_CHAIN.length >= 2);
    strict_1.default.equal(creative_director_2.GROQ_MODEL_CHAIN[0], 'openai/gpt-oss-120b');
});
(0, harness_1.test)('fallback: getGroqModelChain honours GROQ_MODEL override', () => {
    const saved = process.env.GROQ_MODEL;
    try {
        delete process.env.GROQ_MODEL;
        const def = (0, creative_director_2.getGroqModelChain)();
        strict_1.default.deepEqual(def, [...creative_director_2.GROQ_MODEL_CHAIN]);
        process.env.GROQ_MODEL = 'custom-model-x';
        const ov = (0, creative_director_2.getGroqModelChain)();
        strict_1.default.equal(ov[0], 'custom-model-x');
        // Override must be deduplicated from the fallback chain.
        strict_1.default.equal(ov.filter(m => m === 'custom-model-x').length, 1);
    }
    finally {
        if (saved === undefined)
            delete process.env.GROQ_MODEL;
        else
            process.env.GROQ_MODEL = saved;
    }
});
(0, harness_1.test)('fallback: isModelNotFoundError recognises 404 and model_not_found bodies', () => {
    strict_1.default.equal((0, creative_director_2.isModelNotFoundError)(404, '{"error":{"code":"model_not_found"}}'), true);
    strict_1.default.equal((0, creative_director_2.isModelNotFoundError)(400, '{"error":{"code":"model_not_found"}}'), true);
    strict_1.default.equal((0, creative_director_2.isModelNotFoundError)(400, '{"error":{"code":"model_not_available"}}'), true);
    // 401 (auth) is NOT a model error — must surface immediately.
    strict_1.default.equal((0, creative_director_2.isModelNotFoundError)(401, '{"error":{"code":"invalid_api_key"}}'), false);
    // 429 (rate limit) is NOT a model error.
    strict_1.default.equal((0, creative_director_2.isModelNotFoundError)(429, 'rate limit exceeded'), false);
});
(0, harness_1.test)('fallback: realGroqClientWithFallback tries the next model after 404', async () => {
    let firstSeen;
    let secondSeen;
    const fetchImpl = async (url, init) => {
        const body = JSON.parse(init.body);
        if (!firstSeen) {
            firstSeen = body.model;
            return new Response('{"error":{"code":"model_not_found"}}', { status: 404 });
        }
        secondSeen = body.model;
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const client = (0, creative_director_2.realGroqClientWithFallback)('test-key');
    // Patch global fetch to capture calls.
    const realFetch = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.fetch = fetchImpl;
    try {
        const res = await client({ model: 'ignored', messages: [] });
        strict_1.default.ok(res.choices?.[0]?.message?.content);
    }
    finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        globalThis.fetch = realFetch;
    }
    strict_1.default.equal(firstSeen, creative_director_2.GROQ_MODEL_CHAIN[0]);
    strict_1.default.equal(secondSeen, creative_director_2.GROQ_MODEL_CHAIN[1]);
});
(0, harness_1.test)('fallback: surfaces non-model errors (401) immediately', async () => {
    let attempts = 0;
    const realFetch = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.fetch = async () => {
        attempts++;
        return new Response('{"error":{"code":"invalid_api_key"}}', { status: 401 });
    };
    try {
        const client = (0, creative_director_2.realGroqClientWithFallback)('bad-key');
        await strict_1.default.rejects(() => client({ model: 'x', messages: [] }), /401/);
        strict_1.default.equal(attempts, 1, 'should NOT try other models on 401');
    }
    finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        globalThis.fetch = realFetch;
    }
});
(0, harness_1.test)('fallback: throws the last model error when all models are unavailable', async () => {
    const realFetch = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.fetch = async () => new Response('{"error":{"code":"model_not_found"}}', { status: 404 });
    try {
        const client = (0, creative_director_2.realGroqClientWithFallback)('test-key');
        await strict_1.default.rejects(() => client({ model: 'x', messages: [] }), /model_not_found/);
    }
    finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        globalThis.fetch = realFetch;
    }
});
