import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

// NOTE: @resvg/resvg-js is loaded dynamically to avoid native .node bundling issues
// in Vercel's webpack pipeline. It's required at runtime inside renderSvgToPngBuffer().

// ─────────────────────────────────────────────────────────────────────────────
// Font Loading (Inter Regular + Bold) — required for SVG text rendering on
// Linux/Vercel where there are no installed system fonts. Without this,
// characters render as tofu boxes (□□□) or nothing at all.
// resvg's `font.fontFiles` expects LOCAL FILE PATHS (not Buffers), so the fonts
// are bundled in the repo at public/fonts/ and ALWAYS present at runtime.
// If the bundle is missing (local edge cases), a multi-CDN /tmp download runs.
// ─────────────────────────────────────────────────────────────────────────────
const BUNDLED_FONTS = [
    { label: 'Regular', file: 'Inter-Regular.otf' },
    { label: 'Bold', file: 'Inter-Bold.otf' },
];

const FONT_DOWNLOAD_URLS: Record<string, string[]> = {
    Regular: [
        'https://cdn.jsdelivr.net/gh/rsms/inter@v3.19/docs/font-files/Inter-Regular.otf',
        'https://raw.githubusercontent.com/rsms/inter/v3.19/docs/font-files/Inter-Regular.otf',
    ],
    Bold: [
        'https://cdn.jsdelivr.net/gh/rsms/inter@v3.19/docs/font-files/Inter-Bold.otf',
        'https://raw.githubusercontent.com/rsms/inter/v3.19/docs/font-files/Inter-Bold.otf',
    ],
};

let fontPathsCache: string[] | null = null;
let fontPathsPromise: Promise<string[] | null> | null = null;

function bundledFontPaths(): string[] | null {
    try {
        const root = process.cwd();
        const paths = BUNDLED_FONTS.map(f => path.join(root, 'public', 'fonts', f.file));
        if (paths.every(p => fs.existsSync(p))) {
            console.log(`✅ [Composer] Using bundled fonts: ${paths.join(', ')}`);
            return paths;
        }
        console.warn('⚠️ [Composer] Bundled fonts not found, falling back to /tmp download...');
        return null;
    } catch {
        return null;
    }
}

async function downloadFontToTmp(label: string, urls: string[]): Promise<string> {
    const tmpDir = process.env.TMPDIR || process.env.TMP || '/tmp';
    const target = path.join(tmpDir, `Inter-${label}.otf`);
    if (fs.existsSync(target)) return target;

    for (const url of urls) {
        try {
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), 12000);
            const res = await fetch(url, {
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0' },
            });
            clearTimeout(t);
            if (!res.ok) continue;
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length < 10000) continue; // reject error pages
            fs.writeFileSync(target, buf);
            console.log(`✅ [Composer] Font ${label} downloaded to ${target}`);
            return target;
        } catch (e: any) {
            console.warn(`⚠️ [Composer] Font download ${label} failed (${url}): ${e.message}`);
        }
    }
    throw new Error(`All font downloads failed for ${label}`);
}

async function ensureFontPaths(): Promise<string[] | null> {
    if (fontPathsCache) return fontPathsCache;
    if (fontPathsPromise) return fontPathsPromise;
    fontPathsPromise = (async () => {
        try {
            const bundled = bundledFontPaths();
            if (bundled) {
                fontPathsCache = bundled;
                return fontPathsCache;
            }
            const regular = await downloadFontToTmp('Regular', FONT_DOWNLOAD_URLS.Regular);
            const bold = await downloadFontToTmp('Bold', FONT_DOWNLOAD_URLS.Bold);
            fontPathsCache = [regular, bold];
            return fontPathsCache;
        } catch (e: any) {
            console.warn(`⚠️ [Composer] No fonts available, SVG text may render empty: ${e.message}`);
            fontPathsCache = null;
            return null;
        }
    })();
    return fontPathsPromise;
}

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

