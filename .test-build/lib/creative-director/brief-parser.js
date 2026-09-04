"use strict";
/**
 * Brief parser — orchestrates the Creative Director pipeline.
 *
 * Steps:
 *   1. Validate the brief (objective, platform, duration, language, product).
 *   2. Plan the storyboard slots (deterministic).
 *   3. Ask Groq ONLY for narrative content: concept, hook, campaign title,
 *      per-slot narrative + on-screen text + voiceover, caption, hashtags.
 *   4. Build the visual prompts deterministically via the Prompt Builder.
 *   5. Map each `SceneSpec` into the existing `Scene` shape so the user
 *      can review/edit before any generation kicks off.
 *
 * The Groq client is injectable to enable deterministic unit tests.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_DURATIONS = exports.VALID_PLATFORMS = exports.VALID_OBJECTIVES = exports.GROQ_MODEL_CHAIN = exports.DEFAULT_GROQ_MODEL = void 0;
exports.getGroqModelChain = getGroqModelChain;
exports.validateBrief = validateBrief;
exports.realGroqClient = realGroqClient;
exports.isModelNotFoundError = isModelNotFoundError;
exports.realGroqClientWithFallback = realGroqClientWithFallback;
exports.buildLlmPrompt = buildLlmPrompt;
exports.parseBrief = parseBrief;
const prompt_builder_1 = require("./prompt-builder");
const storyboard_generator_1 = require("./storyboard-generator");
/**
 * First model tried. Kept as a constant for test assertions and
 * backward compatibility — runtime callers should use
 * `getGroqModelChain()` which includes fallbacks.
 */
exports.DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';
/**
 * Ordered list of Groq models to try when a call to the previous
 * one fails with a model-not-found / not-authorized error (HTTP
 * 404 or 400 with `code: "model_not_found"`). The first entry is
 * the preferred one; later entries are progressively smaller /
 * more widely available.
 *
 * History:
 *   - Groq deprecated all `llama-3.x-*` and `mixtral-*` models.
 *   - Current lineup (as of 2025+): `openai/gpt-oss-*`,
 *     `groq/compound*`, `qwen/qwen3.*`, `meta-llama/llama-prompt-guard-*`,
 *     `whisper-*` (ASR), `allam-2-7b` (deprecated soon).
 *
 * Update this when Groq deprecates a model — order matters.
 */
exports.GROQ_MODEL_CHAIN = [
    'openai/gpt-oss-120b', // OpenAI GPT OSS 120B — best JSON quality
    'openai/gpt-oss-20b', // smaller, faster
    'groq/compound', // Groq's multi-model orchestrator
    'qwen/qwen3.8-27b', // Qwen 27B as last resort
];
/**
 * Returns the model chain to try at runtime. Honours the
 * `GROQ_MODEL` env var (if set) by placing it first so users
 * can pin a specific model without editing code.
 */
