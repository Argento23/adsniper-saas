import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { generateReplicateImage } from '@/lib/replicate';
import { checkAndTrackUsage } from '@/lib/usageTracker';

async function scrapeProductMetadata(url: string) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
        });
        clearTimeout(timeoutId);

        if (!response.ok) return null;

        const html = await response.text();

        const getMeta = (prop: string) => {
            const match = html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`, 'i')) ||
                html.match(new RegExp(`<meta name="${prop}" content="([^"]*)"`, 'i'));
            return match ? match[1] : null;
        };

        const getTitle = () => {
            const match = html.match(/<title>([^<]*)<\/title>/i);
            return match ? match[1] : null;
        };

        return {
            title: getMeta('og:title') || getTitle() || 'Producto',
            description: getMeta('og:description') || getMeta('description') || '',
            image: getMeta('og:image') || ''
        };

    } catch (error) {
        console.error('Scraping failed:', error);
        return null;
    }
}

// TEMPLATE RANDOMIZER
const TEMPLATES = {
    AIDA: [
        (prod: string, desc: string) => ({ hd: `🔥 ${prod}: El Cambio Que Esperabas`, txt: `¿Cansado de lo mismo de siempre?\n\n${desc}\n\n✨ Resultados desde el día 1\n💎 Calidad premium garantizada\n⚡ Stock limitado\n\n👉 No dejes pasar esta oportunidad.` }),
        (prod: string, desc: string) => ({ hd: `Esto Va a Cambiar Tu Vida 🚀`, txt: `${prod} no es solo un producto.\nEs una inversión en ti mismo.\n\n💪 ${desc}\n\n¿Listo para dar el siguiente paso?\n▶️ Click aquí antes de que se agote.` }),
        (prod: string, desc: string) => ({ hd: `La Tendencia Que Todos Quieren`, txt: `Miles ya lo tienen. ¿Y tú?\n\n${prod} es el producto del momento:\n✓ ${desc}\n✓ Envío express\n✓ Garantía 100%\n\n🎁 Oferta exclusiva HOY.` })
    ],
    PAS: [
        (prod: string, desc: string) => ({ hd: `¿Seguirás Esperando? ⏰`, txt: `El problema: Sigues buscando la solución perfecta.\n\nLa realidad: Cada día que pasa pierdes oportunidades.\n\nLa solución: ${prod}\n\n✅ ${desc}\n✅ Sin complicaciones\n✅ Resultados comprobados\n\n🔗 Haz click ahora.` }),
        (prod: string, desc: string) => ({ hd: `El Error Que Te Cuesta Caro 💸`, txt: `Problema: Gastas dinero en cosas que no funcionan.\n\n${prod} es diferente.\n\nPorque realmente:\n• ${desc}\n• Diseño pensado en ti\n• Precio justo, calidad superior\n\n⚡ Última chance de conseguirlo.` }),
        (prod: string, desc: string) => ({ hd: `Ya Basta de Conformarte`, txt: `Te mereces algo mejor.\n\n${prod} llega para cambiar las reglas:\n\n🎯 ${desc}\n🎯 Fácil de usar\n🎯 Recomendado por expertos\n\n👉 Mejora tu vida HOY.` })
    ],
    PROOF: [
        (prod: string, desc: string) => ({ hd: `⭐⭐⭐⭐⭐ +10,000 Clientes Felices`, txt: `"Nunca había visto algo así"\n"Cambió completamente mi rutina"\n"Lo recomiendo 100%"\n\n${prod}: ${desc}\n\n🏆 Producto más vendido del mes\n✅ Garantía de satisfacción\n\n¿Serás el próximo en probarlo?` }),
        (prod: string, desc: string) => ({ hd: `Esto Es Lo Que Dicen Nuestros Clientes 💬`, txt: `⭐⭐⭐⭐⭐ "Superó mis expectativas"\n⭐⭐⭐⭐⭐ "Lo uso todos los días"\n⭐⭐⭐⭐⭐ "Relación calidad-precio perfecta"\n\n${prod} - ${desc}\n\n🎁 Aprovecha la oferta de lanzamiento.` }),
        (prod: string, desc: string) => ({ hd: `🔥 Viral en Redes: ${prod}`, txt: `Todos hablan de esto.\n\n📸 +50K publicaciones\n❤️ Miles de reseñas positivas\n⚡ Se está agotando\n\nPor qué lo aman:\n• ${desc}\n• Envío rápido\n• Atención 24/7\n\n🛒 Consigue el tuyo antes de que sea tarde.` })
    ]
};

