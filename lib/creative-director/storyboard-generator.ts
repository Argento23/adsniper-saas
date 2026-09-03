/**
 * Storyboard generator.
 *
 * Given a `CreativeBrief.duration`, produces a deterministic plan of
 * `StoryboardSlot`s with per-slot durations that sum to the requested
 * total. The Creative Director LLM fills narrative content into these
 * slots; visual prompts are produced by the `prompt-builder`.
 *
 * Rules (per spec):
 *   15s → 4 scenes:  hook + producto + beneficio + cta
 *   20s → 4 scenes:  hook + producto + beneficio + cta
 *   30s → 6-8 scenes: hook + producto + beneficio + storytelling + prueba-social + cta
 *                    (split into 6 if the brief is concise; 8 if cta also expands)
 *
 * Slot durations are rounded to whole seconds and normalised so the
 * sum matches the requested duration exactly.
 */

import { CreativeDuration, StoryboardPlan, StoryboardSlot } from './types';

interface SlotShape {
    role: StoryboardSlot;
    weight: number;
}

const PLAN_15: SlotShape[] = [
    { role: 'hook', weight: 3 },
    { role: 'producto', weight: 4 },
    { role: 'beneficio', weight: 5 },
    { role: 'cta', weight: 3 },
];

const PLAN_20: SlotShape[] = [
    { role: 'hook', weight: 4 },
    { role: 'producto', weight: 5 },
    { role: 'beneficio', weight: 7 },
    { role: 'cta', weight: 4 },
];

const PLAN_30: SlotShape[] = [
    { role: 'hook', weight: 4 },
    { role: 'producto', weight: 5 },
    { role: 'beneficio', weight: 6 },
    { role: 'storytelling', weight: 6 },
    { role: 'prueba-social', weight: 5 },
    { role: 'cta', weight: 4 },
];

function buildPlan(duration: CreativeDuration, slots: SlotShape[]): StoryboardPlan {
    const totalWeight = slots.reduce((s, x) => s + x.weight, 0);
    const raw = slots.map(s => ({ role: s.role, durationSec: (s.weight / totalWeight) * duration }));
    const floored = raw.map(x => ({ ...x, durationSec: Math.max(1, Math.floor(x.durationSec)) }));
    let sum = floored.reduce((s, x) => s + x.durationSec, 0);
    let i = 0;
    // Distribute any leftover seconds to the highest-weight slots first.
    while (sum < duration && floored.length > 0) {
        const target = floored[i % floored.length];
        target.durationSec += 1;
        sum += 1;
        i += 1;
    }
    return {
        totalDuration: duration,
        slotDurationSec: duration / slots.length,
        slots: floored,
    };
}

export function planStoryboard(duration: CreativeDuration): StoryboardPlan {
    if (duration === 15) return buildPlan(15, PLAN_15);
    if (duration === 20) return buildPlan(20, PLAN_20);
    return buildPlan(30, PLAN_30);
}

/**
 * Title templates per role. The Creative Director LLM is given these as
 * guidance, NOT used verbatim unless the LLM returns an empty string.
 */
export const SLOT_TITLES: Record<StoryboardSlot, string> = {
    'hook': 'Hook — primer segundo',
    'producto': 'Hero shot del producto',
    'beneficio': 'Beneficio clave',
    'cta': 'Cierre y llamado a la acción',
    'storytelling': 'Storytelling — uso real',
    'prueba-social': 'Prueba social — clientes disfrutando',
};

export const SLOT_OBJECTIVES: Record<StoryboardSlot, string> = {
    'hook': 'Detener el scroll en el primer segundo.',
    'producto': 'Mostrar el producto como protagonista visual.',
    'beneficio': 'Comunicar el beneficio principal con claridad.',
    'cta': 'Cerrar con una instrucción directa al espectador.',
    'storytelling': 'Contextualizar el producto en una escena cotidiana.',
    'prueba-social': 'Aportar validación mediante clientes o atmósfera social.',
};