function getGroqModelChain() {
    const override = process.env.GROQ_MODEL;
    if (!override)
        return [...exports.GROQ_MODEL_CHAIN];
    // Dedupe + put override first.
    return [override, ...exports.GROQ_MODEL_CHAIN.filter(m => m !== override)];
}
exports.VALID_OBJECTIVES = ['ventas', 'branding', 'lanzamiento', 'engagement'];
exports.VALID_PLATFORMS = ['reels', 'tiktok', 'shorts'];
exports.VALID_DURATIONS = [15, 20, 30];
function validateBrief(input) {
    const errors = [];
    const b = (input ?? {});
    const requireStr = (field, max = 200) => {
        const v = b[field];
        if (typeof v !== 'string' || v.trim().length === 0) {
            errors.push({ field, message: `${field} is required` });
            return undefined;
        }
        if (v.length > max) {
            errors.push({ field, message: `${field} exceeds ${max} chars` });
            return v.slice(0, max);
        }
        return v.trim();
    };
    const businessName = requireStr('businessName', 80);
    const product = requireStr('product', 200);
    const category = requireStr('category', 80);
    const audience = requireStr('audience', 400);
    const visualStyle = requireStr('visualStyle', 80);
    const language = requireStr('language', 10);
    const cta = requireStr('cta', 200);
    const objective = b.objective;
    if (!objective || !exports.VALID_OBJECTIVES.includes(objective)) {
        errors.push({ field: 'objective', message: `objective must be one of ${exports.VALID_OBJECTIVES.join(', ')}` });
    }
    const platform = b.platform;
    if (!platform || !exports.VALID_PLATFORMS.includes(platform)) {
        errors.push({ field: 'platform', message: `platform must be one of ${exports.VALID_PLATFORMS.join(', ')}` });
    }
    const duration = b.duration;
    if (duration !== 15 && duration !== 20 && duration !== 30) {
        errors.push({ field: 'duration', message: 'duration must be 15, 20 or 30' });
    }
    if (language && language !== 'es-AR') {
        errors.push({ field: 'language', message: 'only es-AR is supported in this phase' });
    }
    if (errors.length > 0)
        return { ok: false, errors };
    return {
        ok: true,
        value: {
            businessName: businessName,
            product: product,
            category: category,
            audience: audience,
            visualStyle: visualStyle,
            language: 'es-AR',
            cta: cta,
            objective: objective,
            platform: platform,
            duration: duration,
            referenceImages: Array.isArray(b.referenceImages) ? b.referenceImages.filter((x) => typeof x === 'string') : undefined,
            logo: typeof b.logo === 'string' ? b.logo : undefined,
            additionalNotes: typeof b.additionalNotes === 'string' ? b.additionalNotes : undefined,
        },
    };
}
// ── Groq client factories ─────────────────────────────────────────────────
function realGroqClient(apiKey, baseUrl = 'https://api.groq.com/openai/v1/chat/completions') {
    return async (req) => {
        const r = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req),
        });
        if (!r.ok) {
            throw new Error(`Groq error: ${r.status} ${await r.text()}`);
        }
        return await r.json();
    };
}
/**
 * Whether a Groq error response indicates the model name was
 * rejected (not found, deprecated, or not authorized for this
 * account). Used by the fallback chain to decide whether to try
 * the next model vs. fail immediately.
 */
function isModelNotFoundError(status, body) {
    if (status === 404)
        return true;
    if (status === 400 && /model_not_found|model_not_available/i.test(body))
        return true;
    return false;
}
/**
 * Real Groq client with automatic model fallback. Tries each
 * model in `getGroqModelChain()` in order; on `isModelNotFoundError`
 * advances to the next model. Other errors (401, 429, 5xx) are
 * surfaced immediately — those aren't model issues.
 *
 * If every model fails, throws the last model-not-found error
 * (which contains the diagnostic from Groq for the user).
 */
