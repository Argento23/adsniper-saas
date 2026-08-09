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
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
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

function wrapTextToLines(text: string, maxCharsPerLine = 28, maxLines = 3): string[] {
    if (!text) return [];
    const words = text.trim().split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
        if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
            currentLine = (currentLine + ' ' + word).trim();
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
            if (lines.length >= maxLines - 1) break;
        }
    }
    if (currentLine && lines.length < maxLines) {
        lines.push(currentLine);
    }
    return lines;
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
                    <stop offset="0%" stop-color="#000000" stop-opacity="0" />
                    <stop offset="55%" stop-color="#000000" stop-opacity="0" />
                    <stop offset="100%" stop-color="#000000" stop-opacity="0.38" />
                </linearGradient>
            </defs>
            <rect width="${width}" height="${height}" fill="url(#vignette)"/>
        </svg>`;
        overlays.push({ input: Buffer.from(dimOverlaySvg), top: 0, left: 0 });

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
                <text x="${pillW / 2}" y="46" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">${cleanPrice}</text>
            </svg>`;
            overlays.push({ input: Buffer.from(pillSvg), top: 30, left: width - pillW - 30 });
        }

        // 5. Headline + CTA banner at bottom with MULTILINE WRAPPING
        if (applyText && (headlineText || ctaText || brandName)) {
            const rawHead = (headlineText || '').trim();
            const headLines = wrapTextToLines(rawHead, 30, 3);
            const cta = (ctaText || '').trim().substring(0, 40);
            const bn = (brandName || '').trim().substring(0, 32);

            const lineHeight = 42;
            const textBlockHeight = headLines.length * lineHeight;
            const bannerHeight = Math.max(220, 110 + textBlockHeight + (cta ? 60 : 0));
            const startY = bn ? 65 : 45;

            const tspanElements = headLines.map((line, idx) =>
                `<tspan x="40" y="${startY + (idx * lineHeight)}" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="bold" fill="#ffffff">${escapeXml(line)}</tspan>`
            ).join('');

            const ctaTop = startY + textBlockHeight + 15;

            const bannerSvg = `
            <svg width="${width}" height="${bannerHeight}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="bannerBg" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#0f172a" stop-opacity="0" />
                        <stop offset="30%" stop-color="#0f172a" stop-opacity="0.93" />
                        <stop offset="100%" stop-color="#020617" stop-opacity="0.98" />
                    </linearGradient>
                </defs>
                <rect x="0" y="0" width="${width}" height="${bannerHeight}" fill="url(#bannerBg)"/>
                <rect x="0" y="0" width="${width}" height="5" fill="${brand}"/>
                ${bn ? `<text x="40" y="38" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" fill="${brand}" letter-spacing="3">${escapeXml(bn.toUpperCase())}</text>` : ''}
                ${headLines.length > 0 ? `<text>${tspanElements}</text>` : ''}
                ${cta ? `
                <rect x="40" y="${ctaTop}" width="300" height="50" rx="25" fill="${brand}"/>
                <text x="190" y="${ctaTop + 33}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeXml(cta)}</text>` : ''}
            </svg>`;
            overlays.push({ input: Buffer.from(bannerSvg), top: height - bannerHeight, left: 0 });
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
                </defs>
                <rect x="0" y="0" width="${pillW}" height="76" rx="38" fill="url(#gPill)"/>
                <rect x="3" y="3" width="${pillW - 6}" height="36" rx="18" fill="#ffffff" fill-opacity="0.18"/>
                <text x="${pillW / 2}" y="50" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">${cleanPrice}</text>
            </svg>`;
            overlays.push({ input: Buffer.from(pillSvg), top: 36, left: width - pillW - 36 });
        }

        // 4. Premium glassmorphism headline + CTA banner at bottom with MULTILINE WRAPPING
        if (applyText && (headlineText || ctaText || brandName)) {
            const rawHead = (headlineText || '').trim();
            const headLines = wrapTextToLines(rawHead, 28, 3);
            const cta = (ctaText || '').trim().substring(0, 40);
            const bn = (brandName || '').trim().substring(0, 32);

            const lineHeight = 46;
            const textBlockHeight = headLines.length * lineHeight;
            const bannerHeight = Math.max(260, 120 + textBlockHeight + (cta ? 70 : 0));
            const startY = bn ? 70 : 50;

            const tspanElements = headLines.map((line, idx) =>
                `<tspan x="40" y="${startY + (idx * lineHeight)}" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="bold" fill="#ffffff">${escapeXml(line)}</tspan>`
            ).join('');

            const ctaTop = startY + textBlockHeight + 20;

            const bannerSvg = `
            <svg width="${width}" height="${bannerHeight}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="bannerBgP" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#020617" stop-opacity="0" />
                        <stop offset="30%" stop-color="#020617" stop-opacity="0.88" />
                        <stop offset="100%" stop-color="#000000" stop-opacity="0.98" />
                    </linearGradient>
                    <linearGradient id="ctaG" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="${brand}" />
                        <stop offset="100%" stop-color="${accent}" />
                    </linearGradient>
                </defs>
                <rect x="0" y="0" width="${width}" height="${bannerHeight}" fill="url(#bannerBgP)"/>
                <rect x="0" y="0" width="${width}" height="6" fill="${brand}"/>
                ${bn ? `<text x="40" y="42" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" fill="${brand}" letter-spacing="4">${escapeXml(bn.toUpperCase())}</text>` : ''}
                ${headLines.length > 0 ? `<text>${tspanElements}</text>` : ''}
                ${cta ? `
                <rect x="40" y="${ctaTop}" width="320" height="58" rx="29" fill="url(#ctaG)"/>
                <text x="200" y="${ctaTop + 37}" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeXml(cta)}</text>` : ''}
            </svg>`;
            overlays.push({ input: Buffer.from(bannerSvg), top: height - bannerHeight, left: 0 });
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
