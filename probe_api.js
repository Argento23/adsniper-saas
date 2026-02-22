
const fs = require('fs');
const path = require('path');

async function probe() {
    // Read .env.local manually
    const envPath = path.join(process.cwd(), '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const apiKeyMatch = envContent.match(/REPLICATE_API_KEY=(.*)/);
    const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : null;

    if (!apiKey) {
        console.error("❌ REPLICATE_API_KEY not found in .env.local");
        return;
    }

    console.log(`🔍 Probing Replicate for black-forest-labs/flux-schnell...`);

    try {
        const response = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell', {
            headers: { 'Authorization': `Token ${apiKey}` }
        });

        const data = await response.json();

        if (response.ok) {
            console.log(`✅ Latest version: ${data.latest_version.id}`);
        } else {
            console.error(`❌ Error ${response.status}: ${JSON.stringify(data)}`);

            console.log("🔍 Trying to list versions...");
            const vResp = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/versions', {
                headers: { 'Authorization': `Token ${apiKey}` }
            });
            const vData = await vResp.json();
            if (vResp.ok && vData.results && vData.results.length > 0) {
                console.log(`✅ Latest via list: ${vData.results[0].id}`);
            } else {
                console.error(`❌ Versions error: ${JSON.stringify(vData)}`);
            }
        }
    } catch (err) {
        console.error(`❌ Probe failed: ${err.message}`);
    }
}

probe();
