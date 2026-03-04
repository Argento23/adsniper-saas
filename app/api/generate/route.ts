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
        (prod: string, desc: string) => ({ hd: `ðŸ”¥ ${prod}: El Cambio Que Esperabas`, txt: `Â¿Cansado de lo mismo de siempre?\n\n${desc}\n\nâœ¨ Resultados desde el dÃ­a 1\nðŸ’Ž Calidad premium garantizada\nâš¡ Stock limitado\n\nðŸ‘‰ No dejes pasar esta oportunidad.` }),
        (prod: string, desc: string) => ({ hd: `Esto Va a Cambiar Tu Vida ðŸš€`, txt: `${prod} no es solo un producto.\nEs una inversiÃ³n en ti mismo.\n\nðŸ’ª ${desc}\n\nÂ¿Listo para dar el siguiente paso?\nâ–¶ï¸ Click aquÃ­ antes de que se agote.` }),
        (prod: string, desc: string) => ({ hd: `La Tendencia Que Todos Quieren`, txt: `Miles ya lo tienen. Â¿Y tÃº?\n\n${prod} es el producto del momento:\nâœ“ ${desc}\nâœ“ EnvÃ­o express\nâœ“ GarantÃ­a 100%\n\nðŸŽ Oferta exclusiva HOY.` })
    ],
    PAS: [
        (prod: string, desc: string) => ({ hd: `Â¿SeguirÃ¡s Esperando? â°`, txt: `El problema: Sigues buscando la soluciÃ³n perfecta.\n\nLa realidad: Cada dÃ­a que pasa pierdes oportunidades.\n\nLa soluciÃ³n: ${prod}\n\nâœ… ${desc}\nâœ… Sin complicaciones\nâœ… Resultados comprobados\n\nðŸ”— Haz click ahora.` }),
        (prod: string, desc: string) => ({ hd: `El Error Que Te Cuesta Caro ðŸ’¸`, txt: `Problema: Gastas dinero en cosas que no funcionan.\n\n${prod} es diferente.\n\nPorque realmente:\nâ€¢ ${desc}\nâ€¢ DiseÃ±o pensado en ti\nâ€¢ Precio justo, calidad superior\n\nâš¡ Ãšltima chance de conseguirlo.` }),
        (prod: string, desc: string) => ({ hd: `Ya Basta de Conformarte`, txt: `Te mereces algo mejor.\n\n${prod} llega para cambiar las reglas:\n\nðŸŽ¯ ${desc}\nðŸŽ¯ FÃ¡cil de usar\nðŸŽ¯ Recomendado por expertos\n\nðŸ‘‰ Mejora tu vida HOY.` })
    ],
    PROOF: [
        (prod: string, desc: string) => ({ hd: `â­â­â­â­â­ +10,000 Clientes Felices`, txt: `"Nunca habÃ­a visto algo asÃ­"\n"CambiÃ³ completamente mi rutina"\n"Lo recomiendo 100%"\n\n${prod}: ${desc}\n\nðŸ† Producto mÃ¡s vendido del mes\nâœ… GarantÃ­a de satisfacciÃ³n\n\nÂ¿SerÃ¡s el prÃ³ximo en probarlo?` }),
        (prod: string, desc: string) => ({ hd: `Esto Es Lo Que Dicen Nuestros Clientes ðŸ’¬`, txt: `â­â­â­â­â­ "SuperÃ³ mis expectativas"\nâ­â­â­â­â­ "Lo uso todos los dÃ­as"\nâ­â­â­â­â­ "RelaciÃ³n calidad-precio perfecta"\n\n${prod} - ${desc}\n\nðŸŽ Aprovecha la oferta de lanzamiento.` }),
        (prod: string, desc: string) => ({ hd: `ðŸ”¥ Viral en Redes: ${prod}`, txt: `Todos hablan de esto.\n\nðŸ“¸ +50K publicaciones\nâ¤ï¸ Miles de reseÃ±as positivas\nâš¡ Se estÃ¡ agotando\n\nPor quÃ© lo aman:\nâ€¢ ${desc}\nâ€¢ EnvÃ­o rÃ¡pido\nâ€¢ AtenciÃ³n 24/7\n\nðŸ›’ Consigue el tuyo antes de que sea tarde.` })
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

// IDEOGRAM V2 GENERATOR (Premium Typography & Image-to-Image) via Replicate
async function generateIdeogramImage(prompt: string, referenceImage: string | null = null, isRetry: boolean = false): Promise<string | null> {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token || token.length < 10) return null;

    try {
        const inputPayload: any = {
            prompt: prompt,
            resolution: "1024x1024",
            style_type: "Design", // Forces better typography
            magic_prompt_option: "Off" // APAGADO para evitar que la IA cambie el prompt e invente faltas de ortografía
        };

        // REVERTIDO: No enviamos 'image' ni 'image_weight' porque Ideogram V2 Image-to-Image
        // distorsiona el aspecto original del producto y genera alucinaciones ortográficas ('Desblokua').
        // Ahora solo generará el fondo publicitario prístino con el texto perfecto en Text-to-Image.

        const response = await fetch("https://api.replicate.com/v1/models/ideogram-ai/ideogram-v2-turbo/predictions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                input: inputPayload
            })
        });

        if (!response.ok) {
            if (response.status === 429 && !isRetry) {
                console.warn(`⏳ Replicate Limit (429) hit for Ideogram. Waiting 10s...`);
                await new Promise(r => setTimeout(r, 10500));
                return generateIdeogramImage(prompt, true);
            }
            console.warn(`Ideogram V2 Prediction failed: ${response.status}`);
            return null;
        }

        let prediction = await response.json();
        const getUrl = prediction.urls.get;

        // Poll for completion
        let attempts = 0;
        while (prediction.status !== "succeeded" && prediction.status !== "failed" && attempts < 20) {
            await new Promise((r) => setTimeout(r, 2000));
            attempts++;
            const pollResponse = await fetch(getUrl, {
                headers: { Authorization: `Bearer ${token}` }
            });
            prediction = await pollResponse.json();
        }

        if (prediction.status === "succeeded" && prediction.output) {
            // Replicate usually returns an array of strings (URLs)
            const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
            return imageUrl;
        }

        console.error("Ideogram Generation Failed/Timed Out:", prediction);
        return null;

    } catch (error) {
        console.error("Ideogram API Failed:", error);
        return null;
    }
}

