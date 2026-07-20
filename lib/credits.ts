/**
 * V66: Sistema unificado de créditos & rate limiting.
 *
 * Plan estructura:
 *   - free:    15 img/mes con Pollinations (gratis) — $0 coste FAL
 *   - pro:     40 img/mes con Bria ($0.10/img) — coste máx $4/mes
 *   - studio:  100 credits/mes, video cuesta 30 credits — coste máx $30/mes
 *   - agency:  600 credits/mes — coste máx $60-180/mes
 *
 * Por cada plan defines qué proveedor de imagen puede usar:
 *   - free:    Pollinations (gratis)
 *   - pro+:    Bria Product Shot (FAL)
 *   - studio+: Inpaint + Bake (FAL)
 *
 * Los precios se controlan vía env vars para que vos puedas ajustar sin redeployar.
 */

import { clerkClient } from '@clerk/nextjs/server';

export type PlanName = 'free' | 'pro' | 'studio' | 'agency';
export type ImageProvider = 'pollinations' | 'bria' | 'bria_inpaint';

export interface PlanConfig {
    name: PlanName;
    monthlyCredits: number;
    videoCreditCost: number;
    imageProviders: ImageProvider[];
    allowsVideo: boolean;
    allowsImageUpload: boolean;
    marketprice: number; // USD/mes
}

export interface CreditCheckResult {
    canProceed: boolean;
    plan: PlanName;
    remaining: number;
    limit: number;
    resetDate: Date;
    reason?: string;
}

const DEFAULT_PLANS: Record<PlanName, PlanConfig> = {
    free: {
        name: 'free',
        monthlyCredits: parseInt(process.env.PLAN_FREE_CREDITS || '15'),
        videoCreditCost: 0,
        imageProviders: ['pollinations'],
        allowsVideo: false,
        allowsImageUpload: true,
        marketprice: 0,
    },
    pro: {
        name: 'pro',
        monthlyCredits: parseInt(process.env.PLAN_PRO_CREDITS || '150'),
        videoCreditCost: 0,
        imageProviders: ['bria'],
        allowsVideo: false,
        allowsImageUpload: true,
        marketprice: 29,
    },
    studio: {
        name: 'studio',
        monthlyCredits: parseInt(process.env.PLAN_STUDIO_CREDITS || '500'),
        videoCreditCost: parseInt(process.env.PLAN_STUDIO_VIDEO_COST || '50'),
        imageProviders: ['bria', 'bria_inpaint'],
        allowsVideo: true,
        allowsImageUpload: true,
        marketprice: 59,
    },
    agency: {
        name: 'agency',
        monthlyCredits: parseInt(process.env.PLAN_AGENCY_CREDITS || '2000'),
        videoCreditCost: parseInt(process.env.PLAN_AGENCY_VIDEO_COST || '50'),
        imageProviders: ['bria', 'bria_inpaint'],
        allowsVideo: true,
        allowsImageUpload: true,
        marketprice: 149,
    },
};

/* ============================================================
 * ADMIN_EMAIL constant — para reconocer el admin que bypasea
 * límites sin gastar créditos (vos).
 * ============================================================ */
const ADMIN_EMAIL = 'gustavodornhofer@gmail.com';

/* Detect admin/infinity plan — bypass de límites para vos */
async function isAdminOrInfinity(userId: string): Promise<boolean> {
    try {
        const user = await clerkClient.users.getUser(userId);
        const emails = user.emailAddresses.map(e => e.emailAddress.toLowerCase().trim());
        if (emails.some(e => e === ADMIN_EMAIL)) return true;
        const meta = user.publicMetadata as any;
        if (meta.plan === 'Infinity' || meta.plan === 'admin') return true;
        return false;
    } catch {
        return false;
    }
}

/* Get plan from user metadata */
async function getUserPlan(userId: string): Promise<PlanName> {
    try {
        const user = await clerkClient.users.getUser(userId);
        const meta = user.publicMetadata as any;
        const plan = (meta.plan || 'free') as string;
        if (plan === 'Infinity' || plan === 'admin') return 'agency'; // treat as agency
        if (plan === 'pro') return 'pro';
        if (plan === 'studio' || plan === 'Studio Pro') return 'studio';
        if (plan === 'agency') return 'agency';
        return 'free';
    } catch {
        return 'free';
    }
}

function getNextMonthStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

