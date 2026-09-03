import { NextResponse } from 'next/server';
import { GROQ_MODEL_CHAIN, isModelNotFoundError } from '@/lib/creative-director';

export const dynamic = 'force-dynamic';

export async function GET() {
    const apiKey = process.env.GROQ_API_KEY;
    const keyInfo = apiKey ? `Present (Length: ${apiKey.length})` : 'MISSING';

    const results: Array<{
        model: string;
        ok: boolean;
        status?: number;
        message?: string;
    }> = [];

    if (!apiKey) {
        return NextResponse.json({
            key: keyInfo,
            success: false,
            message: 'No API Key found in env.',
            models: [],
        });
    }

    // Test each model in the chain.
    for (const model of GROQ_MODEL_CHAIN) {
        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'user', content: "Say 'Hello from Groq!'" },
                    ],
                }),
            });

            if (response.ok) {
                const json = await response.json();
                results.push({
                    model,
                    ok: true,
                    message: json.choices?.[0]?.message?.content ?? '(empty)',
                });
            } else {
                const text = await response.text();
                results.push({
                    model,
                    ok: false,
                    status: response.status,
                    message: isModelNotFoundError(response.status, text)
                        ? 'model_not_found (will be skipped at runtime)'
                        : text.slice(0, 200),
                });
            }
        } catch (e) {
            results.push({
                model,
                ok: false,
                message: `fetch error: ${e instanceof Error ? e.message : String(e)}`,
            });
        }
    }

    const anyOk = results.some(r => r.ok);
    const firstOk = results.find(r => r.ok);

    return NextResponse.json({
        key: keyInfo,
        success: anyOk,
        activeModel: firstOk?.model,
        message: anyOk
            ? `${firstOk?.model} responded: ${firstOk?.message}`
            : 'No model in the chain is reachable with this API key.',
        models: results,
    });
}
