const fs = require('fs');
const path = require('path');

async function testFluxReduxReal() {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/REPLICATE_API_KEY=(.*)/);
    const apiKey = match ? match[1].trim() : null;

    if (!apiKey) return;

    const testImage = "https://placehold.co/512x512/00aaff/ffffff.png?text=HEX";

    console.log("Testing black-forest-labs/flux-redux-dev on Replicate with valid image URL...");
    const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-redux-dev/predictions', {
        method: 'POST',
        headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            input: {
                redux_image: testImage,
                prompt: "A cute toddler carefully holding a physical 3D translucent glowing blue hexagonal emblem in small hands, dark studio portrait, soft cinematic lighting, 8k",
                aspect_ratio: "1:1"
            }
        })
    });

    console.log("Status:", res.status);
    let pred = await res.json();
    console.log("Initial Prediction:", pred.id, pred.status);

    let attempts = 0;
    while (pred.status !== 'succeeded' && pred.status !== 'failed' && attempts < 30) {
        await new Promise(r => setTimeout(r, 2000));
        attempts++;
        const poll = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
            headers: { 'Authorization': `Token ${apiKey}` }
        });
        pred = await poll.json();
        console.log(`Poll ${attempts}: status=${pred.status}`);
    }

    console.log("Final Result:", pred.status, pred.output, pred.error);
}

testFluxReduxReal();
