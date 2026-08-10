const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function testDirectBase64() {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/REPLICATE_API_KEY=(.*)/);
    const apiKey = match ? match[1].trim() : null;

    if (!apiKey) return;

    // Create a real 512x512 blue hexagon PNG image
    const svgHex = `
    <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#090d16"/>
        <polygon points="256,50 430,150 430,360 256,460 82,360 82,150" fill="none" stroke="#00aaff" stroke-width="24"/>
        <polygon points="256,100 380,170 380,340 256,410 132,340 132,170" fill="none" stroke="#00d4ff" stroke-width="16"/>
        <circle cx="256" cy="256" r="40" fill="#00e5ff"/>
    </svg>`;

    const pngBuffer = await sharp(Buffer.from(svgHex)).png().toBuffer();
    const dataUri = `data:image/png;base64,${pngBuffer.toString('base64')}`;

    console.log("🚀 Testing black-forest-labs/flux-redux-dev with direct Data URI...");
    const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-redux-dev/predictions', {
        method: 'POST',
        headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            input: {
                redux_image: dataUri,
                prompt: "A cute toddler carefully holding a physical 3D glowing blue hexagonal emblem in small hands, dark studio background, cinematic lighting, 8k commercial photography",
                aspect_ratio: "1:1"
            }
        })
    });

    console.log("Status:", res.status);
    let pred = await res.json();
    console.log("Prediction ID:", pred.id, "Status:", pred.status);

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

    console.log("🎉 FLUX Redux Final Output:", pred.status, pred.output ? pred.output[0] : pred.error);
}

testDirectBase64();
