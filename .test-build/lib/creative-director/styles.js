"use strict";
/**
 * Style library for the Creative Director.
 *
 * Each preset is a small data structure describing the visual language the
 * Prompt Builder will inject into every visual prompt:
 *   - lighting
 *   - lens
 *   - color grade
 *   - camera movement
 *   - atmosphere
 *   - realism level
 *
 * The Prompt Builder combines: Brand + Product + Style + Scene slot to
 * produce FLUX/Wan/Veo-compatible prompts. The LLM is NEVER trusted with
 * the visual language itself.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.STYLE_PRESETS = void 0;
exports.getStylePreset = getStylePreset;
exports.listStylePresets = listStylePresets;
exports.STYLE_PRESETS = {
    cinematografico: {
        id: 'cinematografico',
        label: 'Cinematográfico',
        description: 'Aspecto de película narrativa, dramático y premium.',
        lighting: 'cinematic lighting, motivated key light, soft fill, controlled shadows',
        lens: 'anamorphic 35mm and 50mm prime lenses',
        colorGrade: 'Apple/Nike-style cinematic color grade, warm midtones, cool shadows',
        cameraMovement: 'slow gimbal tracking, deliberate dolly moves, subtle parallax',
        atmosphere: 'cinematic depth, atmospheric haze, controlled background bokeh',
        realismLevel: 'photorealistic 8K cinematic',
        extraTokens: ['film grain subtle', 'production-grade composition', 'rule of thirds'],
    },
    hiperrealista: {
        id: 'hiperrealista',
        label: 'Hiperrealista',
        description: 'Detalle extremo, texturas visibles, sensación fotográfica.',
        lighting: 'natural sunlight or studio strobe, micro-shadow detail',
        lens: '85mm portrait prime, f/1.8 shallow depth of field',
        colorGrade: 'neutral photo color science, true-to-life skin tones',
        cameraMovement: 'steadicam micro-movements, breathing stabilisation',
        atmosphere: 'lived-in environment, tactile surface textures',
        realismLevel: 'photorealistic 8K product photography, ultra-detailed textures',
        extraTokens: ['macro detail', 'subsurface scattering on organic materials'],
    },
    luxury: {
        id: 'luxury',
        label: 'Luxury',
        description: 'Elegancia contenida, materiales nobles, paleta sobria.',
        lighting: 'soft golden-hour rim light, deep chiaroscuro accents',
        lens: '85mm f/1.4, creamy bokeh, gentle compression',
        colorGrade: 'rich blacks, gold accents, desaturated midtones',
        cameraMovement: 'slow dolly-in, almost imperceptible motion',
        atmosphere: 'marble, brushed metal, velvet, low ambient noise',
        realismLevel: 'editorial-grade commercial photography',
        extraTokens: ['reflections on polished surfaces', 'precise highlights'],
    },
    minimalista: {
        id: 'minimalista',
        label: 'Minimalista',
        description: 'Composición limpia, fondo neutro, foco absoluto en el sujeto.',
        lighting: 'softbox key light, even diffuse fill',
        lens: '50mm standard prime, f/4 balanced depth',
        colorGrade: 'high-key, soft contrast, restrained palette',
        cameraMovement: 'static or single subtle push-in',
        atmosphere: 'clean studio backdrop, minimal props, ample negative space',
        realismLevel: 'studio product shot, no distractions',
        extraTokens: ['centered subject', 'negative space'],
    },
    'fast-food-premium': {
        id: 'fast-food-premium',
        label: 'Fast Food Premium',
        description: 'Comida rápida elevada a categoría gastronómica.',
        lighting: 'warm tungsten practicals, steam-lit highlights',
        lens: '50mm and 85mm close-ups, f/2.0 food-photography depth',
        colorGrade: 'saturated warm palette, golden browns, vivid reds',
        cameraMovement: 'macro dolly, slight tilt, steam pass-through',
        atmosphere: 'kitchen backdrop, condensation, melting textures, fresh garnish',
        realismLevel: 'editorial food photography, visible steam and oil droplets',
        extraTokens: ['macro steam wisps', 'melting cheese pull', 'glistening sauce'],
    },
    moda: {
        id: 'moda',
        label: 'Moda',
        description: 'Editorial de moda, movimiento dinámico, estilismo marcado.',
        lighting: 'beauty dish with bounce, sculpted shadows',
        lens: '70-200mm zoom look, fashion-editorial framing',
        colorGrade: 'high contrast, deliberate color cast per shot',
        cameraMovement: 'whip pans, follow-focus on model movement',
        atmosphere: 'urban or studio set, fabric motion, controlled wind',
        realismLevel: 'editorial fashion campaign photography',
        extraTokens: ['fabric motion', 'hairstyle detail'],
    },
    tecnologia: {
        id: 'tecnologia',
        label: 'Tecnología',
        description: 'Producto tech con luz fría, interfaz activa, fondo oscuro.',
        lighting: 'cool cyan rim, soft top diffuse, screen glow on subject',
        lens: '35mm and 50mm, deep focus for product detail',
        colorGrade: 'cool palette, deep blacks, electric accents',
        cameraMovement: 'precise slider, parallax of UI elements',
        atmosphere: 'dark studio, holographic reflections, floating particles',
        realismLevel: 'premium tech product render with photographic finish',
        extraTokens: ['screen glow on chassis', 'fiber-optic glints'],
    },
    inmobiliario: {
        id: 'inmobiliario',
        label: 'Inmobiliario',
        description: 'Arquitectura habitable, luz natural, encuadre editorial.',
        lighting: 'natural window light, golden-hour exterior, mixed interior',
        lens: '16-35mm wide for exteriors, 35mm interior lifestyle',
        colorGrade: 'warm neutrals, soft greens for exteriors, airy interiors',
        cameraMovement: 'steadicam walkthrough, slow establishing pan',
        atmosphere: 'inhabited spaces, soft furnishings, plants, lived-in warmth',
        realismLevel: 'architectural editorial photography',
        extraTokens: ['lived-in styling', 'soft shadows from blinds'],
    },
};
function getStylePreset(id) {
    return exports.STYLE_PRESETS[id] ?? exports.STYLE_PRESETS.cinematografico;
}
function listStylePresets() {
    return Object.values(exports.STYLE_PRESETS);
}
