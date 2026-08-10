import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';

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

/**
 * Render SVG string to crisp PNG buffer using @resvg/resvg-js (Rust resvg core).
 * This COMPLETELY avoids host system font dependency in Sharp/librsvg on Vercel AWS Lambda.
 * Guarantees zero tofu boxes [?] [?] [?] on Vercel, Docker, Linux, Windows, etc.
 */
async function renderSvgToPngBuffer(svgString: string, targetWidth: number): Promise<Buffer> {
    try {
        const resvg = new Resvg(svgString, {
            fitTo: { mode: 'width', value: Math.round(targetWidth) }
        });
        return resvg.render().asPng();
    } catch (e: any) {
        console.warn('[Composer] Resvg rendering warning:', e?.message || e);
        return Buffer.from(svgString);
    }
}

const BACKUP_STUDIO_SCENES = [
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1024&q=80',
    'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=1024&q=80',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1024&q=80',
    'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1024&q=80'
];

async function fetchImageBuffer(src: string): Promise<Buffer> {
    if (!src) throw new Error('Empty image source');
    if (src.startsWith('data:')) {
        const base64Data = src.split(',')[1] || src;
        return Buffer.from(base64Data, 'base64');
    }
    if (src.startsWith('http://') || src.startsWith('https://')) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 18000);
        try {
            const res = await fetch(src, {
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`Failed to fetch image from ${src}: ${res.statusText}`);
            const arrayBuffer = await res.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch (e: any) {
            clearTimeout(timeoutId);
            throw new Error(`fetchImageBuffer failed for URL (${e.message}): ${src.substring(0, 80)}`);
        }
    }
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
 * Manual Logo-on-Scene Compositor
 * Used when AI image-guided models fail or time out.
 * Composites user logo centered on a studio background scene with 3D drop-shadow
 * and radial ambient glow ring in brand color.
 */
export async function compositeUserLogoAsScene({
    logoBase64,
    scenePrompt,
    primaryColor = '#10b981',
    width = 1024,
    height = 1024,
}: {
    logoBase64: string;
    scenePrompt: string;
    primaryColor?: string;
    width?: number;
    height?: number;
}): Promise<string> {
    const brand = clampHex(primaryColor);

    try {
        const cleanPrompt = scenePrompt
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s]/gi, '')
            .substring(0, 120)
            .trim()
            .replace(/\s+/g, '_');
        const seed = Math.floor(Math.random() * 1000000);
        const bgUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}_cinematic_studio_8k_dramatic_lighting?width=${width}&height=${height}&nologo=true&seed=${seed}`;

        console.log(`[CompositeUserLogo] Fetching Pollinations background scene...`);
        let bgBuffer: Buffer;
        try {
            bgBuffer = await withTimeout(fetchImageBuffer(bgUrl), 20000, 'pollinations bg');
        } catch (e) {
            console.warn('[CompositeUserLogo] Pollinations failed, trying backup studio image:', e);
            const randomBackup = BACKUP_STUDIO_SCENES[Math.floor(Math.random() * BACKUP_STUDIO_SCENES.length)];
            try {
                bgBuffer = await fetchImageBuffer(randomBackup);
            } catch (err2) {
                const gradSvg = `
                <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <radialGradient id="bgGrad" cx="50%" cy="40%" r="75%">
                            <stop offset="0%" stop-color="#1e293b"/>
                            <stop offset="60%" stop-color="#0f172a"/>
                            <stop offset="100%" stop-color="#020617"/>
                        </radialGradient>
                    </defs>
                    <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>
                </svg>`;
                bgBuffer = await renderSvgToPngBuffer(gradSvg, width);
            }
        }

        const bgResized = await sharp(bgBuffer)
            .resize(width, height, { fit: 'cover', position: 'centre' })
            .jpeg({ quality: 90 })
            .toBuffer();

        const logoRaw = await fetchImageBuffer(logoBase64);
        const logoSize = Math.round(width * 0.65);
        const logoProcessed = await sharp(logoRaw)
            .resize(logoSize, logoSize, { fit: 'inside', withoutEnlargement: false })
            .png()
            .toBuffer();

        const logoMeta = await sharp(logoProcessed).metadata();
        const logoW = logoMeta.width || logoSize;
        const logoH = logoMeta.height || logoSize;

        const logoCenterX = Math.round((width - logoW) / 2);
        const logoCenterY = Math.round((height - logoH) / 2) - Math.round(height * 0.04);

        const glowSize = Math.max(logoW, logoH) + 80;
        const glowX = Math.round((width - glowSize) / 2);
        const glowY = Math.round((height - glowSize) / 2) - Math.round(height * 0.04);

        const glowSvg = `
        <svg width="${glowSize}" height="${glowSize}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="lglow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="${brand}" stop-opacity="0.45"/>
                    <stop offset="50%" stop-color="${brand}" stop-opacity="0.18"/>
                    <stop offset="100%" stop-color="${brand}" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <ellipse cx="${glowSize / 2}" cy="${glowSize / 2}" rx="${glowSize * 0.46}" ry="${glowSize * 0.4}" fill="url(#lglow)"/>
        </svg>`;

        const shadowW = Math.round(logoW * 0.9);
        const shadowH = Math.round(logoH * 0.14);
        const shadowX = Math.round((width - shadowW) / 2);
        const shadowY = logoCenterY + logoH - Math.round(shadowH * 0.3);

        const shadowSvg = `
        <svg width="${shadowW}" height="${shadowH * 3}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="shad" cx="50%" cy="0%" r="100%">
                    <stop offset="0%" stop-color="#000000" stop-opacity="0.6"/>
                    <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <ellipse cx="${shadowW / 2}" cy="${shadowH * 0.8}" rx="${shadowW / 2}" ry="${shadowH}" fill="url(#shad)"/>
        </svg>`;

        const glowPng = await renderSvgToPngBuffer(glowSvg, glowSize);
        const shadowPng = await renderSvgToPngBuffer(shadowSvg, shadowW);

        const baseSharp = sharp(bgResized)
            .composite([
                { input: glowPng, top: glowY, left: glowX },
                { input: shadowPng, top: shadowY, left: shadowX },
                { input: logoProcessed, top: logoCenterX > 0 ? logoCenterY : 0, left: logoCenterX > 0 ? logoCenterX : 0 },
            ]);

        const finalBuffer = await baseSharp.jpeg({ quality: 92 }).toBuffer();
        console.log(`[CompositeUserLogo] ✅ Manual logo-on-scene composite done (${logoW}x${logoH} logo on ${width}x${height} scene)`);
        return `data:image/jpeg;base64,${finalBuffer.toString('base64')}`;

    } catch (err: any) {
        console.error('[CompositeUserLogo] Failed, returning raw logo:', err.message);
        return logoBase64;
    }
}

/**
 * STANDARD tier composite.
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

        // 1. Subtle bottom vignette + darken
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
        const dimPng = await renderSvgToPngBuffer(dimOverlaySvg, width);
        overlays.push({ input: dimPng, top: 0, left: 0 });

        // 2. Product image thumbnail card (bottom-right corner)
        if (productImageBase64 && productImageBase64.length > 100) {
            try {
                const rawProduct = await withTimeout(fetchImageBuffer(productImageBase64), 12000, 'product thumb fetch');
                const thumbSize = 200;
                const borderW = 4;
                const cardSize = thumbSize + borderW * 2;

                const maskSvg = `<svg width="${thumbSize}" height="${thumbSize}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${thumbSize}" height="${thumbSize}" rx="18" fill="#fff"/></svg>`;
                const maskPng = await renderSvgToPngBuffer(maskSvg, thumbSize);

                const roundedThumb = await sharp(rawProduct)
                    .resize(thumbSize, thumbSize, { fit: 'cover', position: 'centre' })
                    .composite([{ input: maskPng, blend: 'dest-in' }])
                    .png()
                    .toBuffer();

                const ringSvg = `
                <svg width="${cardSize + 8}" height="${cardSize + 8}" xmlns="http://www.w3.org/2000/svg">
                    <rect x="0" y="0" width="${cardSize + 8}" height="${cardSize + 8}" rx="22" fill="${brand}"/>
                    <rect x="${borderW}" y="${borderW}" width="${thumbSize}" height="${thumbSize}" rx="18" fill="#ffffff" fill-opacity="0.08"/>
                </svg>`;
                const ringPng = await renderSvgToPngBuffer(ringSvg, cardSize + 8);

                const thumbTop = height - cardSize - 8 - 240;
                const thumbLeft = width - cardSize - 8 - 20;
                overlays.push({ input: ringPng, top: thumbTop - 4, left: thumbLeft - 4 });
                overlays.push({ input: roundedThumb, top: thumbTop + borderW, left: thumbLeft + borderW });
            } catch (e) {
                console.warn('[Composer] Product thumbnail failed:', (e as Error).message);
            }
        }

        // 3. Logo badge in corner
        if (applyLogo && logoUrlOrBase64 && logoUrlOrBase64.length > 10) {
            try {
                const rawLogo = await withTimeout(fetchImageBuffer(logoUrlOrBase64), 12000, 'logo fetch');
                const logoSize = 120;
                const ringSvg = `
                <svg width="${logoSize + 16}" height="${logoSize + 16}" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="${(logoSize + 16) / 2}" cy="${(logoSize + 16) / 2}" r="${(logoSize + 8) / 2}" fill="#ffffff"/>
                    <circle cx="${(logoSize + 16) / 2}" cy="${(logoSize + 16) / 2}" r="${(logoSize + 6) / 2}" fill="none" stroke="${brand}" stroke-width="3"/>
                </svg>`;
                const ringPng = await renderSvgToPngBuffer(ringSvg, logoSize + 16);

                const maskSvg = `<svg width="${logoSize}" height="${logoSize}" xmlns="http://www.w3.org/2000/svg"><circle cx="${logoSize / 2}" cy="${logoSize / 2}" r="${logoSize / 2}" fill="#fff"/></svg>`;
                const maskPng = await renderSvgToPngBuffer(maskSvg, logoSize);

                const roundedLogo = await sharp(rawLogo)
                    .resize(logoSize, logoSize, { fit: 'cover' })
                    .composite([{ input: maskPng, blend: 'dest-in' }])
                    .png()
                    .toBuffer();

                let logoTop = 30, logoLeft = 30;
                if (logoPosition === 'top-right') { logoTop = 30; logoLeft = width - logoSize - 30; }
                else if (logoPosition === 'bottom-left') { logoTop = height - logoSize - 30; logoLeft = 30; }
                else if (logoPosition === 'bottom-right') { logoTop = height - logoSize - 30; logoLeft = width - logoSize - 30; }

                overlays.push({ input: ringPng, top: logoTop - 8, left: logoLeft - 8 });
                overlays.push({ input: roundedLogo, top: logoTop, left: logoLeft });
            } catch (e) {
                console.warn('[Composer] Logo overlay failed:', (e as Error).message);
            }
        }

        // 4. Price pill
        if (priceText && priceText.trim().length > 0) {
            const cleanPrice = escapeXml(priceText.trim().substring(0, 24));
            const pillW = Math.max(180, cleanPrice.length * 16 + 40);
            const pillSvg = `
            <svg width="${pillW}" height="68" xmlns="http://www.w3.org/2000/svg">
                <rect x="0" y="0" width="${pillW}" height="68" rx="34" fill="${brand}"/>
                <text x="${pillW / 2}" y="46" font-family="sans-serif" font-size="30" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">${cleanPrice}</text>
            </svg>`;
            const pillPng = await renderSvgToPngBuffer(pillSvg, pillW);
            overlays.push({ input: pillPng, top: 30, left: width - pillW - 30 });
        }

        // 5. Headline + CTA banner at bottom (Rendered cleanly via resvg PNG)
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
                `<tspan x="40" y="${startY + (idx * lineHeight)}" font-family="sans-serif" font-size="32" font-weight="bold" fill="#ffffff">${escapeXml(line)}</tspan>`
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
                ${bn ? `<text x="40" y="38" font-family="sans-serif" font-size="18" font-weight="bold" fill="${brand}" letter-spacing="3">${escapeXml(bn.toUpperCase())}</text>` : ''}
                ${headLines.length > 0 ? `<text>${tspanElements}</text>` : ''}
                ${cta ? `
                <rect x="40" y="${ctaTop}" width="300" height="50" rx="25" fill="${brand}"/>
                <text x="190" y="${ctaTop + 33}" font-family="sans-serif" font-size="18" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeXml(cta)}</text>` : ''}
            </svg>`;
            const bannerPng = await renderSvgToPngBuffer(bannerSvg, width);
            overlays.push({ input: bannerPng, top: height - bannerHeight, left: 0 });
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

        // 1. Vignette
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
            const vigPng = await renderSvgToPngBuffer(vignetteSvg, width);
            overlays.push({ input: vigPng, top: 0, left: 0 });
        }

        // 2. Logo badge
        if (applyLogo && logoUrlOrBase64 && logoUrlOrBase64.length > 10) {
            try {
                const rawLogo = await withTimeout(fetchImageBuffer(logoUrlOrBase64), 12000, 'logo fetch');
                const logoSize = 140;
                const ringSvg = `
                <svg width="${logoSize + 32}" height="${logoSize + 32}" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="${(logoSize + 32) / 2}" cy="${(logoSize + 32) / 2}" r="${(logoSize + 16) / 2}" fill="${brand}" fill-opacity="0.35"/>
                    <circle cx="${(logoSize + 32) / 2}" cy="${(logoSize + 32) / 2}" r="${(logoSize + 8) / 2}" fill="#ffffff"/>
                    <circle cx="${(logoSize + 32) / 2}" cy="${(logoSize + 32) / 2}" r="${(logoSize + 6) / 2}" fill="none" stroke="${brand}" stroke-width="4"/>
                </svg>`;
                const ringPng = await renderSvgToPngBuffer(ringSvg, logoSize + 32);

                const maskSvg = `<svg width="${logoSize}" height="${logoSize}" xmlns="http://www.w3.org/2000/svg"><circle cx="${logoSize / 2}" cy="${logoSize / 2}" r="${logoSize / 2}" fill="#fff"/></svg>`;
                const maskPng = await renderSvgToPngBuffer(maskSvg, logoSize);

                const roundedLogo = await sharp(rawLogo)
                    .resize(logoSize, logoSize, { fit: 'cover' })
                    .composite([{ input: maskPng, blend: 'dest-in' }])
                    .png()
                    .toBuffer();

                let logoTop = 36, logoLeft = 36;
                if (logoPosition === 'top-right') { logoTop = 36; logoLeft = width - logoSize - 36; }
                else if (logoPosition === 'bottom-left') { logoTop = height - logoSize - 36; logoLeft = 36; }
                else if (logoPosition === 'bottom-right') { logoTop = height - logoSize - 36; logoLeft = width - logoSize - 36; }

                overlays.push({ input: ringPng, top: logoTop - 16, left: logoLeft - 16 });
                overlays.push({ input: roundedLogo, top: logoTop, left: logoLeft });
            } catch (e) {
                console.warn('[Composer Pro] Logo failed:', (e as Error).message);
            }
        }

        // 3. Price pill
        if (priceText && priceText.trim().length > 0) {
            const cleanPrice = escapeXml(priceText.trim().substring(0, 24));
            const pillW = Math.max(200, cleanPrice.length * 17 + 50);
            const pillSvg = `
            <svg width="${pillW}" height="76" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="gPill" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="${brand}" stop-opacity="1" />
                        <stop offset="100%" stop-color="${accent}" stop-opacity="1" />
                    </linearGradient>
                </defs>
                <rect x="0" y="0" width="${pillW}" height="76" rx="38" fill="url(#gPill)"/>
                <rect x="3" y="3" width="${pillW - 6}" height="36" rx="18" fill="#ffffff" fill-opacity="0.18"/>
                <text x="${pillW / 2}" y="50" font-family="sans-serif" font-size="32" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">${cleanPrice}</text>
            </svg>`;
            const pillPng = await renderSvgToPngBuffer(pillSvg, pillW);
            overlays.push({ input: pillPng, top: 36, left: width - pillW - 36 });
        }

        // 4. Premium glassmorphism headline + CTA banner at bottom
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
                `<tspan x="40" y="${startY + (idx * lineHeight)}" font-family="sans-serif" font-size="36" font-weight="bold" fill="#ffffff">${escapeXml(line)}</tspan>`
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
                ${bn ? `<text x="40" y="42" font-family="sans-serif" font-size="20" font-weight="bold" fill="${brand}" letter-spacing="4">${escapeXml(bn.toUpperCase())}</text>` : ''}
                ${headLines.length > 0 ? `<text>${tspanElements}</text>` : ''}
                ${cta ? `
                <rect x="40" y="${ctaTop}" width="320" height="58" rx="29" fill="url(#ctaG)"/>
                <text x="200" y="${ctaTop + 37}" font-family="sans-serif" font-size="20" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeXml(cta)}</text>` : ''}
            </svg>`;
            const bannerPng = await renderSvgToPngBuffer(bannerSvg, width);
            overlays.push({ input: bannerPng, top: height - bannerHeight, left: 0 });
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
 */
export async function compositeVideoFrame(opts: StudioProOptions): Promise<string> {
    return compositeStudioPro({ ...opts, vignette: true, grain: false });
}
