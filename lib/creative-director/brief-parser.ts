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

import { buildVisualPrompt } from './prompt-builder';
import { planStoryboard, SLOT_OBJECTIVES, SLOT_TITLES } from './storyboard-generator';
import {
    CreativeBrief,
    CreativeDuration,
    CreativeObjective,
    CreativePlatform,
    SceneSpec,
    SceneTransition,
    StoryboardSlot,
} from './types';
import { Scene } from '@/lib/projects/types';

export interface GroqChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface GroqChatRequest {
    model: string;
    messages: GroqChatMessage[];
    temperature?: number;
    response_format?: { type: 'json_object' };
}

export interface GroqChatResponse {
    choices?: { message?: { content?: string } }[];
}

export type GroqClient = (req: GroqChatRequest) => Promise<GroqChatResponse>;

export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

export const VALID_OBJECTIVES: CreativeObjective[] = ['ventas', 'branding', 'lanzamiento', 'engagement'];
export const VALID_PLATFORMS: CreativePlatform[] = ['reels', 'tiktok', 'shorts'];
export const VALID_DURATIONS: CreativeDuration[] = [15, 20, 30];

export interface BriefValidationError {
    field: string;
    message: string;
}

export function validateBrief(input: unknown): { ok: true; value: CreativeBrief } | { ok: false; errors: BriefValidationError[] } {
    const errors: BriefValidationError[] = [];
    const b = (input ?? {}) as Record<string, unknown>;

    const requireStr = (field: string, max = 200): string | undefined => {
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

    const objective = b.objective as CreativeObjective | undefined;
    if (!objective || !VALID_OBJECTIVES.includes(objective)) {
        errors.push({ field: 'objective', message: `objective must be one of ${VALID_OBJECTIVES.join(', ')}` });
    }

    const platform = b.platform as CreativePlatform | undefined;
    if (!platform || !VALID_PLATFORMS.includes(platform)) {
        errors.push({ field: 'platform', message: `platform must be one of ${VALID_PLATFORMS.join(', ')}` });
    }

    const duration = b.duration as CreativeDuration | undefined;
    if (duration !== 15 && duration !== 20 && duration !== 30) {
        errors.push({ field: 'duration', message: 'duration must be 15, 20 or 30' });
    }

    if (language && language !== 'es-AR') {
        errors.push({ field: 'language', message: 'only es-AR is supported in this phase' });
    }

    if (errors.length > 0) return { ok: false, errors };

    return {
        ok: true,
        value: {
            businessName: businessName!,
            product: product!,
            category: category!,
            audience: audience!,
            visualStyle: visualStyle!,
            language: 'es-AR',
            cta: cta!,
            objective: objective!,
            platform: platform!,
            duration: duration!,
            referenceImages: Array.isArray(b.referenceImages) ? b.referenceImages.filter((x): x is string => typeof x === 'string') : undefined,
            logo: typeof b.logo === 'string' ? b.logo : undefined,
            additionalNotes: typeof b.additionalNotes === 'string' ? b.additionalNotes : undefined,
        },
    };
}

// ── Groq client factories ─────────────────────────────────────────────────

export function realGroqClient(apiKey: string, baseUrl = 'https://api.groq.com/openai/v1/chat/completions'): GroqClient {
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
        return await r.json() as GroqChatResponse;
    };
}

// ── LLM call shape ───────────────────────────────────────────────────────

export interface LlmStoryboardContent {
    concept: string;
    hook: string;
    campaignTitle: string;
    narrative: string;
    caption: string;
    hashtags: string[];
    slots: {
        role: StoryboardSlot;
        onScreenText: string;
        voiceover: string;
        narrative: string;
    }[];
}

export function buildLlmPrompt(brief: CreativeBrief, slotList: { role: StoryboardSlot; durationSec: number }[]): GroqChatRequest {
    const slotsDescription = slotList
        .map(s => `- role="${s.role}" duration=${s.durationSec}s`)
        .join('\n');

    return {
        model: DEFAULT_GROQ_MODEL,
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

// ── Orchestrator ─────────────────────────────────────────────────────────

export interface ParsedBriefResult {
    spec: import('./types').CreativeSpec;
    scenes: Scene[];
}

export async function parseBrief(
    brief: CreativeBrief,
    client: GroqClient,
    projectId: string,
): Promise<ParsedBriefResult> {
    const plan = planStoryboard(brief.duration);

    const req = buildLlmPrompt(brief, plan.slots.map(s => ({ role: s.role, durationSec: s.durationSec })));
    const res = await client(req);
    const raw = res.choices?.[0]?.message?.content;
    if (!raw) throw new Error('empty response from creative director llm');
    const parsed = JSON.parse(raw) as LlmStoryboardContent;

    const slotByRole = new Map(parsed.slots.map(s => [s.role, s]));

    const sceneSpecs: SceneSpec[] = plan.slots.map((slot, idx) => {
        const slotContent = slotByRole.get(slot.role);
        const prompt = buildVisualPrompt({
            product: brief.product,
            businessName: brief.businessName,
            styleId: brief.visualStyle,
            slot: slot.role,
            extraContext: slotContent?.narrative,
        });
        const transition: SceneTransition = idx === 0 ? 'cut' : (idx === plan.slots.length - 1 ? 'fade' : 'cut');
        return {
            sceneNumber: idx + 1,
            duration: slot.durationSec,
            title: SLOT_TITLES[slot.role],
            objective: SLOT_OBJECTIVES[slot.role],
            camera: deriveCamera(brief.visualStyle),
            visualPrompt: prompt.visualPrompt,
            negativePrompt: prompt.negativePrompt,
            onScreenText: slotContent?.onScreenText ?? '',
            voiceover: slotContent?.voiceover ?? '',
            transition,
        };
    });

    const spec: import('./types').CreativeSpec = {
        concept: parsed.concept,
        hook: parsed.hook,
        campaignTitle: parsed.campaignTitle,
        narrative: parsed.narrative,
        scenes: sceneSpecs,
        hashtags: parsed.hashtags ?? [],
        caption: parsed.caption,
    };

    const scenes: Scene[] = sceneSpecs.map((s, idx) => ({
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

function deriveCamera(styleId: string): string {
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