function realGroqClientWithFallback(apiKey, baseUrl = 'https://api.groq.com/openai/v1/chat/completions') {
    return async (req) => {
        const chain = getGroqModelChain();
        let lastError;
        for (const model of chain) {
            const r = await fetch(baseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ...req, model }),
            });
            if (r.ok) {
                return await r.json();
            }
            const text = await r.text();
            if (isModelNotFoundError(r.status, text)) {
                // Try next model in the chain.
                lastError = new Error(`Groq model "${model}" unavailable: ${r.status} ${text}`);
                continue;
            }
            // Auth / rate / server errors: fail fast, no point in
            // trying another model with the same credentials.
            throw new Error(`Groq error: ${r.status} ${text}`);
        }
        throw lastError ?? new Error('Groq: no models configured');
    };
}
function buildLlmPrompt(brief, slotList) {
    const slotsDescription = slotList
        .map(s => `- role="${s.role}" duration=${s.durationSec}s`)
        .join('\n');
    return {
        model: exports.DEFAULT_GROQ_MODEL,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
            {
                role: 'system',
                content: `Eres el director creativo de Adsíntesis. Recibís un brief comercial y devolvés un JSON con la estructura EXACTA que se te indica. NO generes prompts visuales (eso lo hace otro módulo). Tu trabajo es: concepto, hook, narrativa, copy, caption, hashtags y el contenido NARRATIVO de cada escena (on-screen text y voiceover en español rioplatense argentino, tono natural).

Devolvé únicamente este JSON (sin markdown, sin texto extra):

{
  "concept": "string de 1-2 frases con el concepto creativo de la campaña",
  "hook": "string con el gancho de 3 segundos",
  "campaignTitle": "string corto con el título de la campaña",
  "narrative": "string de 2-3 frases describiendo el arco narrativo",
  "caption": "string con la caption para redes en español argentino",
  "hashtags": ["array", "de", "5-10", "hashtags"],
  "slots": [
    {
      "role": "uno de los roles provistos en el input",
      "onScreenText": "texto que aparece sobreimpreso en pantalla (max 6 palabras)",
      "voiceover": "voz en off en español argentino (1-2 frases)",
      "narrative": "descripción corta de qué pasa visualmente en esta escena"
    }
  ]
}`,
            },
            {
                role: 'user',
                content: `Brief:
- Negocio: ${brief.businessName}
- Producto: ${brief.product}
- Categoría: ${brief.category}
- Objetivo: ${brief.objective}
- Público: ${brief.audience}
- Plataforma: ${brief.platform}
- Duración total: ${brief.duration}s
- CTA: ${brief.cta}
- Notas adicionales: ${brief.additionalNotes ?? '(ninguna)'}

Slots a cubrir (en orden):
${slotsDescription}

Devolvé un slot por cada uno de los listados. No omitas ni agregues slots.`,
            },
        ],
    };
}
async function parseBrief(brief, client, projectId) {
    const plan = (0, storyboard_generator_1.planStoryboard)(brief.duration);
    const req = buildLlmPrompt(brief, plan.slots.map(s => ({ role: s.role, durationSec: s.durationSec })));
    const res = await client(req);
    const raw = res.choices?.[0]?.message?.content;
    if (!raw)
        throw new Error('empty response from creative director llm');
    const parsed = JSON.parse(raw);
    const slotByRole = new Map(parsed.slots.map(s => [s.role, s]));
    const sceneSpecs = plan.slots.map((slot, idx) => {
        const slotContent = slotByRole.get(slot.role);
        const prompt = (0, prompt_builder_1.buildVisualPrompt)({
            product: brief.product,
            businessName: brief.businessName,
            styleId: brief.visualStyle,
            slot: slot.role,
            extraContext: slotContent?.narrative,
        });
        const transition = idx === 0 ? 'cut' : (idx === plan.slots.length - 1 ? 'fade' : 'cut');
        return {
            sceneNumber: idx + 1,
            duration: slot.durationSec,
            title: storyboard_generator_1.SLOT_TITLES[slot.role],
            objective: storyboard_generator_1.SLOT_OBJECTIVES[slot.role],
            camera: deriveCamera(brief.visualStyle),
            visualPrompt: prompt.visualPrompt,
            negativePrompt: prompt.negativePrompt,
            onScreenText: slotContent?.onScreenText ?? '',
            voiceover: slotContent?.voiceover ?? '',
            transition,
        };
    });
    const spec = {
        concept: parsed.concept,
        hook: parsed.hook,
        campaignTitle: parsed.campaignTitle,
        narrative: parsed.narrative,
        scenes: sceneSpecs,
        hashtags: parsed.hashtags ?? [],
        caption: parsed.caption,
    };
    const scenes = sceneSpecs.map((s, idx) => ({
        id: '',
        projectId,
        order: idx,
        title: s.title,
        description: s.objective,
        prompt: s.visualPrompt,
        visualPrompt: s.visualPrompt,
        negativePrompt: s.negativePrompt,
        camera: s.camera,
        voiceover: s.voiceover,
        onScreenText: s.onScreenText,
        durationSec: s.duration,
        transitionIn: s.transition,
        timestamps: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        status: 'prompt_ready',
    }));
    return { spec, scenes };
}
function deriveCamera(styleId) {
    if (styleId === 'cinematografico' || styleId === 'moda' || styleId === 'inmobiliario') {
        return 'slow gimbal tracking, subtle dolly-in';
    }
    if (styleId === 'fast-food-premium') {
        return 'macro dolly with steam pass-through';
    }
    if (styleId === 'tecnologia') {
        return 'precise slider with parallax of UI elements';
    }
    if (styleId === 'minimalista') {
        return 'static or single subtle push-in';
    }
    if (styleId === 'luxury') {
        return 'slow dolly-in, almost imperceptible motion';
    }
    return 'steadicam micro-movements';
}
