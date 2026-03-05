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
const TEMPLATES: Record<string, any> = {
    es: {
        AIDA: [
            (prod: string, desc: string) => ({ hd: `🔥 ${prod}: El Cambio Que Esperabas`, txt: `¿Cansado de lo mismo de siempre?\n\n${desc}\n\n✨ Resultados desde el día 1\n💎 Calidad premium garantizada\n⚡ Stock limitado\n\n👉 No dejes pasar esta oportunidad.` }),
            (prod: string, desc: string) => ({ hd: `Esto Va a Cambiar Tu Vida 🚀`, txt: `${prod} no es solo un producto.\nEs una inversión en ti mismo.\n\n💪 ${desc}\n\n¿Listo para dar el siguiente paso?\n▶️ Click aquí antes de que se agote.` }),
            (prod: string, desc: string) => ({ hd: `La Tendencia Que Todos Quieren`, txt: `Miles ya lo tienen. ¿Y tú?\n\n${prod} es el producto del momento:\n✓ ${desc}\n✓ Envío express\n✓ Garantía 100%\n\n🎁 Oferta exclusiva HOY.` })
        ],
        PAS: [
            (prod: string, desc: string) => ({ hd: `¿Seguirás Esperando? ⏳`, txt: `El problema: Sigues buscando la solución perfecta.\n\nLa realidad: Cada día que pasa pierdes oportunidades.\n\nLa solución: ${prod}\n\n✅ ${desc}\n✅ Sin complicaciones\n✅ Resultados comprobados\n\n🔗 Haz click ahora.` }),
            (prod: string, desc: string) => ({ hd: `El Error Que Te Cuesta Caro 💸`, txt: `Problema: Gastas dinero en cosas que no funcionan.\n\n${prod} es diferente.\n\nPorque realmente:\n• ${desc}\n• Diseño pensado en ti\n• Precio justo, calidad superior\n\n⚡ Última chance de conseguirlo.` }),
            (prod: string, desc: string) => ({ hd: `Ya Basta de Conformarte`, txt: `Te mereces algo mejor.\n\n${prod} llega para cambiar las reglas:\n\n🎯 ${desc}\n🎯 Fácil de usar\n🎯 Recomendado por expertos\n\n👉 Mejora tu vida HOY.` })
        ],
        PROOF: [
            (prod: string, desc: string) => ({ hd: `⭐⭐⭐⭐⭐ +10,000 Clientes Felices`, txt: `"Nunca había visto algo así"\n"Cambió completamente mi rutina"\n"Lo recomiendo 100%"\n\n${prod}: ${desc}\n\n🏆 Producto más vendido del mes\n✅ Garantía de satisfacción\n\n¿Serás el próximo en probarlo?` }),
            (prod: string, desc: string) => ({ hd: `Esto Es Lo Que Dicen Nuestros Clientes 💬`, txt: `⭐⭐⭐⭐⭐ "Superó mis expectativas"\n⭐⭐⭐⭐⭐ "Lo uso todos los días"\n⭐⭐⭐⭐⭐ "Relación calidad-precio perfecta"\n\n${prod} - ${desc}\n\n🎁 Aprovecha la oferta de lanzamiento.` }),
            (prod: string, desc: string) => ({ hd: `🔥 Viral en Redes: ${prod}`, txt: `Todos hablan de esto.\n\n📸 +50K publicaciones\n❤️ Miles de reseñas positivas\n⚡ Se está agotando\n\nPor qué lo aman:\n• ${desc}\n• Envío rápido\n• Atención 24/7\n\n🛒 Consigue el tuyo antes de que sea tarde.` })
        ]
    },
    en: {
        AIDA: [
            (prod: string, desc: string) => ({ hd: `🔥 ${prod}: Time for a Change`, txt: `Tired of the same old things?\n\n${desc}\n\n✨ Results from day 1\n💎 Premium quality\n⚡ Limited stock\n\n👉 Don't miss out.` }),
            (prod: string, desc: string) => ({ hd: `This Will Change Everything 🚀`, txt: `${prod} isn't just a product.\nIt's an investment in yourself.\n\n💪 ${desc}\n\nReady for the next step?\n▶️ Click here before it's gone.` })
        ],
        PAS: [
            (prod: string, desc: string) => ({ hd: `Still Waiting? ⏳`, txt: `Problem: Searching for the perfect solution.\n\nReality: You're losing time.\n\nSolution: ${prod}\n\n✅ ${desc}\n✅ Hassle-free\n✅ Proven results\n\n🔗 Shop now.` }),
            (prod: string, desc: string) => ({ hd: `Stop Settling for Less`, txt: `You deserve better.\n\n${prod} changes the rules:\n\n🎯 ${desc}\n🎯 Easy to use\n🎯 Expert recommended\n\n👉 Upgrade your life TODAY.` })
        ],
        PROOF: [
            (prod: string, desc: string) => ({ hd: `⭐⭐⭐⭐⭐ 10K+ Happy Customers`, txt: `"Never seen anything like it"\n"Completely changed my routine"\n"100% recommended"\n\n${prod}: ${desc}\n\n🏆 Best seller of the month\n✅ Satisfaction guaranteed` }),
            (prod: string, desc: string) => ({ hd: `🔥 Viral Sensation: ${prod}`, txt: `Everyone is talking about this.\n\n📸 50K+ posts\n❤️ Thousands of 5-star reviews\n⚡ Selling out fast\n\n🛒 Get yours before it's too late.` })
        ]
    },
    de: {
        AIDA: [
            (prod: string, desc: string) => ({ hd: `🔥 ${prod}: Die Veränderung, die du brauchst`, txt: `Müde vom immer Gleichen?\n\n${desc}\n\n✨ Ergebnisse ab Tag 1\n💎 Premium-Qualität\n⚡ Begrenzter Vorrat\n\n👉 Verpasse diese Chance nicht.` }),
            (prod: string, desc: string) => ({ hd: `Das wird alles verändern 🚀`, txt: `${prod} ist nicht nur ein Produkt.\nEs ist eine Investition in dich selbst.\n\n💪 ${desc}\n\nBereit für den nächsten Schritt?\n▶️ Klicke hier, bevor es weg ist.` })
        ],
        PAS: [
            (prod: string, desc: string) => ({ hd: `Wartest du immer noch? ⏳`, txt: `Problem: Du suchst nach der perfekten Lösung.\n\nRealität: Du verlierst Zeit.\n\nLösung: ${prod}\n\n✅ ${desc}\n✅ Stressfrei\n✅ Nachgewiesene Ergebnisse\n\n🔗 Jetzt einkaufen.` }),
            (prod: string, desc: string) => ({ hd: `Schluss mit Kompromissen`, txt: `Du verdienst etwas Besseres.\n\n${prod} ändert die Regeln:\n\n🎯 ${desc}\n🎯 Einfach zu bedienen\n🎯 Von Experten empfohlen\n\n👉 Verbessere dein Leben HEUTE.` })
        ],
        PROOF: [
            (prod: string, desc: string) => ({ hd: `⭐⭐⭐⭐⭐ 10K+ Glückliche Kunden`, txt: `"Noch nie sowas gesehen"\n"Hat meine Routine komplett verändert"\n"100% empfehlenswert"\n\n${prod}: ${desc}\n\n🏆 Bestseller des Monats\n✅ Zufriedenheitsgarantie` }),
            (prod: string, desc: string) => ({ hd: `🔥 Viral Sensation: ${prod}`, txt: `Jeder spricht darüber.\n\n📸 50K+ Beiträge\n❤️ Tausende 5-Sterne-Bewertungen\n⚡ Schnell ausverkauft\n\n🛒 Hol dir deins, bevor es zu spät ist.` })
        ]
    }
};