/* ============================================================
 * V66: SISTEMA PRINCIPAL
 * ============================================================
 *
 * `consumeCredits` chequea + resta créditos para un usuario.
 * Si el admin, bypasea. Si no quedan créditos, rechaza.
 *
 * Usage:
 *   const check = await consumeCredits(userId, cost, 'image');
 *   if (!check.canProceed) return new Response(...);
 */
export async function consumeCredits(
    userId: string,
    cost: number = 1,
    _type: 'image' | 'video' = 'image'
): Promise<CreditCheckResult> {
    // Admin bypass
    if (await isAdminOrInfinity(userId)) {
        return { canProceed: true, plan: 'agency', remaining: 999, limit: 999, resetDate: getNextMonthStart() };
    }

    const plan = await getUserPlan(userId);
    const planConfig = DEFAULT_PLANS[plan];

    const user = await clerkClient.users.getUser(userId);
    const meta = (user.publicMetadata as any) || {};

    // Reset credits si cambió el mes
    const lastReset = meta.lastCreditReset ? new Date(meta.lastCreditReset) : new Date();
    const now = new Date();
    const shouldReset = now.getMonth() !== lastReset.getMonth() ||
        now.getFullYear() !== lastReset.getFullYear();

    let usedCredits = shouldReset ? 0 : (meta.usedCredits || 0);

    if (usedCredits + cost > planConfig.monthlyCredits) {
        return {
            canProceed: false,
            plan,
            remaining: Math.max(0, planConfig.monthlyCredits - usedCredits),
            limit: planConfig.monthlyCredits,
            resetDate: getNextMonthStart(),
            reason: plan === 'free'
                ? 'Sin créditos este mes. Mejorá a Pro para más generaciones.'
                : `Sin créditos este mes. Tu plan ${plan} incluye ${planConfig.monthlyCredits}/mes.`
        };
    }

    // Persist
    usedCredits += cost;
    await clerkClient.users.updateUserMetadata(userId, {
        publicMetadata: {
            ...meta,
            usedCredits,
            lastCreditReset: shouldReset ? now.toISOString() : meta.lastCreditReset,
            lastGenerationAt: now.toISOString(),
            totalGenerations: (meta.totalGenerations || 0) + 1,
        }
    });

    return {
        canProceed: true,
        plan,
        remaining: planConfig.monthlyCredits - usedCredits,
        limit: planConfig.monthlyCredits,
        resetDate: getNextMonthStart(),
    };
}

/**
 * V66: Selecciona el mejor proveedor de imagen para el plan.
 * Regla: usar el más barato disponible que produzca calidad suficiente.
 *   free → Pollinations (gratis)
 *   pro+ → Bria ($0.10)
 *   studio+ → Bria Inpaint (usado solo en Studio Pro)
 */
export async function getRecommendedProvider(userId: string): Promise<ImageProvider> {
    if (await isAdminOrInfinity(userId)) return 'bria_inpaint';
    const plan = await getUserPlan(userId);
    const cfg = DEFAULT_PLANS[plan];
    return cfg.imageProviders[0]; // primer provider disponible
}

/**
 * V66: Comprueba sin consumir (solo lectura).
 */
export async function peekCredits(userId: string): Promise<CreditCheckResult> {
    if (await isAdminOrInfinity(userId)) {
        return { canProceed: true, plan: 'agency', remaining: 999, limit: 999, resetDate: getNextMonthStart() };
    }
    const plan = await getUserPlan(userId);
    const planConfig = DEFAULT_PLANS[plan];
    try {
        const user = await clerkClient.users.getUser(userId);
        const meta = (user.publicMetadata as any) || {};
        const lastReset = meta.lastCreditReset ? new Date(meta.lastCreditReset) : new Date();
        const now = new Date();
        const shouldReset = now.getMonth() !== lastReset.getMonth() ||
            now.getFullYear() !== lastReset.getFullYear();
        const used = shouldReset ? 0 : (meta.usedCredits || 0);
        return {
            canProceed: used < planConfig.monthlyCredits,
            plan,
            remaining: Math.max(0, planConfig.monthlyCredits - used),
            limit: planConfig.monthlyCredits,
            resetDate: getNextMonthStart(),
        };
    } catch {
        return { canProceed: false, plan: 'free', remaining: 0, limit: 0, resetDate: getNextMonthStart() };
    }
}

export { DEFAULT_PLANS };
