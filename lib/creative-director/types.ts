/**
 * Creative Director IA — type contracts.
 *
 * The Creative Director receives a `CreativeBrief` and emits a `CreativeSpec`
 * containing a structured campaign: concept, hook, narrative, and an array
 * of `SceneSpec` items that can be mapped directly to the existing
 * `Scene` model from `lib/projects/types.ts`.
 */

export type CreativeObjective = 'ventas' | 'branding' | 'lanzamiento' | 'engagement';

export type CreativePlatform = 'reels' | 'tiktok' | 'shorts';

export type CreativeDuration = 15 | 20 | 30;

export type CreativeLanguage = 'es-AR';

export type StylePresetId =
    | 'cinematografico'
    | 'hiperrealista'
    | 'luxury'
    | 'minimalista'
    | 'fast-food-premium'
    | 'moda'
    | 'tecnologia'
    | 'inmobiliario';

export interface CreativeBrief {
    businessName: string;
    product: string;
    category: string;
    objective: CreativeObjective;
    audience: string;
    platform: CreativePlatform;
    duration: CreativeDuration;
    visualStyle: StylePresetId | string;
    language: CreativeLanguage;
    cta: string;
    referenceImages?: string[];
    logo?: string;
    additionalNotes?: string;
}

export type SceneTransition = 'cut' | 'fade' | 'dissolve';

export interface SceneSpec {
    sceneNumber: number;
    duration: number;
    title: string;
    objective: string;
    camera: string;
    visualPrompt: string;
    negativePrompt: string;
    onScreenText: string;
    voiceover: string;
    transition: SceneTransition;
}

export interface CreativeSpec {
    concept: string;
    hook: string;
    campaignTitle: string;
    narrative: string;
    scenes: SceneSpec[];
    hashtags: string[];
    caption: string;
}

/**
 * Slot roles inside the storyboard. Each role maps to a fixed `objective`
 * string and a `title` template; this is the deterministic skeleton the
 * LLM fills in. The actual visual prompt is built by `prompt-builder.ts`
 * from these slots, so the LLM never invents camera/lens/color terms
 * directly.
 */
export type StoryboardSlot =
    | 'hook'
    | 'producto'
    | 'beneficio'
    | 'cta'
    | 'storytelling'
    | 'prueba-social';

export interface StoryboardPlan {
    totalDuration: CreativeDuration;
    slotDurationSec: number;
    slots: { role: StoryboardSlot; durationSec: number }[];
}
