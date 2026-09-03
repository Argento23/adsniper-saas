/**
 * Prompt builder — assembles deterministic, provider-compatible visual
 * prompts from Brand + Product + Style + Scene slot.
 *
 * The LLM never invents camera, lens or color-grade tokens directly; the
 * Prompt Builder owns the visual vocabulary. The LLM only contributes:
 *   - the on-screen text
 *   - the voiceover script
 *   - the per-slot narrative idea
 *
 * Output prompts target FLUX, Wan, and Veo (text-to-image and image-to-video)
 * and stay within their token budget.
 */

import { getStylePreset } from './styles';
import { StoryboardSlot } from './types';

export interface PromptBuildInput {
    product: string;
    businessName?: string;
    styleId: string;
    slot: StoryboardSlot;
    extraContext?: string;
}

export interface BuiltPrompts {
    visualPrompt: string;
    negativePrompt: string;
}

const BASE_NEGATIVE = 'low quality, blurry, watermark, text, distorted, deformed, cartoon, illustration, 3d render artifacts';

const SLOT_VISUAL_HINTS: Record<StoryboardSlot, string> = {
    'hook': 'opening frame, dynamic composition, eye-catching subject in foreground',
    'producto': 'subject centered, premium product hero shot, key light highlights',
    'beneficio': 'subject in use, action moment, satisfying detail close-up',
    'cta': 'subject with clear focal area, brand-forward closing frame',
    'storytelling': 'lifestyle moment, subject within environment, natural interaction',
    'prueba-social': 'multiple subjects, social atmosphere, warm community energy',
};

export function buildVisualPrompt(input: PromptBuildInput): BuiltPrompts {
    const style = getStylePreset(input.styleId);
    const slotHint = SLOT_VISUAL_HINTS[input.slot] ?? SLOT_VISUAL_HINTS.producto;

    const brandFragment = input.businessName ? `${input.businessName} brand context,` : '';
    const contextFragment = input.extraContext ? `${input.extraContext},` : '';
    const extraTokens = style.extraTokens.length > 0 ? `, ${style.extraTokens.join(', ')}` : '';

    const visualPrompt = [
        `${input.product},`,
        brandFragment,
        contextFragment,
        slotHint + ',',
        `${style.lighting},`,
        `${style.lens},`,
        `${style.colorGrade},`,
        `${style.cameraMovement},`,
        `${style.atmosphere},`,
        `${style.realismLevel},`,
        'vertical composition 9:16, ultra-detailed',
    ]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .replace(/,\s*,/g, ', ')
        .trim();

    const negativePrompt = `${BASE_NEGATIVE}, ${style.id !== 'minimalista' ? 'cluttered background, harsh flash,' : ''} out of focus subject`;

    return {
        visualPrompt: `${visualPrompt}${extraTokens}`,
        negativePrompt,
    };
}
