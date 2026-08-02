import sharp from 'sharp';

interface CompositeOptions {
    sceneImage: string | Buffer; // URL or Base64 or Buffer
    productImageBase64?: string | null;
    logoUrlOrBase64?: string | null;
    logoPosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    brandName?: string;
    primaryColor?: string;
    headlineText?: string | null;
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
 * Composites brand logo, product photo, and optional ad text overlay onto a generated scene background realistically.
 * Returns PNG Data URI.
 */
export async function compositeProductAndLogo({
    sceneImage,
    productImageBase64,
    logoUrlOrBase64,
    logoPosition = 'bottom-right',
    brandName,
    primaryColor = '#10b981',
    headlineText
}: CompositeOptions): Promise<string> {
    try {
        const sceneBuffer = typeof sceneImage === 'string' ? await fetchImageBuffer(sceneImage) : sceneImage;

        // Base sharp instance for 1024x1024 square output
        let baseSharp = sharp(sceneBuffer).resize(1024, 1024, { fit: 'cover' });

        const overlays: sharp.OverlayOptions[] = [];

        // 1. Composite Product Image (if provided and not already integrated into AI scene)
        if (productImageBase64 && productImageBase64.length > 50) {
            try {
                const productBuffer = await fetchImageBuffer(productImageBase64);
                // Proportional product resize (~380x380)
                const resizedProduct = await sharp(productBuffer)
                    .resize(380, 380, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .toBuffer();

                // Soft ambient drop-shadow under product
                const shadowSvg = `
                <svg width="420" height="420">
                    <ellipse cx="210" cy="370" rx="150" ry="20" fill="black" opacity="0.3" filter="blur(12px)" />
                </svg>`;

                overlays.push({
                    input: Buffer.from(shadowSvg),
                    top: 320,
                    left: 302
                });

                overlays.push({
                    input: resizedProduct,
                    top: 320,
                    left: 322
                });
            } catch (e) {
                console.warn('[Composer] Could not composite raw product photo:', e);
            }
        }

        // 2. Composite Brand Logo (Proportional, Sleek & Discrete - 64x64 max, no giant box)
        let logoProcessed = false;
        if (logoUrlOrBase64 && logoUrlOrBase64.length > 10) {
            try {
                const rawLogoBuffer = await fetchImageBuffer(logoUrlOrBase64);
                // Discrete proportional logo: 64x64
                const resizedLogo = await sharp(rawLogoBuffer)
                    .resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .toBuffer();

                // Subtle transparent shadow ring badge (80x80 container)
                const badgeWidth = 80;
                const badgeHeight = 80;
                const badgeSvg = `
                <svg width="${badgeWidth}" height="${badgeHeight}">
                    <rect x="0" y="0" width="${badgeWidth}" height="${badgeHeight}" rx="16" fill="rgba(15, 23, 42, 0.45)" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1.5" />
                </svg>`;

                const badgeBuffer = await sharp(Buffer.from(badgeSvg))
                    .composite([{ input: resizedLogo, gravity: 'center' }])
                    .png()
                    .toBuffer();

                // Coordinates for 80x80 badge on 1024x1024 image
                let top = 920;
                let left = 920;
                if (logoPosition === 'top-right') { top = 24; left = 920; }
                else if (logoPosition === 'top-left') { top = 24; left = 24; }
                else if (logoPosition === 'bottom-left') { top = 920; left = 24; }

                overlays.push({
                    input: badgeBuffer,
                    top,
                    left
                });

                logoProcessed = true;
            } catch (e) {
                console.warn('[Composer] Could not process logo, fallback to watermark text:', e);
            }
        }

        // 3. Brand Text Watermark Fallback if logo unavailable
        if (!logoProcessed && brandName) {
            const cleanBrand = brandName.trim().toUpperCase();
            const watermarkSvg = `
            <svg width="1024" height="1024">
                <defs>
                    <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9" />
                        <stop offset="100%" stop-color="${primaryColor}" stop-opacity="0.9" />
                    </linearGradient>
                </defs>
                <rect x="850" y="960" width="150" height="40" rx="10" fill="rgba(15, 23, 42, 0.6)" stroke="rgba(255, 255, 255, 0.15)" />
                <text x="925" y="985" font-family="Arial, sans-serif" font-size="13" font-weight="bold" fill="url(#brandGrad)" text-anchor="middle" letter-spacing="1.5">
                    ${cleanBrand}
                </text>
            </svg>`;

            overlays.push({
                input: Buffer.from(watermarkSvg),
                top: 0,
                left: 0
            });
        }

        // 4. Headline / Copy Overlay on Image (if requested)
        if (headlineText && headlineText.trim().length > 0) {
            const cleanHeadline = headlineText.replace(/["']/g, "").trim().substring(0, 45);
            const textBannerSvg = `
            <svg width="1024" height="1024">
                <defs>
                    <linearGradient id="textBg" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stop-color="rgba(15, 23, 42, 0)" />
                        <stop offset="100%" stop-color="rgba(15, 23, 42, 0.85)" />
                    </linearGradient>
                </defs>
                <rect x="0" y="860" width="1024" height="164" fill="url(#textBg)"/>
                <text x="512" y="915" font-family="Helvetica, Arial, sans-serif" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle" filter="drop-shadow(0px 2px 8px rgba(0,0,0,0.8))">
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
        if (typeof sceneImage === 'string' && sceneImage.startsWith('data:')) return sceneImage;
        if (typeof sceneImage === 'string') return sceneImage;
        return `data:image/png;base64,${(sceneImage as Buffer).toString('base64')}`;
    }
}
