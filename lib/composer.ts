import sharp from 'sharp';

interface CompositeOptions {
    sceneImage: string | Buffer;
    logoUrlOrBase64?: string | null;
    productImageBase64?: string | null;
    logoPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    brandName?: string;
    primaryColor?: string;
    headlineText?: string | null;
    ctaText?: string | null;
    priceText?: string | null;
    applyLogo?: boolean;
    applyText?: boolean;
    productPlacement?: 'auto' | 'center' | 'bottom-right' | 'bottom-left' | 'top-right';
}

interface StudioProOptions extends CompositeOptions {
    vignette?: boolean;
    grain?: boolean;
    accentColor?: string;
    tier?: 'standard' | 'pro';
}

function escapeXml(str: string) {
    return str
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&apos;');
}

function clampHex(hex: string, fallback = '#10b981'): string {
    if (!hex) return fallback;
    const m = hex.match(/^#?([0-9a-fA-F]{6})$/);
    return m ? `#${m[1]}` : fallback;
}

async function fetchImageBuffer(src: string): Promise<Buffer> {
    if (!src) throw new Error('Empty image source');
    if (src.startsWith('data:')) {
        const base64Data = src.split(',')[1] || src;
        return Buffer.from(base64Data, 'base64');
    }
    if (src.startsWith('http://') || src.startsWith('https://')) {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`Failed to fetch image from ${src}: ${res.statusText}`);
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
    // raw base64
    return Buffer.from(src, 'base64');
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
        p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
}

/**
 * STANDARD tier composite.
 * Slaps a logo badge + CTA banner + optional product card on top of an AI-generated scene.
 * The product card uses rounded corners, drop shadow, and brand color frame.
 */
export async function compositeProductAndLogo({
    sceneImage,
    logoUrlOrBase64,
    productImageBase64,
    logoPosition = 'top-left',
    brandName,
    primaryColor = '#10b981',
    headlineText,
    ctaText,
    priceText,
    applyLogo = true,
    applyText = true,
    productPlacement = 'auto'
}: CompositeOptions): Promise<string> {
    const brand = clampHex(primaryColor);

    try {
        const sceneBuffer = typeof sceneImage === 'string' ? await withTimeout(fetchImageBuffer(sceneImage), 20000, 'scene fetch') : sceneImage;
        const meta = await sharp(sceneBuffer).metadata();
        const width = meta.width || 1024;
        const height = meta.height || 1024;
        let baseSharp = sharp(sceneBuffer).resize(width, height, { fit: 'cover' });
        const overlays: sharp.OverlayOptions[] = [];

        // 1. Subtle bottom vignette + darken for text legibility (helps brand elements pop)
        const dimOverlaySvg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="vignette" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="rgba(0,0,0,0)" />
                    <stop offset="55%" stop-color="rgba(0,0,0,0)" />
                    <stop offset="100%" stop-color="rgba(0,0,0,0.35)" />
                </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#vignette)"/>
        </svg>`;
        overlays.push({ input: Buffer.from(dimOverlaySvg), top: 0, left: 0 });

        // 2. Product card composition (if user provided product image)
        if (productImageBase64 && productImageBase64.length > 100) {
            try {
                const prodBuffer = await withTimeout(fetchImageBuffer(productImageBase64), 15000, 'product fetch');
                const cardW = Math.round(width * 0.55);
                const cardH = Math.round(height * 0.55);
                const prodSize = { w: cardW - 24, h: cardH - 24 };

                // Drop shadow SVG
                const shadowSvg = `
                <svg width="${cardW + 8}" height="${cardH + 8}">
                    <defs>
                        <filter id="ds" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur in="SourceAlpha" stdDeviation="14"/>
                            <feOffset dx="0" dy="10"/>
                            <feComponentTransfer><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
                            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                    </defs>
                    <rect x="0" y="0" width="${cardW + 8}" height="${cardH + 8}" rx="22" fill="rgba(0,0,0,0.001)" filter="url(#ds)"/>
                </svg>`;

                // Card background (white with brand color border)
                const cardBgSvg = `
                <svg width="${cardW}" height="${cardH}">
                    <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="20" fill="#ffffff"/>
                    <rect x="3" y="3" width="${cardW - 6}" height="${cardH - 6}" rx="18" fill="none" stroke="${brand}" stroke-width="3" stroke-opacity="0.85"/>
                </svg>`;

                // Resize product photo to fit card
                const resizedProd = await sharp(prodBuffer)
                    .resize(prodSize.w, prodSize.h, { fit: 'cover' })
                    .composite([{ input: Buffer.from(`<svg width="${prodSize.w}" height="${prodSize.h}"><rect width="100%" height="100%" rx="14" fill="#fff"/></svg>`), blend: 'dest-in' }])
                    .toBuffer();

                // Composite order: shadow → card bg → product photo
                let cardX = 0, cardY = 0;
                if (productPlacement === 'bottom-right' || (productPlacement === 'auto' && width === height)) {
                    cardX = width - cardW - 30;
                    cardY = height - cardH - 30;
                } else if (productPlacement === 'bottom-left') {
                    cardX = 30;
                    cardY = height - cardH - 30;
                } else if (productPlacement === 'top-right') {
                    cardX = width - cardW - 30;
                    cardY = 30;
                } else {
                    // center
                    cardX = Math.round((width - cardW) / 2);
                    cardY = Math.round((height - cardH) / 2);
                }

                overlays.push({ input: Buffer.from(shadowSvg), top: cardY - 4, left: cardX - 4 });
                overlays.push({ input: Buffer.from(cardBgSvg), top: cardY, left: cardX });
                overlays.push({ input: resizedProd, top: cardY + 12, left: cardX + 12 });
            } catch (e) {
                console.warn('[Composer] Product card failed, falling back to logo-only overlay:', (e as Error).message);
            }
        }

        // 3. Logo badge in corner
        if (applyLogo && logoUrlOrBase64 && logoUrlOrBase64.length > 10) {
            try {
                const rawLogo = await withTimeout(fetchImageBuffer(logoUrlOrBase64), 12000, 'logo fetch');
                const logoSize = 120;
                const ringSvg = `
                <svg width="${logoSize + 16}" height="${logoSize + 16}">
                    <defs>
                        <filter id="ls" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur in="SourceAlpha" stdDeviation="8"/>
                            <feOffset dx="0" dy="4"/>
                            <feComponentTransfer><feFuncA type="linear" slope="0.5"/></feComponentTransfer>
                            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                    </defs>
                    <circle cx="${(logoSize + 16) / 2}" cy="${(logoSize + 16) / 2}" r="${(logoSize + 8) / 2}" fill="#ffffff" filter="url(#ls)"/>
                    <circle cx="${(logoSize + 16) / 2}" cy="${(logoSize + 16) / 2}" r="${(logoSize + 6) / 2}" fill="none" stroke="${brand}" stroke-width="3"/>
                </svg>`;

                const roundedLogo = await sharp(rawLogo)
                    .resize(logoSize, logoSize, { fit: 'cover' })
                    .composite([{ input: Buffer.from(`<svg width="${logoSize}" height="${logoSize}"><circle cx="${logoSize / 2}" cy="${logoSize / 2}" r="${logoSize / 2}" fill="#fff"/></svg>`), blend: 'dest-in' }])
                    .png()
                    .toBuffer();

                let logoTop = 30, logoLeft = 30;
                if (logoPosition === 'top-right') { logoTop = 30; logoLeft = width - logoSize - 30; }
                else if (logoPosition === 'bottom-left') { logoTop = height - logoSize - 30; logoLeft = 30; }
                else if (logoPosition === 'bottom-right') { logoTop = height - logoSize - 30; logoLeft = width - logoSize - 30; }

                overlays.push({ input: Buffer.from(ringSvg), top: logoTop - 8, left: logoLeft - 8 });
                overlays.push({ input: roundedLogo, top: logoTop, left: logoLeft });
            } catch (e) {
                console.warn('[Composer] Logo overlay failed:', (e as Error).message);
            }
        }

        // 4. Price pill (top-right, brand color)
        if (priceText && priceText.trim().length > 0) {
            const cleanPrice = escapeXml(priceText.trim().substring(0, 24));
            const pillW = Math.max(180, cleanPrice.length * 16 + 40);
            const pillSvg = `
            <svg width="${pillW}" height="68">
                <defs>
                    <filter id="ps" x="-10%" y="-10%" width="120%" height="120%">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
                        <feOffset dx="0" dy="4"/>
                        <feComponentTransfer><feFuncA type="linear" slope="0.45"/></feComponentTransfer>
                        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                </defs>
                <rect x="0" y="0" width="${pillW}" height="68" rx="34" fill="${brand}" filter="url(#ps)"/>
                <text x="${pillW / 2}" y="46" font-family="DejaVu Sans, Liberation Sans, FreeSans, sans-serif" font-size="30" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">${cleanPrice}</text>
            </svg>`;
            overlays.push({ input: Buffer.from(pillSvg), top: 30, left: width - pillW - 30 });
        }

        // 5. Headline + CTA banner at bottom
        if (applyText && (headlineText || ctaText || brandName)) {
            const head = (headlineText || '').trim().substring(0, 60);
            const cta = (ctaText || '').trim().substring(0, 40);
            const bn = (brandName || '').trim().substring(0, 32);

            const bannerSvg = `
            <svg width="${width}" height="220" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="bannerBg" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="rgba(15,23,42,0)" />
                        <stop offset="35%" stop-color="rgba(15,23,42,0.92)" />
                        <stop offset="100%" stop-color="rgba(2,6,23,0.98)" />
                    </linearGradient>
                    <filter id="bs" x="-5%" y="-10%" width="110%" height="120%">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
                        <feOffset dx="0" dy="3"/>
                        <feComponentTransfer><feFuncA type="linear" slope="0.4"/></feComponentTransfer>
                        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                </defs>
                <rect x="0" y="0" width="${width}" height="220" fill="url(#bannerBg)"/>
                <rect x="0" y="0" width="${width}" height="5" fill="${brand}"/>
                ${bn ? `
                <text x="40" y="55" font-family="DejaVu Sans, Liberation Sans, FreeSans, sans-serif" font-size="22" font-weight="800" fill="${brand}" letter-spacing="3">
                    ${escapeXml(bn.toUpperCase())}
                </text>` : ''}
                ${head ? `
                <text x="40" y="115" font-family="DejaVu Sans, Liberation Sans, FreeSans, sans-serif" font-size="36" font-weight="800" fill="#ffffff">
                    ${escapeXml(head)}
                </text>` : ''}
                ${cta ? `
                <rect x="40" y="150" width="280" height="50" rx="25" fill="${brand}" filter="url(#bs)"/>
                <text x="180" y="183" font-family="DejaVu Sans, Liberation Sans, FreeSans, sans-serif" font-size="18" font-weight="700" fill="#ffffff" text-anchor="middle">
                    ${escapeXml(cta)}
                </text>` : ''}
            </svg>`;
            overlays.push({ input: Buffer.from(bannerSvg), top: height - 220, left: 0 });
        }

        if (overlays.length > 0) baseSharp = baseSharp.composite(overlays);
        const finalBuffer = await baseSharp.jpeg({ quality: 92 }).toBuffer();
        return `data:image/jpeg;base64,${finalBuffer.toString('base64')}`;
    } catch (err: any) {
        console.error('[Composer] Critical Error:', err);
        if (typeof sceneImage === 'string') return sceneImage;
        return `data:image/png;base64,${(sceneImage as Buffer).toString('base64')}`;
    }
}

/**
 * STUDIO PRO tier composite.
 * Applied AFTER Bria Product Shot or FLUX IP-Adapter has already blended the
 * user's product into the scene. Adds a premium ad-grade overlay system on top:
 *   - Floating logo badge with backdrop glow (top-left)
 *   - Brand-color price pill (top-right)
 *   - Glassmorphism headline + CTA banner (bottom)
 *   - Subtle vignette + grain texture for that high-end magazine feel
 */
export async function compositeStudioPro({
    sceneImage,
    logoUrlOrBase64,
    logoPosition = 'top-left',
    brandName,
    primaryColor = '#10b981',
    headlineText,
    ctaText,
    priceText,
    applyLogo = true,
    applyText = true,
    vignette = true,
    grain = true
}: StudioProOptions): Promise<string> {
    const brand = clampHex(primaryColor);
    const accent = clampHex(primaryColor, '#000000');

    try {
        const sceneBuffer = typeof sceneImage === 'string' ? await withTimeout(fetchImageBuffer(sceneImage), 25000, 'scene fetch') : sceneImage;
        const meta = await sharp(sceneBuffer).metadata();
        const width = meta.width || 1024;
        const height = meta.height || 1024;
        let baseSharp = sharp(sceneBuffer).resize(width, height, { fit: 'cover' });
        const overlays: sharp.OverlayOptions[] = [];

        // 1. Vignette (subtle radial darkening from edges to focus the eye)
        if (vignette) {
            const vignetteSvg = `
            <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <radialGradient id="vig" cx="50%" cy="50%" r="65%">
                        <stop offset="50%" stop-color="rgba(0,0,0,0)" />
                        <stop offset="100%" stop-color="rgba(0,0,0,0.55)" />
                    </radialGradient>
                </defs>
                <rect width="100%" height="100%" fill="url(#vig)"/>
            </svg>`;
            overlays.push({ input: Buffer.from(vignetteSvg), top: 0, left: 0 });
        }

        // 2. Logo badge with backdrop glow ring (premium feel)
        if (applyLogo && logoUrlOrBase64 && logoUrlOrBase64.length > 10) {
            try {
                const rawLogo = await withTimeout(fetchImageBuffer(logoUrlOrBase64), 12000, 'logo fetch');
                const logoSize = 140;
                const ringSvg = `
                <svg width="${logoSize + 32}" height="${logoSize + 32}">
                    <defs>
                        <filter id="glo" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="6" result="b"/>
                            <feFlood flood-color="${brand}" flood-opacity="0.7"/>
                            <feComposite in2="b" operator="in"/>
                            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                        <filter id="sho" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur in="SourceAlpha" stdDeviation="10"/>
                            <feOffset dx="0" dy="6"/>
                            <feComponentTransfer><feFuncA type="linear" slope="0.6"/></feComponentTransfer>
                            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                    </defs>
                    <circle cx="${(logoSize + 32) / 2}" cy="${(logoSize + 32) / 2}" r="${(logoSize + 16) / 2}" fill="${brand}" fill-opacity="0.35" filter="url(#glo)"/>
                    <circle cx="${(logoSize + 32) / 2}" cy="${(logoSize + 32) / 2}" r="${(logoSize + 8) / 2}" fill="#ffffff" filter="url(#sho)"/>
                    <circle cx="${(logoSize + 32) / 2}" cy="${(logoSize + 32) / 2}" r="${(logoSize + 6) / 2}" fill="none" stroke="${brand}" stroke-width="4"/>
                </svg>`;

                const roundedLogo = await sharp(rawLogo)
                    .resize(logoSize, logoSize, { fit: 'cover' })
                    .composite([{ input: Buffer.from(`<svg width="${logoSize}" height="${logoSize}"><circle cx="${logoSize / 2}" cy="${logoSize / 2}" r="${logoSize / 2}" fill="#fff"/></svg>`), blend: 'dest-in' }])
                    .png()
                    .toBuffer();

                let logoTop = 36, logoLeft = 36;
                if (logoPosition === 'top-right') { logoTop = 36; logoLeft = width - logoSize - 36; }
                else if (logoPosition === 'bottom-left') { logoTop = height - logoSize - 36; logoLeft = 36; }
                else if (logoPosition === 'bottom-right') { logoTop = height - logoSize - 36; logoLeft = width - logoSize - 36; }

                overlays.push({ input: Buffer.from(ringSvg), top: logoTop - 16, left: logoLeft - 16 });
                overlays.push({ input: roundedLogo, top: logoTop, left: logoLeft });
            } catch (e) {
                console.warn('[Composer Pro] Logo failed:', (e as Error).message);
            }
        }

        // 3. Price pill (top-right area, brand color, premium gloss)
        if (priceText && priceText.trim().length > 0) {
            const cleanPrice = escapeXml(priceText.trim().substring(0, 24));
            const pillW = Math.max(200, cleanPrice.length * 17 + 50);
            const pillSvg = `
            <svg width="${pillW}" height="76">
                <defs>
                    <linearGradient id="gPill" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="${brand}" stop-opacity="1" />
                        <stop offset="100%" stop-color="${accent}" stop-opacity="1" />
                    </linearGradient>
                    <filter id="pSh" x="-10%" y="-10%" width="120%" height="120%">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="8"/>
                        <feOffset dx="0" dy="6"/>
                        <feComponentTransfer><feFuncA type="linear" slope="0.5"/></feComponentTransfer>
                        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                </defs>
                <rect x="0" y="0" width="${pillW}" height="76" rx="38" fill="url(#gPill)" filter="url(#pSh)"/>
                <rect x="3" y="3" width="${pillW - 6}" height="36" rx="18" fill="rgba(255,255,255,0.18)"/>
                <text x="${pillW / 2}" y="50" font-family="DejaVu Sans, Liberation Sans, FreeSans, sans-serif" font-size="32" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">${cleanPrice}</text>
            </svg>`;
            overlays.push({ input: Buffer.from(pillSvg), top: 36, left: width - pillW - 36 });
        }

        // 4. Premium glassmorphism headline + CTA banner at bottom
        if (applyText && (headlineText || ctaText || brandName)) {
            const head = (headlineText || '').trim().substring(0, 70);
            const cta = (ctaText || '').trim().substring(0, 40);
            const bn = (brandName || '').trim().substring(0, 32);

            const bannerSvg = `
            <svg width="${width}" height="260" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="bannerBgP" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="rgba(2,6,23,0)" />
                        <stop offset="30%" stop-color="rgba(2,6,23,0.85)" />
                        <stop offset="100%" stop-color="rgba(0,0,0,0.98)" />
                    </linearGradient>
                    <linearGradient id="ctaG" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="${brand}" />
                        <stop offset="100%" stop-color="${accent}" />
                    </linearGradient>
                    <filter id="ctaSh" x="-10%" y="-10%" width="120%" height="120%">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="10"/>
                        <feOffset dx="0" dy="5"/>
                        <feComponentTransfer><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
                        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                </defs>
                <rect x="0" y="0" width="${width}" height="260" fill="url(#bannerBgP)"/>
                <rect x="0" y="0" width="${width}" height="6" fill="${brand}"/>
                ${bn ? `
                <text x="40" y="60" font-family="DejaVu Sans, Liberation Sans, FreeSans, sans-serif" font-size="20" font-weight="700" fill="${brand}" letter-spacing="4">
                    ${escapeXml(bn.toUpperCase())}
                </text>` : ''}
                ${head ? `
                <text x="40" y="130" font-family="DejaVu Sans, Liberation Sans, FreeSans, sans-serif" font-size="40" font-weight="800" fill="#ffffff">
                    ${escapeXml(head)}
                </text>` : ''}
                ${cta ? `
                <rect x="40" y="170" width="320" height="58" rx="29" fill="url(#ctaG)" filter="url(#ctaSh)"/>
                <text x="200" y="207" font-family="DejaVu Sans, Liberation Sans, FreeSans, sans-serif" font-size="20" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">
                    ${escapeXml(cta)}
                </text>` : ''}
            </svg>`;
            overlays.push({ input: Buffer.from(bannerSvg), top: height - 260, left: 0 });
        }

        // 5. Grain texture overlay (premium film grain, very subtle)
        if (grain) {
            const grainSvg = `
            <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                <filter id="grainFilter">
                    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5"/>
                    <feColorMatrix values="0 0 0 0 1
                                            0 0 0 0 1
                                            0 0 0 0 1
                                            0 0 0 0.06 0"/>
                </filter>
                <rect width="100%" height="100%" filter="url(#grainFilter)"/>
            </svg>`;
            overlays.push({ input: Buffer.from(grainSvg), top: 0, left: 0 });
        }

        if (overlays.length > 0) baseSharp = baseSharp.composite(overlays);
        const finalBuffer = await baseSharp.jpeg({ quality: 95 }).toBuffer();
        return `data:image/jpeg;base64,${finalBuffer.toString('base64')}`;
    } catch (err: any) {
        console.error('[Composer Pro] Critical Error:', err);
        if (typeof sceneImage === 'string') return sceneImage;
        return `data:image/png;base64,${(sceneImage as Buffer).toString('base64')}`;
    }
}

/**
 * VIDEO frame compositor.
 * Returns a single-frame JPEG (1024x1024 or aspect-corrected) with the same
 * overlay system as standard tier — used by video routes to overlay brand
 * elements onto generated video frames before the user shares the video.
 */
export async function compositeVideoFrame(opts: StudioProOptions): Promise<string> {
    return compositeStudioPro({ ...opts, vignette: true, grain: false });
}
