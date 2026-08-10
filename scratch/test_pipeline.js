const fs = require('fs');
const path = require('path');

async function uploadBase64ToPublicUrl(base64Data) {
    if (base64Data.startsWith('http://') || base64Data.startsWith('https://')) {
        return base64Data;
    }
    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(cleanBase64, 'base64');
    const blob = new Blob([buffer], { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', blob, 'uploaded_logo.png');

    const res = await fetch('https://tmpfiles.org/api/v1/upload', {
        method: 'POST',
        body: formData
    });
    const data = await res.json();
    if (data && data.data && data.data.url) {
        return data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
    }
    throw new Error("Failed to get public URL");
}

async function testFullPipeline() {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/REPLICATE_API_KEY=(.*)/);
    const apiKey = match ? match[1].trim() : null;

    if (!apiKey) return;

    // Small blue hexagonal logo base64 demo
    const base64Logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    console.log("1. Uploading base64 logo to public URL...");
    const publicUrl = await uploadBase64ToPublicUrl(base64Logo);
    console.log("✅ Public Logo URL:", publicUrl);

    console.log("2. Requesting 3D Scene Synthesis with FLUX Redux...");
    const prompt = "A cute toddler carefully holding a physical 3D translucent glowing blue hexagonal emblem in small hands, dark studio portrait, soft cinematic lighting, 8k commercial photography";

    const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-redux-dev/predictions', {
        method: 'POST',
        headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            input: {
                redux_image: publicUrl,
                prompt: prompt,
                aspect_ratio: "1:1"
            }
        })
    });

    let pred = await res.json();
    console.log("Prediction status:", pred.status, pred.id);

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

    console.log("🎉 FLUX Redux Final Result URL:", pred.output ? pred.output[0] : pred.error);
}

testFullPipeline();
