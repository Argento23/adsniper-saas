const fs = require('fs');
const path = require('path');

async function testWanVideo() {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/REPLICATE_API_KEY=(.*)/);
    const apiKey = match ? match[1].trim() : null;

    if (!apiKey) return;

    const imageUrl = "https://replicate.delivery/yhqm/YOloipjB2r4bO5RgLVLdOkstlT5WMkD0eoQ05aBQ7rkYZygLA/out-0.webp";
    const videoPrompt = "Camera rotates slowly around the child holding the glowing 3D logo, cinematic 4k lighting, smooth motion";

    console.log("🚀 Testing wan-video/wan-2.5-i2v on Replicate...");
    const res = await fetch('https://api.replicate.com/v1/models/wan-video/wan-2.5-i2v/predictions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            input: {
                image: imageUrl,
                prompt: videoPrompt
            }
        })
    });

    console.log("Status:", res.status);
    let pred = await res.json();
    console.log("Prediction ID:", pred.id, "Status:", pred.status);

    let attempts = 0;
    while (pred.status !== 'succeeded' && pred.status !== 'failed' && attempts < 40) {
        await new Promise(r => setTimeout(r, 3000));
        attempts++;
        const poll = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        pred = await poll.json();
        console.log(`Poll ${attempts}: status=${pred.status}`);
    }

    console.log("🎬 Wan 2.5 Video Result:", pred.status, pred.output ? pred.output : pred.error);
}

testWanVideo();