// GROQ API GENERATOR (Llama 3 70B) - Professional Copy & Prompts
async function generateGroqAds(productName: string, desc: string, count: number, lang: string = 'es') {
    const apiKey = process.env.GROQ_API_KEY;
    console.log(`ðŸ”‘ Groq Check: Key Present? ${!!apiKey && apiKey.length > 5}`);

    if (!apiKey || apiKey.length < 10) {
        console.warn("âš ï¸ Groq Key missing or too short.");
        return [{ type: "ERROR", headline: "GROQ KEY MISSING IN ENV", primary_text: "Check .env.local", image_prompt: "error" }];
    }
    try {
        console.log(`ðŸ¦™ Generating ${count} ads with Llama 3 (70b-8192) on Groq...`);
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
      "image_prompt": "Detailed visual description for AI image generation INCLUDING explicit text rendering instructions. Example: 'product on minimal background with typography rendering: \"BUY NOW\", 3d bold font, cinematic lighting'"
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
- CRITICAL FOR IMAGES: The \`image_prompt\` MUST contain the exact same text you wrote for the \`headline\` field. You must include the text inside double quotes, preceded by "typography rendering:".
- Example: If the headline is "¡Vende Más!", your image_prompt MUST end with: typography rendering: "¡Vende Más!". Do not use generic words like "Success" or "Ganar", use the actual headline.
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
            console.error(`âŒ Groq API Error: ${response.status} ${response.statusText}`, errorText);
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
                    console.error("âŒ JSON Parse Failed (Regex):", content);
                    return null;
                }
            } else {
                console.error("âŒ No JSON found in response:", content);
                return null;
            }
        }

        const ads = parsed.ads || parsed;
        if (!Array.isArray(ads)) {
            console.error("âŒ Groq returned invalid structure (not array):", ads);
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
        console.warn("âš ï¸ No GROQ_API_KEY for scripts, using fallback.");
        return generateFallbackScripts(productName, desc, lang);
    }

    const isEs = lang === 'es' || lang.includes('es');

    try {
        console.log(`ðŸŽ¬ Generating AI video scripts with Groq for: ${productName}`);
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
- DO NOT use generic filler like "solucionar tu problema" â€” be SPECIFIC about what the product does

SCRIPT VARIETY (use exactly these 4 angles):
1. POV/Storytelling â€” first person narrative showing the problem â†’ discovery â†’ result
2. Tutorial/How-To â€” quick demo showing the product in use with tips
3. Before/After or Transformation â€” dramatic visual comparison
4. Trend Hijack â€” adapt a current social media trend format to showcase the product

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
            console.log(`âœ… Generated ${scripts.length} AI video scripts`);
            return scripts;
        }
        throw new Error("Empty scripts array");

    } catch (error: any) {
        console.error("âš ï¸ Groq Scripts Failed:", error.message);
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
                title: "POV: DescubrÃ­ esto",
                angle: "Storytelling",
                audio_suggestion: "Trending 'Oh No' remix",
                platform: "TikTok",
                sections: [
                    { type: "Gancho", content: `POV: EstÃ¡s por descubrir ${productName} y tu vida cambia.`, duration: "3s" },
                    { type: "Cuerpo", content: `(CÃ¡mara en mano) Miren lo que acabo de encontrar. ${benefit}. No puedo creer que no lo conocÃ­a antes. La diferencia se nota desde el primer uso.`, duration: "12s" },
                    { type: "CTA", content: `Link en bio. Quedan pocas unidades de ${productName}.`, duration: "4s" }
                ]
            },
            {
                title: "Tutorial Express",
                angle: "How-To",
                audio_suggestion: "Lo-fi study beats",
                platform: "Reels",
                sections: [
                    { type: "Gancho", content: `3 formas de usar ${productName} que no conocÃ­as ðŸ‘‡`, duration: "3s" },
                    { type: "Cuerpo", content: `Tip 1: (mostrar uso principal). Tip 2: (uso creativo). Tip 3: ${benefit}. *Texto en pantalla con cada tip*`, duration: "15s" },
                    { type: "CTA", content: "GuardÃ¡ este video y comprÃ¡ en el link de la bio.", duration: "3s" }
                ]
            },
            {
                title: "Antes vs DespuÃ©s",
                angle: "TransformaciÃ³n",
                audio_suggestion: "Dramatic reveal sound",
                platform: "TikTok",
                sections: [
                    { type: "Gancho", content: `ANTES vs DESPUÃ‰S de usar ${productName} ðŸ˜±`, duration: "3s" },
                    { type: "Cuerpo", content: `(Split screen) Antes: problema comÃºn. DespuÃ©s: ${benefit}. La transformaciÃ³n habla sola.`, duration: "10s" },
                    { type: "CTA", content: "ComentÃ¡ 'ðŸ”¥' y te mando el link.", duration: "3s" }
                ]
            },
            {
                title: "Trend: Cosas que no sabÃ­as",
                angle: "Educativo Viral",
                audio_suggestion: "Audio 'Cosas que no sabÃ­as'",
                platform: "Shorts",
                sections: [
                    { type: "Gancho", content: `Cosas que no sabÃ­as sobre ${productName}:`, duration: "2s" },
                    { type: "Cuerpo", content: `1. ${benefit}. 2. Lo usan mÃ¡s de X profesionales. 3. (dato sorprendente del rubro). *Green screen con imÃ¡genes*`, duration: "12s" },
                    { type: "CTA", content: "Seguime para mÃ¡s y el link estÃ¡ en la bio.", duration: "3s" }
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
                    { type: "Hook", content: `3 ways to use ${productName} you didn't know ðŸ‘‡`, duration: "3s" },
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
                    { type: "Hook", content: `BEFORE vs AFTER using ${productName} ðŸ˜±`, duration: "3s" },
                    { type: "Body", content: `(Split screen) Before: common problem. After: ${benefit}. The transformation speaks for itself.`, duration: "10s" },
                    { type: "CTA", content: "Comment 'ðŸ”¥' and I'll send the link.", duration: "3s" }
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

        let credits = 3;
        let isAdmin = false;
        let clerkUser: any = null;

        try {
            // FIX DEFINITIVO PARA VERCEL Y CLERK BETA 46: 
            // Intentar usar clerkClient si existe, pero si crashea por undefined object, no frenar la app.
            if (typeof clerkClient !== 'undefined' && clerkClient.users) {
                clerkUser = await clerkClient.users.getUser(userId);
                if (clerkUser) {
                    credits = typeof clerkUser.publicMetadata?.credits === 'number' ? clerkUser.publicMetadata.credits : 3;
                    isAdmin = clerkUser.emailAddresses?.some((e: any) => e.emailAddress.toLowerCase() === 'gustavodornhofer@gmail.com');
                }
            } else {
                console.warn("⚠️ Clerk Client users object is undefined in this Beta. Falling back to default limits.");
            }
        } catch (clerkError) {
            console.error("⚠️ Clerk fetch error ignored to prevent crash:", clerkError);
        }

        if (credits <= 0 && !isAdmin) {
            return NextResponse.json({ error: 'NO_CREDITS', message: 'Has usado tus 3 créditos gratuitos. Mejorá tu plan para seguir generando.' }, { status: 403 });
        }

        // Validation
        if (!productUrl && !manual_title) {
            return NextResponse.json({ error: 'URL or Product Name required' }, { status: 400 });
        }

        // DEDUCT CREDIT - MOVED TO END (ONLY ON SUCCESS)
        let remainingCredits = credits;

        console.log(`ðŸŽ¯ Generating ${count} ads for: ${productUrl || manual_title} (Lang: ${language})`);

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
        const n8nUrl = process.env.N8N_WEBHOOK_URL || 'https://manager.generarise.space/webhook/shopify-AdSíntesis';

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
                    console.warn("âš ï¸ n8n returned empty/invalid ads. Triggering LOCAL FALLBACK.");
                    throw new Error("n8n returned empty ads");
                }
            } else {
                throw new Error(`n8n Status: ${response.status}`);
            }

        } catch (n8nError) {
            console.error('âš ï¸ n8n Failed/Empty, using SMART LOCAL FALLBACK:', n8nError);
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
                    console.log("âš ï¸ Groq Failed with Error, showing in UI.");
                    data.ads = [...data.ads, ...groqAds]; // SHOW ERROR IN UI
                } else {
                    console.log(`âœ… Specific Llama 3 ads generated: ${groqAds.length}`);
                    data.ads = [...data.ads, ...groqAds];
                }
            } else {
                const needed = count - data.ads.length;
                console.log(`âš ï¸ Falling back to Local Templates for ${needed} ads.`);
                const extraAds = generateLocalAds(scrapedTitle, scrapedDesc, scrapedImage, manual_image_prompt, needed);
                // Add DEBUG Marker
                extraAds[0].headline = "DEBUG: LOCAL FALLBACK TRIGGERED";
                data.ads = [...data.ads, ...extraAds];
            }
        }


        // Process Ads — SEQUENTIAL REPLICATE (To avoid concurrent rate limits on Ideogram V2)
        if (data.ads && Array.isArray(data.ads)) {
            console.log(`💎 Generating ${data.ads.length} images SEQUENTIALLY with Replicate/Fallbacks...`);

            const processedAds = [];
            for (const ad of data.ads) {
                let basePrompt = ad.image_prompt || manual_image_prompt || manual_title || scrapedTitle;
                if (manual_image_prompt && !ad.image_prompt) {
                    basePrompt = `${basePrompt}, ${manual_image_prompt}`;
                }

                // Forcefully inject the EXACT headline for Ideogram Typographic Rendering
                // NOTE: Normalize to remove accents/tildes so Ideogram doesn't render corrupt squares (á -> a)
                const cleanHeadline = (ad.headline || "")
                    .replace(/["']/g, "")
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[¿¡]/g, "");

                let fullPrompt = `${basePrompt}, professional product photography, 8k, cinematic lighting, high quality, studio setup`;
                if (cleanHeadline) {
                    fullPrompt += `, typography rendering: "${cleanHeadline}"`;
                }

                let finalImageUrl = await (async () => {
                    // 1. TRY IDEOGRAM V2 TEXT-TO-IMAGE or IMAGE-TO-IMAGE
                    try {
                        const ideogramImage = await generateIdeogramImage(fullPrompt, scrapedImage);
                        if (ideogramImage) return ideogramImage;
                    } catch (e) {
                        console.error(`⚠️ Ideogram failed, trying Replicate Flux...`);
                    }

                    // 2. TRY REPLICATE (FLUX)
                    try {
                        const replicateResult = await generateReplicateImage(fullPrompt);
                        if (replicateResult && replicateResult.imageUrl) return replicateResult.imageUrl;
                    } catch (e) {
                        console.error(`⚠️ Replicate failed, trying Pollinations...`);
                    }

                    // 3. FINAL FALLBACK: POLLINATIONS
                    const cleanPrompt = fullPrompt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/gi, '').substring(0, 100).trim().replace(/\s+/g, '_');
                    const seed = Math.floor(Math.random() * 1000000);
                    const rawPollUrl = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=1024&height=1024&nologo=true&seed=${seed}`;
                    // Important: Use the proxy to avoid mixed content or direct timeout issues in the UI
                    return `/api/proxy-image?url=${encodeURIComponent(rawPollUrl)}&fallback=${encodeURIComponent(scrapedImage || '')}`;
                })();

                processedAds.push({ ...ad, generated_image_url: finalImageUrl, product_image_fallback: scrapedImage });
            }

            data.ads = processedAds;

            // DEDUCT CREDIT ONLY AFTER SUCCESSFUL GENERATION
            if (!isAdmin) {
                remainingCredits = credits - 1;
                try {
                    if (typeof clerkClient !== 'undefined' && clerkClient.users && clerkUser) {
                        await clerkClient.users.updateUserMetadata(userId, {
                            publicMetadata: {
                                ...clerkUser.publicMetadata,
                                credits: remainingCredits
                            }
                        });
                    }
                } catch (updateError) {
                    console.error("⚠️ Fallo al actualizar créditos en Clerk, ignorando para no romper la generación:", updateError);
                }
            }
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




