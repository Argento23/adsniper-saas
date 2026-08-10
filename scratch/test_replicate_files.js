const fs = require('fs');
const path = require('path');

async function testReplicateFiles() {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/REPLICATE_API_KEY=(.*)/);
    const apiKey = match ? match[1].trim() : null;

    if (!apiKey) {
        console.error("No REPLICATE_API_KEY found");
        return;
    }

    console.log("🔑 Testing Replicate Files API with key:", apiKey.substring(0, 8) + "...");

    // Create a dummy small PNG buffer (1x1 red pixel PNG)
    const dummyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const buffer = Buffer.from(dummyPngBase64, 'base64');

    try {
        // Test POST https://api.replicate.com/v1/files
        const response = await fetch('https://api.replicate.com/v1/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'image/png'
            },
            body: buffer
        });

        console.log("Upload status:", response.status, response.statusText);
        const data = await response.json();
        console.log("File Upload Response:", data);

        if (data.urls && data.urls.get) {
            console.log("✅ Replicate File URL:", data.urls.get);
        }
    } catch(err) {
        console.error("File upload error:", err.message);
    }
}

testReplicateFiles();
