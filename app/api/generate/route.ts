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

    // Pollinations URL generator (PROXY WRAPPED to avoid 1033)
    const getUrl = (angleStyle: string) => {
        const seed = Math.floor(Math.random() * 9999);
        const p = `${basePrompt}, ${angleStyle}${styleSuffix} 8k, photorealistic, cinematic lighting`;
        const rawUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?width=1024&height=1024&nologo=true&seed=${seed}`;
        // ROUTE THROUGH PROXY
        return `/api/proxy-image?url=${encodeURIComponent(rawUrl)}`;
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
        console.log("🚀 Attempting Hugging Face Generation (Flux.1)...");
        const response = await fetch(
            "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell",
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                method: "POST",
                body: JSON.stringify({ inputs: prompt }),
            }
        );

        if (!response.ok) {
            console.error(`HF Error: ${response.status} ${response.statusText}`);
            return null;
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        return `data:image/jpeg;base64,${base64}`;

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
- Image prompts must be highly detailed and visual
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

function generateLocalScripts(productName: string, desc: string, lang: string = 'es') {
    const isEs = lang === 'es' || lang.includes('es'); // Default to ES if not specified

    // Smart benefit extraction: Use actual description, clean up generic intros
    let benefit = desc
        .replace(/^(Te presentamos|Conoce|Descubre|Mira|Introducing|Meet|Discover|Check out) /gi, "")
        .replace(/\n/g, ' ')
        .trim();

    // If still too long, truncate intelligently at sentence/phrase boundary
    if (benefit.length > 100) {
        const truncated = benefit.substring(0, 100);
        const lastPeriod = truncated.lastIndexOf('.');
        const lastComma = truncated.lastIndexOf(',');
        const cutPoint = lastPeriod > 50 ? lastPeriod + 1 : (lastComma > 50 ? lastComma : 100);
        benefit = truncated.substring(0, cutPoint).trim();
    }

    // Final fallback ONLY if description is completely empty
    if (!benefit || benefit.length < 5) {
        benefit = isEs
            ? `mejorar tu experiencia con ${productName}`
            : `improve your experience with ${productName}`;
    }

    if (isEs) {
        return [
            {
                title: "Estrategia Viral (Hook)",
                angle: "Problema/Agitación",
                audio_suggestion: "Audio en Tendencia 'Suspenso'",
                sections: [
                    { type: "Gancho", content: `¡Deja de hacer scroll si quieres solucionar tu problema con ${productName}!`, duration: "3s" },
                    { type: "Cuerpo", content: `Encontré este cambio de juego. Mira esto: ${benefit}.`, duration: "15s" },
                    { type: "CTA", content: "¡Consigue el tuyo en el link de la bio antes de que se agote!", duration: "5s" }
                ]
            },
            {
                title: "Unboxing ASMR",
                angle: "Satisfacción Visual",
                audio_suggestion: "Lo-fi Chill Beat",
                sections: [
                    { type: "Gancho", content: `(Sin hablar) *Sonido de abrir ${productName}*`, duration: "5s" },
                    { type: "Cuerpo", content: `Mira esta calidad. La textura es una locura. Efectivamente logra ${benefit}.`, duration: "10s" },
                    { type: "CTA", content: "Link en bio para comprar.", duration: "3s" }
                ]
            }
        ];
    } else {
        return [
            {
                title: "Viral Hook Strategy",
                angle: "Problem/Agitation",
                audio_suggestion: "Trending 'Suspense' Audio",
                sections: [
                    { type: "Hook", content: `Stop scrolling if you want to fix your problem with ${productName}!`, duration: "3s" },
                    { type: "Body", content: `I found this game-changer. Look at this: ${benefit}.`, duration: "15s" },
                    { type: "CTA", content: "Get yours now at the link in bio before it's gone!", duration: "5s" }
                ]
            },
            {
                title: "ASMR Unboxing",
                angle: "Satisfying/Visual",
                audio_suggestion: "Lo-fi Chill Beat",
                sections: [
                    { type: "Hook", content: `(No talking) *Sound of unboxing ${productName}*`, duration: "5s" },
                    { type: "Body", content: `Look at this quality. The texture is insane. Effectively ${benefit}.`, duration: "10s" },
                    { type: "CTA", content: "Link in bio to shop.", duration: "3s" }
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
        const credits = typeof user.publicMetadata.credits === 'number' ? user.publicMetadata.credits : 3; // Default 3 credits

        // ADMIN OVERRIDE (Optional: your email)
        const isAdmin = user.emailAddresses.some(e => e.emailAddress === 'gustavodornhofer@gmail.com'); // Admin account with unlimited credits

        if (credits <= 0 && !isAdmin) {
            return NextResponse.json({ error: 'NO_CREDITS', message: 'You have run out of free credits.' }, { status: 403 });
        }

        // Validation: Need EITHER URL OR Manual Data
        if (!productUrl && !manual_title) {
            return NextResponse.json({ error: 'URL or Product Name required' }, { status: 400 });
        }

        // DEDUCT CREDIT (Optimistic - we deduct before generation to prevent spam, can refund on error if strict)
        if (!isAdmin) {
            await (await clerkClient()).users.updateUserMetadata(userId, {
                publicMetadata: {
                    credits: credits - 1
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
        const n8nBaseUrl = process.env.N8N_WEBHOOK_URL ? process.env.N8N_WEBHOOK_URL.replace(/\/shopify-adsniper.*$/, '') : 'https://manager.generarise.space/webhook';
        let n8nUrl = `${n8nBaseUrl}/shopify-adsniper-v8`;

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
                scripts: generateLocalScripts(scrapedTitle, scrapedDesc, language),
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


        // Process Ads (REPLICATE FIRST STRATEGY - Best Quality & Reliability)
        if (data.ads && Array.isArray(data.ads)) {
            console.log("💎 Generating images with Replicate Flux.1 Schnell...");

            data.ads = await Promise.all(data.ads.map(async (ad: any) => {
                let imageUrl = scrapedImage; // Default fallback

                // Build prompt priority: AI-generated > User input > Product title
                let basePrompt = ad.image_prompt || manual_image_prompt || manual_title || scrapedTitle;

                // Add visual style if provided by user
                if (manual_image_prompt && !ad.image_prompt) {
                    basePrompt = `${basePrompt}, ${manual_image_prompt}`;
                }

                // Enhance with professional photography keywords
                const fullPrompt = `${basePrompt}, professional product photography, 8k, cinematic lighting, high quality, studio setup`;

                try {
                    // 1. Try Replicate First
                    const replicateResult = await generateReplicateImage(fullPrompt);
                    if (replicateResult && replicateResult.imageUrl) {
                        imageUrl = replicateResult.imageUrl;
                        console.log(`✅ Replicate image generated for ad: ${ad.type || 'unknown'}`);
                    } else {
                        throw new Error("Replicate returned no URL");
                    }
                } catch (replicateError: any) {
                    console.warn(`⚠️ Replicate failed: ${replicateError.message}. Trying HF Fallback...`);

                    // 2. Try Hugging Face Fallback
                    if (process.env.HF_TOKEN && process.env.HF_TOKEN.length > 10) {
                        const hfImage = await generateHFImage(fullPrompt);
                        if (hfImage) {
                            imageUrl = hfImage;
                            console.log(`✅ HF fallback image generated`);
                        } else {
                            console.warn("⚠️ HF Fallback also failed.");
                        }
                    }
                }

                // 3. Final logic: if still no image, use the product image
                return {
                    ...ad,
                    generated_image_url: imageUrl,
                    product_image_fallback: scrapedImage
                };
            }));
        }

        // Ensure scripts are not undefined if n8n failed to return them
        if (!data.scripts || !Array.isArray(data.scripts) || data.scripts.length === 0) {
            data.scripts = generateLocalScripts(scrapedTitle, scrapedDesc, language);
        }

        return NextResponse.json({
            ...data,
            product_image: scrapedImage,
            product_title: scrapedTitle || data.product_title,
            _mode: data._mode || "hybrid_ai"
        });

    } catch (error: any) {
        console.error('CRITICAL ERROR:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
