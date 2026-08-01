import sharp from 'sharp';

interface CompositeOptions {
    sceneImage: string | Buffer; // URL or Base64 or Buffer
    productImageBase64?: string | null;
    logoUrlOrBase64?: string | null;
    logoPosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    brandName?: string;
    primaryColor?: string;
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
 * Composites brand logo and/or product photo onto a generated scene background realistically.
 * Returns PNG Data URI.
 */
export async function compositeProductAndLogo({
    sceneImage,
    productImageBase64,
    logoUrlOrBase64,
    logoPosition = 'bottom-right',
    brandName,
    primaryColor = '#10b981'
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
                // Resize product to fit nicely in center-bottom of scene (~420x420)
                const resizedProduct = await sharp(productBuffer)
                    .resize(420, 420, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .toBuffer();

                // Generate a soft ambient drop-shadow under product
                const shadowSvg = `
                <svg width="460" height="460">
                    <ellipse cx="230" cy="400" rx="170" ry="25" fill="black" opacity="0.35" filter="blur(15px)" />
                </svg>`;

                overlays.push({
                    input: Buffer.from(shadowSvg),
                    top: 290,
                    left: 282
                });

                overlays.push({
                    input: resizedProduct,
                    top: 300,
                    left: 302
                });
            } catch (e) {
                console.warn('[Composer] Warning: Could not composite raw product photo, skipping:', e);
            }
        }

        // 2. Composite Brand Logo
        let logoProcessed = false;
        if (logoUrlOrBase64 && logoUrlOrBase64.length > 10) {
            try {
                const rawLogoBuffer = await fetchImageBuffer(logoUrlOrBase64);
                // Resize logo to ~120x120
                const resizedLogo = await sharp(rawLogoBuffer)
                    .resize(120, 120, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                    .toBuffer();

                // Create sleek glassmorphic badge SVG for logo
                const badgeWidth = 150;
                const badgeHeight = 150;
                const badgeSvg = `
                <svg width="${badgeWidth}" height="${badgeHeight}">
                    <rect x="0" y="0" width="${badgeWidth}" height="${badgeHeight}" rx="24" fill="rgba(15, 23, 42, 0.75)" stroke="rgba(255, 255, 255, 0.25)" stroke-width="2" />
                </svg>`;

                const badgeBuffer = await sharp(Buffer.from(badgeSvg))
                    .composite([{ input: resizedLogo, gravity: 'center' }])
                    .png()
                    .toBuffer();

                // Positions
                let top = 840;
                let left = 840;
                if (logoPosition === 'top-right') { top = 34; left = 840; }
                else if (logoPosition === 'top-left') { top = 34; left = 34; }
                else if (logoPosition === 'bottom-left') { top = 840; left = 34; }

                overlays.push({
                    input: badgeBuffer,
                    top,
                    left
                });

                logoProcessed = true;
            } catch (e) {
                console.warn('[Composer] Warning: Could not process brand logo, trying fallback badge:', e);
            }
        }

        // 3. Brand Text Watermark Fallback if logo failed or brandName specified
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
                <rect x="800" y="930" width="190" height="56" rx="14" fill="rgba(15, 23, 42, 0.8)" stroke="rgba(255, 255, 255, 0.2)" />
                <text x="895" y="965" font-family="Arial, sans-serif" font-size="16" font-weight="bold" fill="url(#brandGrad)" text-anchor="middle" letter-spacing="2">
                    ${cleanBrand}
                </text>
            </svg>`;

            overlays.push({
                input: Buffer.from(watermarkSvg),
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
        // Return sceneImage if compositing fails
        if (typeof sceneImage === 'string' && sceneImage.startsWith('data:')) return sceneImage;
        if (typeof sceneImage === 'string') return sceneImage;
        return `data:image/png;base64,${(sceneImage as Buffer).toString('base64')}`;
    }
}
