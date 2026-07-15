import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { productInfo } = await req.json();
        const apiKey = process.env.GROQ_API_KEY;

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{
                    role: "system",
                    content: "Eres un director creativo experto en publicidad internacional. Genera 3 guiones cortos (máx 15 seg) para un anuncio de video profesional. Los guiones deben ser persuasivos, modernos y adaptados al mercado global. No uses jergas regionales a menos que sea necesario. Formato: Una lista numerada con el guión."
                }, {
                    role: "user",
                    content: `Producto: ${productInfo || "Producto Premiun"}`
                }]
            })
        });

        const data = await response.json();
        const script = data.choices[0].message.content;

        return NextResponse.json({ success: true, script });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
