/**
 * Project Visual Context.
 *
 * Assembles a `VisualContext` snapshot from a `Project` so every
 * Scene in the pipeline can access the same brand, reference and
 * style guidance. This is the minimum scaffolding for visual
 * continuity between scenes; embedding-based character consistency
 * is intentionally out of scope for this phase.
 *
 * The function is pure: no I/O, no side effects. Persistence of the
 * context itself is handled by callers if needed.
 */

import { Project, VisualContext } from './types';

export function buildVisualContext(project: Project): VisualContext {
    const brief = project.brief ?? ({} as Project['brief']);
    return {
        brandSnapshot: project.brandSnapshot,
        characterReferences: brief.referenceImages ?? [],
        productReferences: brief.productPhotos ?? [],
        locationReferences: [],
        visualStyle: brief.style,
        colorGuidance: project.brandSnapshot?.primaryColor,
        globalNegativePrompt: undefined,
    };
}
