const fs = require('fs');
const path = require('path');

async function testFluxRedux() {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/REPLICATE_API_KEY=(.*)/);
    const apiKey = match ? match[1].trim() : null;

    if (!apiKey) return;

    // Standard public image URL or data URI
    const testImage = "https://raw.githubusercontent.com/replicate/replicate-javascript/main/test/fixtures/replicate-logo.png";

    console.log("Testing black-forest-labs/flux-redux-dev on Replicate...");
    const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-redux-dev/predictions', {
        method: 'POST',
        headers: {
            'Authorization': `Token ${apiKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait'
        },
        body: JSON.stringify({
            input: {
                redux_image: testImage,
                prompt: "A cute toddler carefully holding a physical 3D translucent glowing blue hexagonal logo block in small hands, studio lighting, photorealistic 8k",
                aspect_ratio: "1:1"
            }
        })
    });

    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Prediction output:", data.status, data.output, data.error);
}

testFluxRedux();