const getRandom = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];

// LOCAL FALLBACK GENERATOR (Ad Copy) - Supports COUNT
function generateLocalAds(productName: string, desc: string, image: string, visualTheme?: string, count: number = 3) {
    const basePrompt = productName.substring(0, 40).replace(/[^a-zA-Z0-9 ]/g, " ").trim();
    const styleSuffix = visualTheme ? `, ${visualTheme},` : ', professional product photography,';

    // Pollinations URL generator
    const getUrl = (angleStyle: string) => {
        const seed = Math.floor(Math.random() * 9999);
        // ULTRA-CLEAN: No accents, no special chars, underscores only
        const cleanP = `${productName} ${angleStyle}`
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
            .replace(/[^\w\s]/gi, '') // Remove non-alphanumeric
            .substring(0, 100).trim().replace(/\s+/g, '_');

        const rawUrl = `https://image.pollinations.ai/prompt/${cleanP}?width=1024&height=1024&nologo=true&seed=${seed}`;
        // WRAP IN PROXY to avoid browser interventions
        return `/api/proxy-image?url=${encodeURIComponent(rawUrl)}&fallback=${encodeURIComponent(image || '')}`;
    };

    // Smart Description Truncation
    const cleanDesc = desc.replace(/\n/g, ' ').substring(0, 150).trim();

    const ads = [];
    for (let i = 0; i < count; i++) {
        let type = "";
        let template;

        const mode = i % 3;
        if (mode === 0) {
            type = "AIDA";
            template = getRandom(TEMPLATES.AIDA)(productName, cleanDesc);
        } else if (mode === 1) {
            type = "PAS";
            template = getRandom(TEMPLATES.PAS)(productName, cleanDesc);
        } else {
            type = "Social Proof";
            template = getRandom(TEMPLATES.PROOF)(productName, cleanDesc);
        }

        ads.push({
            type: `${type} (Variant ${i + 1})`,
            headline: template.hd,
            primary_text: template.txt,
            generated_image_url: getUrl(type === "AIDA" ? "vibrant close-up" : type === "PAS" ? "minimalist studio" : "lifestyle usage"),
            product_image_fallback: image
        });
    }

    return ads;
}

// HUGGING FACE GENERATOR (Premium)
async function generateHFImage(prompt: string) {
    const token = process.env.HF_TOKEN;
    if (!token || token.length < 10) return null;

    try {
        // Try common endpoints if one fails
        const endpoints = [
            `https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell`,
            `https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell`
        ];

        for (const url of endpoints) {
            try {
                const response = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                        "x-use-cache": "false",
                        "Cache-Control": "no-cache"
                    },
                    method: "POST",
                    body: JSON.stringify({ inputs: prompt }),
                });

                if (response.ok) {
                    const blob = await response.blob();
                    const arrayBuffer = await blob.arrayBuffer();
                    const base64 = Buffer.from(arrayBuffer).toString('base64');
                    return `data:image/jpeg;base64,${base64}`;
                }
                console.warn(`HF Endpoint ${url} failed: ${response.status}`);
            } catch (e) {
                console.error(`HF internal error for ${url}:`, e);
            }
        }
        return null;

    } catch (error) {
        console.error("HF Generation Failed:", error);
        return null;
    }
}

