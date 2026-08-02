import sharp from 'sharp';

interface CompositeOptions {
    sceneImage: string | Buffer; // URL or Base64 or Buffer
    logoUrlOrBase64?: string | null;
    productImageBase64?: string | null;
    logoPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    brandName?: string;
    primaryColor?: string;
    headlineText?: string | null;
    applyLogo?: boolean;
}

function escapeXml(str: string) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

async function fetchImageBuffer(src: string): Promise<Buffer> {
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
    return Buffer.from(src, 'base64');
}

/**
 * Composites brand logo badge and custom text overlay onto an AI-generated scene image.
 * Uses robust SVG text rendering compatible with Linux/Vercel serverless.
 */
export async function compositeProductAndLogo({
    sceneImage,
    logoUrlOrBase64,
    productImageBase64,
    logoPosition = 'top-left',
    brandName,
    primaryColor = '#10b981',
    headlineText,
    applyLogo = true
}: CompositeOptions): Promise<string> {
    try {
        const sceneBuffer = typeof sceneImage === 'string' ? await fetchImageBuffer(sceneImage) : sceneImage;

        // Base sharp instance for 1024x1024 square output
        let baseSharp = sharp(sceneBuffer).resize(1024, 1024, { fit: 'cover' });
        const overlays: sharp.OverlayOptions[] = [];

        // Determine effective logo source (brand logo first, fallback to user uploaded product/logo image)
        const effectiveLogo = logoUrlOrBase64 || productImageBase64;

        // 1. Composite Discrete Brand Logo in corner ONLY IF applyLogo is true
        if (applyLogo && effectiveLogo && effectiveLogo.length > 10) {
            try {
                const rawLogoBuffer = await fetchImageBuffer(effectiveLogo);
                // Sleek, compact logo badge: max 64x64
                const resizedLogo = await sharp(rawLogoBuffer)
                    .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .png()
                    .toBuffer();

                // Coordinates for logo badge in corner
                let top = 24;
                let left = 24; // Default top-left corner
                if (logoPosition === 'top-right') { top = 24; left = 924; }
                else if (logoPosition === 'bottom-left') { top = 924; left = 24; }
                else if (logoPosition === 'bottom-right') { top = 924; left = 924; }

                // Glassmorphic backing badge (76x76)
                const badgeSvg = `
                <svg width="76" height="76" xmlns="http://www.w3.org/2000/svg">
                    <rect x="0" y="0" width="76" height="76" rx="16" fill="rgba(15, 23, 42, 0.65)" stroke="rgba(255, 255, 255, 0.3)" stroke-width="1.5" />
                </svg>`;

                const badgeBuffer = await sharp(Buffer.from(badgeSvg))
                    .composite([{ input: resizedLogo, gravity: 'center' }])
                    .png()
                    .toBuffer();

                overlays.push({
                    input: badgeBuffer,
                    top,
                    left
                });

            } catch (e) {
                console.warn('[Composer] Could not process logo badge:', e);
            }
        }

        // 2. Headline / Custom Copy Overlay at the bottom of the image (if requested)
        if (headlineText && headlineText.trim().length > 0) {
            const cleanHeadline = escapeXml(headlineText.trim().substring(0, 50));
            const textBannerSvg = `
            <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="textBgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="rgba(15, 23, 42, 0)" />
                        <stop offset="40%" stop-color="rgba(15, 23, 42, 0.8)" />
                        <stop offset="100%" stop-color="rgba(15, 23, 42, 0.98)" />
                    </linearGradient>
                </defs>
                <rect x="0" y="850" width="1024" height="174" fill="url(#textBgGrad)"/>
                <text x="512" y="945" font-family="DejaVu Sans, Liberation Sans, FreeSans, sans-serif" font-size="34" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="1">
                    ${cleanHeadline}
                </text>
            </svg>`;

            overlays.push({
                input: Buffer.from(textBannerSvg),
                top: 0,
                left: 0
            });
        }

        if (overlays.length > 0) {
            baseSharp = baseSharp.composite(overlays);
        }

        const finalBuffer = await baseSharp.png({ quality: 95 }).toBuffer();
        return `data:image/png;base64,${finalBuffer.toString('base64')}`;
    } catch (err: any) {
        console.error('[Composer] Critical Compositing Error:', err);
        if (typeof sceneImage === 'string') return sceneImage;
        return `data:image/png;base64,${(sceneImage as Buffer).toString('base64')}`;
    }
}
