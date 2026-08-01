import { NextResponse } from 'next/server';

export async function GET() {
    const apiKey = process.env.GROQ_API_KEY;
    const keyInfo = apiKey ? `Present (Length: ${apiKey.length})` : 'MISSING';

    // Test the API
    let success = false;
    let message = '';
    let responseText = '';

    if (apiKey) {
        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile", // Use LATEST STABLE model
                    messages: [
                        { role: "user", content: "Say 'Hello from Groq!'" }
                    ]
                    // Removed response_format: { type: "json_object" } for simpler test
                })
            });

            if (response.ok) {
                const json = await response.json();
                message = json.choices[0].message.content;
                success = true;
            } else {
                message = `API Error: ${response.status} ${response.statusText}`;
                responseText = await response.text();
            }
        } catch (error: any) {
            message = `Fetch Error: ${error.message}`;
        }
    } else {
        message = "No API Key found in env.";
    }

    return NextResponse.json({
        key: keyInfo,
        success,
        message,
        details: responseText
    });
}