// GROQ API GENERATOR (Llama 3 70B) - Professional Copy & Prompts
async function generateGroqAds(productName: string, desc: string, count: number, lang: string = 'es') {
    const apiKey = process.env.GROQ_API_KEY;
    console.log(`🔑 Groq Check: Key Present? ${!!apiKey && apiKey.length > 5}`);

    if (!apiKey || apiKey.length < 10) {
        console.warn("⚠️ Groq Key missing or too short.");
        return [{ type: "ERROR", headline: "GROQ KEY MISSING IN ENV", primary_text: "Check .env.local", image_prompt: "error" }];
    }
    try {
        console.log(`🦙 Generating ${count} ads with Llama 3 (70b-8192) on Groq...`);
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile", // Revert to LATEST STABLE
                messages: [
                    {
                        role: "system",
                        content: `You are an expert Meta Ads copywriter and creative director. Generate ${count} high-converting ad variations in ${lang === 'es' ? 'SPANISH' : 'ENGLISH'}.

RETURN ONLY VALID JSON with this EXACT structure:
{
  "ads": [
    {
      "type": "Hook Name (e.g. AIDA, PAS, Social Proof)",
      "headline": "Attention-grabbing headline (max 40 chars)",
      "primary_text": "Compelling body copy with emojis, line breaks, benefits-focused, 80-120 words. Use persuasive language, urgency, and social proof.",
      "image_prompt": "Detailed visual description for AI image generation: style, mood, composition, lighting, colors (e.g. 'product on marble surface, soft natural lighting, minimalist aesthetic, pastel colors, 8k, professional photography')"
    }
  ]
}

GUIDELINES:
- Use varied persuasion frameworks (AIDA, PAS, Social Proof, Storytelling)
- Include emojis strategically (2-4 per ad)
- Create urgency and FOMO
- Focus on benefits, not features
- Use power words and sensory language
- Add line breaks (\\n) for readability
- Image prompts must be highly detailed and visual. DO NOT include any text, words, or letters in the image_prompt.
- Each ad must feel UNIQUE and creative

NO MARKDOWN. NO EXPLANATIONS. ONLY JSON.`
                    },
                    {
                        role: "user",
                        content: `Product: ${productName}\n\nDescription: ${desc}\n\nGenerate ${count} CREATIVE, HIGH-CONVERTING ad variations that feel premium and persuasive.`
                    }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Groq API Error: ${response.status} ${response.statusText}`, errorText);
            throw new Error(`Groq API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const json = await response.json();
        const content = json.choices[0].message.content;

        // Robust JSON Extraction
        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch (e) {
            // Try to find JSON block
            const match = content.match(/\{[\s\S]*\}/);
            if (match) {
                try {
                    parsed = JSON.parse(match[0]);
                } catch (e2) {
                    console.error("❌ JSON Parse Failed (Regex):", content);
                    return null;
                }
            } else {
                console.error("❌ No JSON found in response:", content);
                return null;
            }
        }

        const ads = parsed.ads || parsed;
        if (!Array.isArray(ads)) {
            console.error("❌ Groq returned invalid structure (not array):", ads);
            throw new Error(`Invalid JSON Structure: ${JSON.stringify(ads).substring(0, 50)}...`);
        }
        return ads;

    } catch (error: any) {
        console.error("Groq Generation Failed:", error);
        return [{ type: "ERROR", headline: `GROQ ERROR: ${error.message || error}`, primary_text: "Please check logs.", image_prompt: "error" }];
    }
}

async function generateGroqScripts(productName: string, desc: string, lang: string = 'es') {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.warn("⚠️ No GROQ_API_KEY for scripts, using fallback.");
        return generateFallbackScripts(productName, desc, lang);
    }

    const isEs = lang === 'es' || lang.includes('es');

    try {
        console.log(`🎬 Generating AI video scripts with Groq for: ${productName}`);
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    {
                        role: "system",
                        content: `You are a viral video content strategist and scriptwriter for TikTok, Instagram Reels, and YouTube Shorts. Create 4 UNIQUE, CREATIVE video scripts for a specific product.

RETURN ONLY VALID JSON with this EXACT structure:
{
  "scripts": [
    {
      "title": "Creative script name",
      "angle": "Marketing angle used",
      "audio_suggestion": "Specific trending audio or music style",
      "platform": "TikTok / Reels / Shorts",
      "sections": [
        { "type": "${isEs ? 'Gancho' : 'Hook'}", "content": "Opening line that stops the scroll", "duration": "3s" },
        { "type": "${isEs ? 'Cuerpo' : 'Body'}", "content": "Main content with specific details about the product", "duration": "10-15s" },
        { "type": "CTA", "content": "Call to action", "duration": "3-5s" }
      ]
    }
  ]
}

RULES:
- Each script MUST be completely different in tone, format, and approach
- Use SPECIFIC product details from the description, not generic placeholders
- Include stage directions: camera angles, transitions, text overlays, visual effects
- Reference real trending formats: POV, storytime, day-in-my-life, green screen, duet bait
- Audio suggestions should reference actual trending sounds or specific music genres
- ${isEs ? 'Write entirely in SPANISH' : 'Write entirely in ENGLISH'}
- Make scripts that a creator could actually film and post today
- Include timing for each section
- DO NOT use generic filler like "solucionar tu problema" — be SPECIFIC about what the product does

SCRIPT VARIETY (use exactly these 4 angles):
1. POV/Storytelling — first person narrative showing the problem → discovery → result
2. Tutorial/How-To — quick demo showing the product in use with tips
3. Before/After or Transformation — dramatic visual comparison
4. Trend Hijack — adapt a current social media trend format to showcase the product

NO MARKDOWN. ONLY JSON.`
                    },
                    {
                        role: "user",
                        content: `Product: ${productName}\n\nDescription: ${desc}\n\nCreate 4 unique, platform-specific video scripts that a content creator would actually want to film.`
                    }
                ],
                temperature: 0.8
            })
        });

        if (!response.ok) {
            throw new Error(`Groq Scripts API Error: ${response.status}`);
        }

        const json = await response.json();
        const content = json.choices[0].message.content;

        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch {
            const match = content.match(/\{[\s\S]*\}/);
            if (match) parsed = JSON.parse(match[0]);
            else throw new Error("No JSON in Groq scripts response");
        }

        const scripts = parsed.scripts || parsed;
        if (Array.isArray(scripts) && scripts.length > 0) {
            console.log(`✅ Generated ${scripts.length} AI video scripts`);
            return scripts;
        }
        throw new Error("Empty scripts array");

    } catch (error: any) {
        console.error("⚠️ Groq Scripts Failed:", error.message);
        return generateFallbackScripts(productName, desc, lang);
    }
}

