const fs = require('fs');
const path = require('path');

async function testReplicate() {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/REPLICATE_API_KEY=(.*)/);
    const apiKey = match ? match[1].trim() : null;

    console.log("REPLICATE_API_KEY found:", apiKey ? apiKey.substring(0, 8) + "..." : "NONE");
    if (!apiKey) return;

    // Test 1: Flux Schnell text2img
    console.log("\n1. Testing black-forest-labs/flux-schnell...");
    try {
        const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Prefer': 'wait' },
            body: JSON.stringify({ input: { prompt: "A small red ball on a table", num_outputs: 1 } })
        });
        console.log("Flux schnell status:", res.status);
        const data = await res.json();
        console.log("Flux schnell output:", data.status, data.output, data.error);
    } catch(e) { console.error("Flux schnell err:", e.message); }

    // Test 2: Flux Redux Dev
    console.log("\n2. Testing black-forest-labs/flux-redux-dev...");
    try {
        const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-redux-dev/predictions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Prefer': 'wait' },
            body: JSON.stringify({
                input: {
                    main_face_image: "https://replicate.delivery/pbxt/L1gqV2rJbWl1D4N7V3M2wX1/logo.png",
                    prompt: "A cute toddler carefully holding a physical 3D translucent glowing blue hexagonal emblem in small hands",
                    aspect_ratio: "1:1"
                }
            })
        });
        console.log("Flux redux status:", res.status);
        const data = await res.json();
        console.log("Flux redux output:", data.status, data.output, data.error);
    } catch(e) { console.error("Flux redux err:", e.message); }

    // Test 3: Flux Dev Image-to-Image
    console.log("\n3. Testing black-forest-labs/flux-dev (image-to-image)...");
    try {
        const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-dev/predictions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Prefer': 'wait' },
            body: JSON.stringify({
                input: {
                    prompt: "A cute toddler holding a physical 3D blue hexagonal glowing emblem in hands, studio lighting, photorealistic 8k",
                    image: "https://placehold.co/512x512/00aaff/ffffff.png?text=HEX",
                    prompt_strength: 0.8
                }
            })
        });
        console.log("Flux dev status:", res.status);
        const data = await res.json();
        console.log("Flux dev output:", data.status, data.output, data.error);
    } catch(e) { console.error("Flux dev err:", e.message); }

    // Test 4: Check model stability-ai/sdxl or img2img models
    console.log("\n4. Checking wan-video/wan-2.5-i2v model details...");
    try {
        const res = await fetch('https://api.replicate.com/v1/models/wan-video/wan-2.5-i2v', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        console.log("Wan 2.5 status:", res.status);
        const data = await res.json();
        console.log("Wan 2.5 name:", data.name, data.latest_version ? data.latest_version.id : "no latest");
    } catch(e) { console.error("Wan 2.5 err:", e.message); }
}

testReplicate();
