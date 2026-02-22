import { NextResponse } from 'next/server';

function generateGenerativeSVG(prompt: string) {
    const safeText = prompt ? decodeURIComponent(prompt).replace(/[^a-zA-Z0-9 ]/g, " ").substring(0, 30) : "AI Generated";

    // Simple hash for color
    let hash = 0;
    for (let i = 0; i < safeText.length; i++) hash = safeText.charCodeAt(i) + ((hash << 5) - hash);
    const c1 = `hsl(${Math.abs(hash % 360)}, 70%, 60%)`;
    const c2 = `hsl(${Math.abs((hash + 180) % 360)}, 70%, 40%)`;

    const svg = `
    <svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:${c1};stop-opacity:1" />
                <stop offset="100%" style="stop-color:${c2};stop-opacity:1" />
            </linearGradient>
            <filter id="noise">
                <feTurbulence baseFrequency="0.65" result="noise" />
                <feComposite operator="in" in="noise" in2="SourceGraphic" result="composite" />
                <feBlend mode="overlay" in="composite" in2="SourceGraphic" />
            </filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad)" />
        <rect width="100%" height="100%" filter="url(#noise)" opacity="0.4"/>
        
        <circle cx="50%" cy="50%" r="200" fill="white" opacity="0.1" />
        
        <text x="50%" y="50%" font-family="'Inter', sans-serif" font-weight="900" font-size="40" fill="#ffffff" text-anchor="middle" dominant-baseline="middle" opacity="0.8">
            GENERANDO CREATIVO...
        </text>
    </svg>`;
    return Buffer.from(svg);
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    // Extract prompt from Pollinations URL if possible
    let prompt = "Art";
    if (targetUrl && targetUrl.includes('/prompt/')) {
        const parts = targetUrl.split('/prompt/');
        if (parts[1]) {
            prompt = parts[1].split('?')[0];
        }
    }

    if (!targetUrl) {
        return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

        const response = await fetch(targetUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://google.com',
                'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
            }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`Proxy: Upstream error ${response.status} for url: ${targetUrl}`);

            // Return Generative Art SVG directly
            const svgBuffer = generateGenerativeSVG(prompt);
            return new NextResponse(svgBuffer, {
                headers: {
                    'Content-Type': 'image/svg+xml',
                    'Cache-Control': 'no-store'
                }
            });
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const buffer = await response.arrayBuffer();

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000, immutable'
            }
        });

    } catch (error) {
        console.error('Proxy Error:', error);

        // Return Generative Art SVG directly
        const svgBuffer = generateGenerativeSVG(prompt);
        return new NextResponse(svgBuffer, {
            headers: {
                'Content-Type': 'image/svg+xml',
                'Cache-Control': 'no-store'
            }
        });
    }
}