const getRandom = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];

// LOCAL FALLBACK GENERATOR (Ad Copy) - Supports COUNT
function generateLocalAds(productName: string, desc: string, image: string, visualTheme?: string, count: number = 3, lang: string = 'es') {
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
    const langTemplates = TEMPLATES[lang] || TEMPLATES['es'];

    for (let i = 0; i < count; i++) {
        let type = "";
        let template;

        const mode = i % 3;
        if (mode === 0) {
            type = "AIDA";
            template = getRandom(langTemplates.AIDA)(productName, cleanDesc);
        } else if (mode === 1) {
            type = "PAS";
            template = getRandom(langTemplates.PAS)(productName, cleanDesc);
        } else {
            type = "Social Proof";
            template = getRandom(langTemplates.PROOF)(productName, cleanDesc);
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
                return generateIdeogramImage(prompt, null, true);
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
                                "image_prompt": "CRITICAL: A LITERAL, PHYSICAL description of the actual product. NEVER use metaphors. Example: 'A physical [Product Name] resting on a minimal background, 8k, product photography... typography rendering: \"HEADLINE\"'."
                            }
                        ]
                    }

                    GUIDELINES:
                    - Use varied persuasion frameworks (AIDA, PAS, Social Proof, Storytelling)
                    - Include emojis strategically (2-4 per ad)
                    - Create urgency and FOMO
                    - Focus on benefits, not features
                    - Add line breaks (\\n) for readability
                    - CRITICAL FOR IMAGES: The \`image_prompt\` MUST describe the literal PHYSICAL product (${productName}). NO METAPHORS. NO ABSTRACT CONCEPTS. If the product is a car, describe a car driving or parked. Do not draw "success" or "trophies".
                    - The \`image_prompt\` MUST contain the exact same text you wrote for the \`headline\` field. You must include the text inside double quotes, preceded by "typography rendering:".
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
                        content: `You are a viral video content strategist and scriptwriter for TikTok, Instagram Reels, and YouTube Shorts.Create 4 UNIQUE, CREATIVE video scripts for a specific product.

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
        - Reference real trending formats: POV, storytime, day -in -my - life, green screen, duet bait
        - Audio suggestions should reference actual trending sounds or specific music genres
        - ${isEs ? 'Write entirely in SPANISH' : 'Write entirely in ENGLISH'}
        - Make scripts that a creator could actually film and post today
        - Include timing for each section
            - DO NOT use generic filler like "solucionar tu problema" â€” be SPECIFIC about what the product does

