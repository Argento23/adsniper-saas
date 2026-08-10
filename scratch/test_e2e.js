const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Simple E2E check script
async function runE2ETest() {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/REPLICATE_API_KEY=(.*)/);
    const apiKey = match ? match[1].trim() : null;

    console.log("Checking E2E setup with API key:", apiKey ? apiKey.substring(0, 8) + '...' : 'MISSING');
    if (!apiKey) return;

    // Create blue hexagonal logo
    const svgHex = `
    <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#090d16"/>
        <polygon points="256,50 430,150 430,360 256,460 82,360 82,150" fill="none" stroke="#00aaff" stroke-width="24"/>
        <polygon points="256,100 380,170 380,340 256,410 132,340 132,170" fill="none" stroke="#00d4ff" stroke-width="16"/>
        <circle cx="256" cy="256" r="40" fill="#00e5ff"/>
    </svg>`;

    const pngBuffer = await sharp(Buffer.from(svgHex)).png().toBuffer();
    const base64Data = `data:image/png;base64,${pngBuffer.toString('base64')}`;

    // Test ensurePublicUrl directly
    console.log("\n1. Testing ensurePublicUrl on base64 logo...");
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('fileToUpload', new Blob([pngBuffer], { type: 'image/png' }), 'hex_logo.png');

    const catRes = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: formData });
    const publicUrl = (await catRes.text()).trim();
    console.log("✅ Public URL generated:", publicUrl);

    // Test 3D logo synthesis with FLUX Redux
    console.log("\n2. Testing FLUX Redux 3D Scene Synthesis...");
    const prompt = "A cute toddler carefully holding a physical 3D glowing blue hexagonal emblem in small hands, dark studio background, cinematic lighting, 8k commercial photography";

    const reduxRes = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-redux-dev/predictions', {
        method: 'POST',
        headers: { 'Authorization': `Token ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { redux_image: publicUrl, prompt, aspect_ratio: "1:1" } })
    });
    let pred = await reduxRes.json();
    console.log("Redux prediction initiated:", pred.id, pred.status);
}

runE2ETest();
