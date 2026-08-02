import sharp from 'sharp';

interface CompositeOptions {
    sceneImage: string | Buffer; // URL or Base64 or Buffer
    logoUrlOrBase64?: string | null;
    logoPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    brandName?: string;
    primaryColor?: string;
    headlineText?: string | null;
    applyLogo?: boolean;
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
 * Composites brand logo (discrete badge in corner) and optional headline text overlay onto an AI-generated scene image.
 * NEVER pastes crude product boxes over the middle of the scene.
 */
export async function compositeProductAndLogo({
    sceneImage,
    logoUrlOrBase64,
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

        // 1. Composite Discrete Brand Logo in corner ONLY IF applyLogo is true
        if (applyLogo && logoUrlOrBase64 && logoUrlOrBase64.length > 10) {
            try {
                const rawLogoBuffer = await fetchImageBuffer(logoUrlOrBase64);
                // Sleek, compact logo: max 56x56
                const resizedLogo = await sharp(rawLogoBuffer)
                    .resize(56, 56, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .png()
                    .toBuffer();

                // Coordinates for logo badge in corner
                let top = 24;
                let left = 24; // Default top-left corner
                if (logoPosition === 'top-right') { top = 24; left = 944; }
                else if (logoPosition === 'bottom-left') { top = 944; left = 24; }
                else if (logoPosition === 'bottom-right') { top = 944; left = 944; }

                // Small glassmorphic backing badge (68x68)
                const badgeSvg = `
                <svg width="68" height="68">
                    <rect x="0" y="0" width="68" height="68" rx="14" fill="rgba(15, 23, 42, 0.55)" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1" />
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
            const cleanHeadline = headlineText.replace(/["']/g, "").trim().substring(0, 50);
            const textBannerSvg = `
            <svg width="1024" height="1024">
                <defs>
                    <linearGradient id="textBgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="rgba(15, 23, 42, 0)" />
                        <stop offset="50%" stop-color="rgba(15, 23, 42, 0.75)" />
                        <stop offset="100%" stop-color="rgba(15, 23, 42, 0.95)" />
                    </linearGradient>
                </defs>
                <rect x="0" y="860" width="1024" height="164" fill="url(#textBgGrad)"/>
                <text x="512" y="940" font-family="Arial, sans-serif" font-size="32" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">
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