// Emojis (🔥🚀⭐) and other non-Latin symbols have NO glyph in the Inter font
// loaded on Vercel/Lambda → resvg renders tofu boxes (□□□) inside the banner.
// Strip them BEFORE SVG text rendering so the output stays clean.
function stripEmoji(str: string) {
    return (str || '')
        .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{3030}\u{2B50}\u{2764}\u{2934}-\u{2935}]/gu, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function clampHex(hex: string, fallback = '#10b981'): string {
    if (!hex) return fallback;
    const m = hex.match(/^#?([0-9a-fA-F]{6})$/);
    return m ? `#${m[1]}` : fallback;
}

/**
 * Render SVG string to crisp PNG buffer.
 * Tries @resvg/resvg-js first (Rust, no system fonts needed — perfect for Vercel/Lambda).
 * Falls back to Sharp's built-in SVG renderer if native module can't load.
 */
async function renderSvgToPngBuffer(svgString: string, targetWidth: number): Promise<Buffer> {
    try {
        // Dynamic require avoids webpack trying to bundle the native .node binary
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Resvg } = require('@resvg/resvg-js');
        const fontPaths = await ensureFontPaths();
        const resvg = new Resvg(svgString, {
            fitTo: { mode: 'width', value: Math.round(targetWidth) },
            background: 'transparent',
            // fontFiles MUST be file paths (Buffers are not supported by resvg-js)
            font: fontPaths ? { fontFiles: fontPaths, loadSystemFonts: true, defaultFontFamily: 'Inter' } : { loadSystemFonts: true },
        });
        return resvg.render().asPng();
    } catch (e: any) {
        // Fallback: Sharp's SVG renderer (may have font issues on some systems but usually OK)
        try {
            return await sharp(Buffer.from(svgString)).png().toBuffer();
        } catch (e2: any) {
            console.warn('[Composer] SVG render fallback also failed:', e2?.message);
            return Buffer.from(svgString);
        }
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
    backgroundScene,
}: {
    logoBase64: string;
    scenePrompt: string;
    primaryColor?: string;
    width?: number;
    height?: number;
    backgroundScene?: string | null;
}): Promise<string> {
    const brand = clampHex(primaryColor);

    try {
        let bgBuffer: Buffer | null = null;
        if (backgroundScene) {
            // Use the already-generated AI scene instead of a lower-quality
            // Pollinations background, so the user's product is placed ON it.
            try {
                bgBuffer = await withTimeout(fetchImageBuffer(backgroundScene), 20000, 'existing scene fetch');
            } catch (e) {
                console.warn('[CompositeUserLogo] Existing scene fetch failed, generating new background:', e);
            }
        }
        if (!bgBuffer) {
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

        // Precompute banner metrics FIRST so the product thumbnail can be
        // positioned ABOVE the banner (never hidden or overlapping it).
        const rawHeadB = stripEmoji((headlineText || '').trim());
        const headLinesB = applyText ? wrapTextToLines(rawHeadB, 30, 3) : [];
        const ctaB = applyText ? stripEmoji((ctaText || '').trim()).substring(0, 40) : '';
        const bnB = applyText ? stripEmoji((brandName || '').trim()).substring(0, 32) : '';
        const lineHeightB = 42;
        const textBlockHeightB = headLinesB.length * lineHeightB;
        const bannerHeight = (applyText && (headLinesB.length > 0 || ctaB || bnB))
            ? Math.max(220, 110 + textBlockHeightB + (ctaB ? 60 : 0))
            : 0;

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

        // 2. Product image card (bottom-right, ABOVE the text banner)
        if (productImageBase64 && productImageBase64.length > 100) {
            try {
                const rawProduct = await withTimeout(fetchImageBuffer(productImageBase64), 12000, 'product thumb fetch');
                const thumbSize = 300;
                const borderW = 5;
                const cardSize = thumbSize + borderW * 2;

                const maskSvg = `<svg width="${thumbSize}" height="${thumbSize}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${thumbSize}" height="${thumbSize}" rx="22" fill="#fff"/></svg>`;
                const maskPng = await renderSvgToPngBuffer(maskSvg, thumbSize);

                const roundedThumb = await sharp(rawProduct)
                    .resize(thumbSize, thumbSize, { fit: 'cover', position: 'centre' })
                    .composite([{ input: maskPng, blend: 'dest-in' }])
                    .png()
                    .toBuffer();

                const ringSvg = `
                <svg width="${cardSize + 16}" height="${cardSize + 16}" xmlns="http://www.w3.org/2000/svg">
                    <rect x="0" y="0" width="${cardSize + 16}" height="${cardSize + 16}" rx="28" fill="${brand}"/>
                    <rect x="${borderW + 4}" y="${borderW + 4}" width="${thumbSize}" height="${thumbSize}" rx="22" fill="#ffffff" fill-opacity="0.1"/>
                </svg>`;
                const ringPng = await renderSvgToPngBuffer(ringSvg, cardSize + 16);

                const shadowW = Math.round(thumbSize * 0.85);
                const shadowSvg = `
                <svg width="${shadowW}" height="44" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <radialGradient id="pshad" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stop-color="#000000" stop-opacity="0.55"/>
                            <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
                        </radialGradient>
                    </defs>
                    <ellipse cx="${shadowW / 2}" cy="22" rx="${shadowW / 2}" ry="22" fill="url(#pshad)"/>
                </svg>`;
                const shadowPng = await renderSvgToPngBuffer(shadowSvg, shadowW);

                const thumbTop = height - bannerHeight - thumbSize - 64;
                const thumbLeft = width - thumbSize - 40;

                overlays.push({ input: shadowPng, top: thumbTop + thumbSize + 26, left: thumbLeft + Math.round((thumbSize - shadowW) / 2) });
                overlays.push({ input: ringPng, top: thumbTop - 8, left: thumbLeft - 8 });
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

                // Contain (not crop): wide/tall logos fit INSIDE the circle without damage
                const logoFit = Math.round(logoSize * 0.72);
                const logoResized = await sharp(rawLogo)
                    .resize(logoFit, logoFit, { fit: 'inside', withoutEnlargement: true })
                    .png()
                    .toBuffer();
                const logoMeta2 = await sharp(logoResized).metadata();
                const lw = logoMeta2.width || logoFit;
                const lh = logoMeta2.height || logoFit;
                const roundedLogo = await sharp({
                    create: { width: logoSize, height: logoSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
                })
                    .composite([{ input: logoResized, top: Math.round((logoSize - lh) / 2), left: Math.round((logoSize - lw) / 2) }])
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
                <text x="${pillW / 2}" y="46" font-family="DejaVu Sans, Liberation Sans, Noto Sans, Arial, Helvetica, sans-serif" font-size="30" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">${cleanPrice}</text>
            </svg>`;
            const pillPng = await renderSvgToPngBuffer(pillSvg, pillW);
            overlays.push({ input: pillPng, top: 30, left: width - pillW - 30 });
        }

        // 5. Headline + CTA banner at bottom (Rendered cleanly via resvg PNG)
        if (bannerHeight > 0) {
            const startY = bnB ? 65 : 45;

            const tspanElements = headLinesB.map((line, idx) =>
                `<tspan x="40" y="${startY + (idx * lineHeightB)}" font-family="DejaVu Sans, Liberation Sans, Noto Sans, Arial, Helvetica, sans-serif" font-size="32" font-weight="bold" fill="#ffffff">${escapeXml(line)}</tspan>`
            ).join('');

            const ctaTop = startY + textBlockHeightB + 15;
            const ctaFont = 18;
            const ctaPillW = Math.min(width - 80, Math.max(200, Math.round(ctaB.length * ctaFont * 0.62) + 56));
            const ctaTextX = 40 + ctaPillW / 2;

            const bannerSvg = `
            <svg width="${width}" height="${bannerHeight}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="bannerBg" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#0f172a" stop-opacity="0" />
                        <stop offset="20%" stop-color="#0f172a" stop-opacity="0.9" />
                        <stop offset="100%" stop-color="#020617" stop-opacity="0.98" />
                    </linearGradient>
                </defs>
                <rect x="0" y="0" width="${width}" height="${bannerHeight}" fill="url(#bannerBg)"/>
                <rect x="0" y="0" width="${width}" height="5" fill="${brand}"/>
                ${bnB ? `<text x="40" y="38" font-family="DejaVu Sans, Liberation Sans, Noto Sans, Arial, Helvetica, sans-serif" font-size="18" font-weight="bold" fill="${brand}" letter-spacing="3">${escapeXml(bnB.toUpperCase())}</text>` : ''}
                ${headLinesB.length > 0 ? `<text>${tspanElements}</text>` : ''}
                ${ctaB ? `
                <rect x="40" y="${ctaTop}" width="${ctaPillW}" height="50" rx="25" fill="${brand}"/>
                <text x="${ctaTextX}" y="${ctaTop + 33}" font-family="DejaVu Sans, Liberation Sans, Noto Sans, Arial, Helvetica, sans-serif" font-size="${ctaFont}" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeXml(ctaB)}</text>` : ''}
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
    productImageBase64,
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

        // Precompute banner metrics FIRST so the product thumbnail can be
        // positioned ABOVE the banner (never hidden or overlapping it).
        const rawHeadP = stripEmoji((headlineText || '').trim());
        const headLinesP = applyText ? wrapTextToLines(rawHeadP, 28, 3) : [];
        const ctaP = applyText ? stripEmoji((ctaText || '').trim()).substring(0, 40) : '';
        const bnP = applyText ? stripEmoji((brandName || '').trim()).substring(0, 32) : '';
        const lineHeightP = 46;
        const textBlockHeightP = headLinesP.length * lineHeightP;
        const bannerHeightP = (applyText && (headLinesP.length > 0 || ctaP || bnP))
            ? Math.max(260, 120 + textBlockHeightP + (ctaP ? 70 : 0))
            : 0;

        // 0. Product image card (bottom-right, ABOVE the text banner)
        if (productImageBase64 && productImageBase64.length > 100) {
            try {
                const rawProduct = await withTimeout(fetchImageBuffer(productImageBase64), 12000, 'product thumb fetch');
                const thumbSize = 300;
                const borderW = 5;
                const cardSize = thumbSize + borderW * 2;

                const maskSvg = `<svg width="${thumbSize}" height="${thumbSize}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${thumbSize}" height="${thumbSize}" rx="22" fill="#fff"/></svg>`;
                const maskPng = await renderSvgToPngBuffer(maskSvg, thumbSize);

                const roundedThumb = await sharp(rawProduct)
                    .resize(thumbSize, thumbSize, { fit: 'cover', position: 'centre' })
                    .composite([{ input: maskPng, blend: 'dest-in' }])
                    .png()
                    .toBuffer();

                const ringSvg = `
                <svg width="${cardSize + 16}" height="${cardSize + 16}" xmlns="http://www.w3.org/2000/svg">
                    <rect x="0" y="0" width="${cardSize + 16}" height="${cardSize + 16}" rx="28" fill="${brand}"/>
                    <rect x="${borderW + 4}" y="${borderW + 4}" width="${thumbSize}" height="${thumbSize}" rx="22" fill="#ffffff" fill-opacity="0.1"/>
                </svg>`;
                const ringPng = await renderSvgToPngBuffer(ringSvg, cardSize + 16);

                const shadowW = Math.round(thumbSize * 0.85);
                const shadowSvg = `
                <svg width="${shadowW}" height="44" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <radialGradient id="pshadP" cx="50%" cy="50%" r="50%">
                            <stop offset="0%" stop-color="#000000" stop-opacity="0.55"/>
                            <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
                        </radialGradient>
                    </defs>
                    <ellipse cx="${shadowW / 2}" cy="22" rx="${shadowW / 2}" ry="22" fill="url(#pshadP)"/>
                </svg>`;
                const shadowPng = await renderSvgToPngBuffer(shadowSvg, shadowW);

                const thumbTop = height - bannerHeightP - thumbSize - 64;
                const thumbLeft = width - thumbSize - 40;

                overlays.push({ input: shadowPng, top: thumbTop + thumbSize + 26, left: thumbLeft + Math.round((thumbSize - shadowW) / 2) });
                overlays.push({ input: ringPng, top: thumbTop - 8, left: thumbLeft - 8 });
                overlays.push({ input: roundedThumb, top: thumbTop + borderW, left: thumbLeft + borderW });
            } catch (e) {
                console.warn('[Composer Pro] Product thumbnail failed:', (e as Error).message);
            }
        }

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

                // Contain (not crop): wide/tall logos fit INSIDE the circle without damage
                const logoFit = Math.round(logoSize * 0.72);
                const logoResized = await sharp(rawLogo)
                    .resize(logoFit, logoFit, { fit: 'inside', withoutEnlargement: true })
                    .png()
                    .toBuffer();
                const logoMeta2 = await sharp(logoResized).metadata();
                const lw = logoMeta2.width || logoFit;
                const lh = logoMeta2.height || logoFit;
                const roundedLogo = await sharp({
                    create: { width: logoSize, height: logoSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
                })
                    .composite([{ input: logoResized, top: Math.round((logoSize - lh) / 2), left: Math.round((logoSize - lw) / 2) }])
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
                <text x="${pillW / 2}" y="50" font-family="DejaVu Sans, Liberation Sans, Noto Sans, Arial, Helvetica, sans-serif" font-size="32" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">${cleanPrice}</text>
            </svg>`;
            const pillPng = await renderSvgToPngBuffer(pillSvg, pillW);
            overlays.push({ input: pillPng, top: 36, left: width - pillW - 36 });
        }

        // 4. Premium glassmorphism headline + CTA banner at bottom
        if (bannerHeightP > 0) {
            const startY = bnP ? 70 : 50;

            const tspanElements = headLinesP.map((line, idx) =>
                `<tspan x="40" y="${startY + (idx * lineHeightP)}" font-family="DejaVu Sans, Liberation Sans, Noto Sans, Arial, Helvetica, sans-serif" font-size="36" font-weight="bold" fill="#ffffff">${escapeXml(line)}</tspan>`
            ).join('');

            const ctaTop = startY + textBlockHeightP + 20;
            const ctaFont = 20;
            const ctaPillW = Math.min(width - 80, Math.max(220, Math.round(ctaP.length * ctaFont * 0.62) + 64));
            const ctaTextX = 40 + ctaPillW / 2;

            const bannerSvg = `
            <svg width="${width}" height="${bannerHeightP}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="bannerBgP" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="#020617" stop-opacity="0" />
                        <stop offset="20%" stop-color="#020617" stop-opacity="0.88" />
                        <stop offset="100%" stop-color="#000000" stop-opacity="0.98" />
                    </linearGradient>
                    <linearGradient id="ctaG" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="${brand}" />
                        <stop offset="100%" stop-color="${accent}" />
                    </linearGradient>
                </defs>
                <rect x="0" y="0" width="${width}" height="${bannerHeightP}" fill="url(#bannerBgP)"/>
                <rect x="0" y="0" width="${width}" height="6" fill="${brand}"/>
                ${bnP ? `<text x="40" y="42" font-family="DejaVu Sans, Liberation Sans, Noto Sans, Arial, Helvetica, sans-serif" font-size="20" font-weight="bold" fill="${brand}" letter-spacing="4">${escapeXml(bnP.toUpperCase())}</text>` : ''}
                ${headLinesP.length > 0 ? `<text>${tspanElements}</text>` : ''}
                ${ctaP ? `
                <rect x="40" y="${ctaTop}" width="${ctaPillW}" height="58" rx="29" fill="url(#ctaG)"/>
                <text x="${ctaTextX}" y="${ctaTop + 37}" font-family="DejaVu Sans, Liberation Sans, Noto Sans, Arial, Helvetica, sans-serif" font-size="${ctaFont}" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeXml(ctaP)}</text>` : ''}
            </svg>`;
            const bannerPng = await renderSvgToPngBuffer(bannerSvg, width);
            overlays.push({ input: bannerPng, top: height - bannerHeightP, left: 0 });
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