function generateFallbackScripts(productName: string, desc: string, lang: string = 'es') {
    const isEs = lang === 'es' || lang.includes('es');

    let benefit = desc
        .replace(/^(Te presentamos|Conoce|Descubre|Mira|Introducing|Meet|Discover|Check out) /gi, "")
        .replace(/\n/g, ' ')
        .trim();

    if (benefit.length > 100) {
        const truncated = benefit.substring(0, 100);
        const lastPeriod = truncated.lastIndexOf('.');
        const lastComma = truncated.lastIndexOf(',');
        const cutPoint = lastPeriod > 50 ? lastPeriod + 1 : (lastComma > 50 ? lastComma : 100);
        benefit = truncated.substring(0, cutPoint).trim();
    }

    if (!benefit || benefit.length < 5) {
        benefit = isEs
            ? `mejorar tu experiencia con ${productName}`
            : `improve your experience with ${productName}`;
    }

    if (isEs) {
        return [
            {
                title: "POV: Descubrí esto",
                angle: "Storytelling",
                audio_suggestion: "Trending 'Oh No' remix",
                platform: "TikTok",
                sections: [
                    { type: "Gancho", content: `POV: Estás por descubrir ${productName} y tu vida cambia.`, duration: "3s" },
                    { type: "Cuerpo", content: `(Cámara en mano) Miren lo que acabo de encontrar. ${benefit}. No puedo creer que no lo conocía antes. La diferencia se nota desde el primer uso.`, duration: "12s" },
                    { type: "CTA", content: `Link en bio. Quedan pocas unidades de ${productName}.`, duration: "4s" }
                ]
            },
            {
                title: "Tutorial Express",
                angle: "How-To",
                audio_suggestion: "Lo-fi study beats",
                platform: "Reels",
                sections: [
                    { type: "Gancho", content: `3 formas de usar ${productName} que no conocías 👇`, duration: "3s" },
                    { type: "Cuerpo", content: `Tip 1: (mostrar uso principal). Tip 2: (uso creativo). Tip 3: ${benefit}. *Texto en pantalla con cada tip*`, duration: "15s" },
                    { type: "CTA", content: "Guardá este video y comprá en el link de la bio.", duration: "3s" }
                ]
            },
            {
                title: "Antes vs Después",
                angle: "Transformación",
                audio_suggestion: "Dramatic reveal sound",
                platform: "TikTok",
                sections: [
                    { type: "Gancho", content: `ANTES vs DESPUÉS de usar ${productName} 😱`, duration: "3s" },
                    { type: "Cuerpo", content: `(Split screen) Antes: problema común. Después: ${benefit}. La transformación habla sola.`, duration: "10s" },
                    { type: "CTA", content: "Comentá '🔥' y te mando el link.", duration: "3s" }
                ]
            },
            {
                title: "Trend: Cosas que no sabías",
                angle: "Educativo Viral",
                audio_suggestion: "Audio 'Cosas que no sabías'",
                platform: "Shorts",
                sections: [
                    { type: "Gancho", content: `Cosas que no sabías sobre ${productName}:`, duration: "2s" },
                    { type: "Cuerpo", content: `1. ${benefit}. 2. Lo usan más de X profesionales. 3. (dato sorprendente del rubro). *Green screen con imágenes*`, duration: "12s" },
                    { type: "CTA", content: "Seguime para más y el link está en la bio.", duration: "3s" }
                ]
            }
        ];
    } else {
        return [
            {
                title: "POV: Found This Gem",
                angle: "Storytelling",
                audio_suggestion: "Trending 'Oh No' remix",
                platform: "TikTok",
                sections: [
                    { type: "Hook", content: `POV: You just discovered ${productName} and everything changes.`, duration: "3s" },
                    { type: "Body", content: `(Handheld camera) Look what I just found. ${benefit}. Can't believe I didn't know about this. The difference is real.`, duration: "12s" },
                    { type: "CTA", content: `Link in bio. Limited stock on ${productName}.`, duration: "4s" }
                ]
            },
            {
                title: "Quick Tutorial",
                angle: "How-To",
                audio_suggestion: "Lo-fi study beats",
                platform: "Reels",
                sections: [
                    { type: "Hook", content: `3 ways to use ${productName} you didn't know 👇`, duration: "3s" },
                    { type: "Body", content: `Tip 1: (show main use). Tip 2: (creative hack). Tip 3: ${benefit}. *On-screen text for each tip*`, duration: "15s" },
                    { type: "CTA", content: "Save this and shop at the link in bio.", duration: "3s" }
                ]
            },
            {
                title: "Before vs After",
                angle: "Transformation",
                audio_suggestion: "Dramatic reveal sound",
                platform: "TikTok",
                sections: [
                    { type: "Hook", content: `BEFORE vs AFTER using ${productName} 😱`, duration: "3s" },
                    { type: "Body", content: `(Split screen) Before: common problem. After: ${benefit}. The transformation speaks for itself.`, duration: "10s" },
                    { type: "CTA", content: "Comment '🔥' and I'll send the link.", duration: "3s" }
                ]
            },
            {
                title: "Things You Didn't Know",
                angle: "Edu-tainment",
                audio_suggestion: "'Things you didn't know' trending audio",
                platform: "Shorts",
                sections: [
                    { type: "Hook", content: `Things you didn't know about ${productName}:`, duration: "2s" },
                    { type: "Body", content: `1. ${benefit}. 2. Used by X+ professionals. 3. (surprising industry fact). *Green screen with images*`, duration: "12s" },
                    { type: "CTA", content: "Follow for more and link is in bio.", duration: "3s" }
                ]
            }
        ];
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { productUrl, manual_title, manual_description, manual_image_prompt, manual_image_base64, brand, count = 3, language = 'es' } = body;

        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = await (await clerkClient()).users.getUser(userId);
        const credits = typeof user.publicMetadata.credits === 'number' ? user.publicMetadata.credits : 3;

        // ADMIN OVERRIDE
        const isAdmin = user.emailAddresses.some(e => e.emailAddress === 'gustavodornhofer@gmail.com');

        if (credits <= 0 && !isAdmin) {
            return NextResponse.json({ error: 'NO_CREDITS', message: 'Has usado tus 3 créditos gratuitos. Mejorá tu plan para seguir generando.' }, { status: 403 });
        }

        // Validation
        if (!productUrl && !manual_title) {
            return NextResponse.json({ error: 'URL or Product Name required' }, { status: 400 });
        }

        // DEDUCT CREDIT
        let remainingCredits = credits;
        if (!isAdmin) {
            remainingCredits = credits - 1;
            await (await clerkClient()).users.updateUserMetadata(userId, {
                publicMetadata: {
                    ...user.publicMetadata,
                    credits: remainingCredits
                }
            });
        }

        console.log(`🎯 Generating ${count} ads for: ${productUrl || manual_title} (Lang: ${language})`);

        let scrapedTitle = manual_title || 'Producto';
        let scrapedDesc = manual_description || '';
        // Prioritize Uploaded Image over Placeholder
        let scrapedImage = manual_image_base64 || ('https://placehold.co/1024x1024/101827/ffffff.png?text=' + encodeURIComponent(manual_title || 'Product'));
        // Only scrape if URL provided (Link Mode)
        if (productUrl) {
            const scraped = await scrapeProductMetadata(productUrl);
            if (scraped) {
                scrapedTitle = scraped.title;
                scrapedDesc = scraped.description;
                if (scraped.image) scrapedImage = scraped.image;
            }
        }

        // Base n8n URL
        const n8nUrl = process.env.N8N_WEBHOOK_URL || 'https://manager.generarise.space/webhook/shopify-adsniper';

        const payload = {
            product_url: productUrl || 'https://manual-input.com',
            language: language,
            brand: brand || {},
            scraped_title: scrapedTitle,
            scraped_description: scrapedDesc,
            manual_image_prompt: manual_image_prompt,
            count: count
        };

        let response;
        let data: any = { ads: [] };

        try {
            // n8n ENABLED - Try it first for best results
            const n8nController = new AbortController();
            const n8nTimeout = setTimeout(() => n8nController.abort(), 12000); // 12s timeout for n8n

            response = await fetch(n8nUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: n8nController.signal
            });
            clearTimeout(n8nTimeout);
            if (response.ok) {
                data = await response.json();
                // PARANOID CHECK
                if (!data || !data.ads || !Array.isArray(data.ads) || data.ads.length === 0) {
                    console.warn("⚠️ n8n returned empty/invalid ads. Triggering LOCAL FALLBACK.");
                    throw new Error("n8n returned empty ads");
                }
            } else {
                throw new Error(`n8n Status: ${response.status}`);
            }

        } catch (n8nError) {
            console.error('⚠️ n8n Failed/Empty, using SMART LOCAL FALLBACK:', n8nError);
            // We use count here to generate ALL ads locally
            data = {
                ads: [], // Leave empty to trigger GROQ HYBRID FILL below
                scripts: await generateGroqScripts(scrapedTitle, scrapedDesc, language),
                product_title: scrapedTitle,
                product_image: scrapedImage,
                _mode: "local_to_groq_fallback"
            };
        }

        // HYBRID FILL: If n8n returned fewer ads than requested, fill the gap locally
        if (data.ads && Array.isArray(data.ads) && data.ads.length < count) {
            // Try Groq First
            const groqAds = await generateGroqAds(scrapedTitle, scrapedDesc, count - data.ads.length, language);

            if (groqAds && Array.isArray(groqAds) && groqAds.length > 0) {
                // Check for ERROR object
                if (groqAds[0].type === "ERROR") {
                    console.log("⚠️ Groq Failed with Error, showing in UI.");
                    data.ads = [...data.ads, ...groqAds]; // SHOW ERROR IN UI
                } else {
                    console.log(`✅ Specific Llama 3 ads generated: ${groqAds.length}`);
                    data.ads = [...data.ads, ...groqAds];
                }
            } else {
                const needed = count - data.ads.length;
                console.log(`⚠️ Falling back to Local Templates for ${needed} ads.`);
                const extraAds = generateLocalAds(scrapedTitle, scrapedDesc, scrapedImage, manual_image_prompt, needed);
                // Add DEBUG Marker
                extraAds[0].headline = "DEBUG: LOCAL FALLBACK TRIGGERED";
                data.ads = [...data.ads, ...extraAds];
            }
        }


        // Process Ads — REPLICATE FIRST (Real Images)
        if (data.ads && Array.isArray(data.ads)) {
            console.log(`💎 Generating ${data.ads.length} REAL images with Replicate Flux.1...`);

            const processedAds = [];
            for (const ad of data.ads) {
                let imageUrl = scrapedImage; // Default fallback

                // Build prompt priority: AI-generated > User input > Product title
                let basePrompt = ad.image_prompt || manual_image_prompt || manual_title || scrapedTitle;

                if (manual_image_prompt && !ad.image_prompt) {
                    basePrompt = `${basePrompt}, ${manual_image_prompt}`;
                }

                const fullPrompt = `${basePrompt}, clean background, no text, no words, no letters, no logos, professional product photography, 8k, cinematic lighting, high quality, studio setup`;

                try {
                    // 1. Try Replicate First (Real AI images)
                    const replicateResult = await generateReplicateImage(fullPrompt);
                    if (replicateResult && replicateResult.imageUrl) {
                        imageUrl = replicateResult.imageUrl;
                        console.log(`✅ Replicate image generated for ad: ${ad.type || 'unknown'}`);
                    } else {
                        throw new Error("Replicate returned no URL");
                    }
                } catch (replicateError: any) {
                    console.error(`❌ Replicate failed: ${replicateError.message}`);

                    // 2. Pollinations fallback (free)
                    try {
                        const cleanPrompt = fullPrompt
                            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                            .replace(/[^\w\s]/gi, '')
                            .substring(0, 100).trim().replace(/\s+/g, '_');

                        const seed = Math.floor(Math.random() * 1000000);
                        const rawPollUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&nologo=true&seed=${seed}`;
                        imageUrl = `/api/proxy-image?url=${encodeURIComponent(rawPollUrl)}&fallback=${encodeURIComponent(scrapedImage || '')}`;
                        console.log(`✅ Pollinations fallback image generated`);
                    } catch (fallbackErr) {
                        console.error("⚠️ All AI fallbacks failed, using product image.");
                    }
                }

                processedAds.push({
                    ...ad,
                    generated_image_url: imageUrl,
                    product_image_fallback: scrapedImage
                });

                // Delay between requests to avoid rate limits
                if (data.ads.length > 1) await new Promise(r => setTimeout(r, 500));
            }
            data.ads = processedAds;
        }

        // Ensure scripts are not undefined if n8n failed to return them
        if (!data.scripts || !Array.isArray(data.scripts) || data.scripts.length === 0) {
            data.scripts = await generateGroqScripts(scrapedTitle, scrapedDesc, language);
        }


        return NextResponse.json({
            ...data,
            product_image: scrapedImage,
            product_title: scrapedTitle || data.product_title,
            _mode: data._mode || "hybrid_ai",
            credits: remainingCredits,
            VERSION_MARKER: "PROXY_V2" // For browser verification
        });

    } catch (error: any) {
        console.error('CRITICAL ERROR:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