SCRIPT VARIETY(use exactly these 4 angles):
        1. POV / Storytelling â€” first person narrative showing the problem â†’ discovery â†’ result
        2. Tutorial / How - To â€” quick demo showing the product in use with tips
3. Before / After or Transformation â€” dramatic visual comparison
        4. Trend Hijack â€” adapt a current social media trend format to showcase the product

NO MARKDOWN.ONLY JSON.`
                    },
                    {
                        role: "user",
                        content: `Product: ${productName} \n\nDescription: ${desc} \n\nCreate 4 unique, platform - specific video scripts that a content creator would actually want to film.`
                    }
                ],
                temperature: 0.8
            })
        });

        if (!response.ok) {
            throw new Error(`Groq Scripts API Error: ${response.status} `);
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
            ? `mejorar tu experiencia con ${productName} `
            : `improve your experience with ${productName} `;
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
                    { type: "Cuerpo", content: `(CÃ¡mara en mano) Miren lo que acabo de encontrar.${benefit}. No puedo creer que no lo conocÃ­a antes.La diferencia se nota desde el primer uso.`, duration: "12s" },
                    { type: "CTA", content: `Link en bio.Quedan pocas unidades de ${productName}.`, duration: "4s" }
                ]
            },
            {
                title: "Tutorial Express",
                angle: "How-To",
                audio_suggestion: "Lo-fi study beats",
                platform: "Reels",
                sections: [
                    { type: "Gancho", content: `3 formas de usar ${productName} que no conocÃ­as ðŸ‘‡`, duration: "3s" },
                    { type: "Cuerpo", content: `Tip 1: (mostrar uso principal). Tip 2: (uso creativo). Tip 3: ${benefit}. * Texto en pantalla con cada tip * `, duration: "15s" },
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
                    { type: "Cuerpo", content: `(Split screen) Antes: problema comÃºn.DespuÃ©s: ${benefit}. La transformaciÃ³n habla sola.`, duration: "10s" },
                    { type: "CTA", content: "ComentÃ¡ 'ðŸ”¥' y te mando el link.", duration: "3s" }
                ]
            },
            {
                title: "Trend: Cosas que no sabÃ­as",
                angle: "Educativo Viral",
                audio_suggestion: "Audio 'Cosas que no sabÃ­as'",
                platform: "Shorts",
                sections: [
                    { type: "Gancho", content: `Cosas que no sabÃ­as sobre ${productName}: `, duration: "2s" },
                    { type: "Cuerpo", content: `1. ${benefit}.2. Lo usan mÃ¡s de X profesionales. 3.(dato sorprendente del rubro). * Green screen con imÃ¡genes * `, duration: "12s" },
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
                    { type: "Body", content: `(Handheld camera) Look what I just found.${benefit}. Can't believe I didn't know about this.The difference is real.`, duration: "12s" },
                    { type: "CTA", content: `Link in bio.Limited stock on ${productName}.`, duration: "4s" }
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
                const extraAds = generateLocalAds(scrapedTitle, scrapedDesc, scrapedImage, manual_image_prompt, needed, language);
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

                // ANCLAJE FÍSICO: Obligamos a empezar el prompt de Ideogram con el nombre real del producto
                let fullPrompt = `A beautiful physical ${scrapedTitle}, ${basePrompt}, professional product photography, 8k, cinematic lighting, high quality, studio setup`;
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




