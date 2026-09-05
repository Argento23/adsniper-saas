// Centralized Groq Configuration
// Using openai/gpt-oss-120b as the primary model (valid and available on Groq)
// This replaces the deprecated llama-3.3-70b-versatile which returns 404
// Note: llama-3.1-* models are NOT available on Groq in the old format

export const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

// Fallback model chain for robustness - only include models confirmed available on Groq (2025+)
export const GROQ_MODEL_FALLBACKS = [
    GROQ_MODEL,
    'openai/gpt-oss-20b',
    'groq/compound',
    'qwen/qwen3.8-27b',
] as const;

// Validate if a model is in our allowed list
export function isValidGroqModel(model: string): boolean {
    return GROQ_MODEL_FALLBACKS.includes(model as any);
}

// Default model for chat completions
export const DEFAULT_GROQ_MODEL = GROQ_MODEL;

// Debug logging
console.log("[GROQ CONFIG] Using model:", GROQ_MODEL);
console.log("[GROQ CONFIG] Fallback chain:", GROQ_MODEL_FALLBACKS);