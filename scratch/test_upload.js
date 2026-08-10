async function testTmpFilesUpload() {
    const dummyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const buffer = Buffer.from(dummyPngBase64, 'base64');
    const blob = new Blob([buffer], { type: 'image/png' });

    const formData = new FormData();
    formData.append('file', blob, 'image.png');

    try {
        const res = await fetch('https://tmpfiles.org/api/v1/upload', {
            method: 'POST',
            body: formData
        });

        const data = await res.json();
        console.log("TmpFiles Upload Response:", data);
        if (data && data.data && data.data.url) {
            // Convert to direct URL: https://tmpfiles.org/12345/image.png -> https://tmpfiles.org/dl/12345/image.png
            const directUrl = data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
            console.log("✅ Direct Public URL:", directUrl);
        }
    } catch (e) {
        console.error("TmpFiles Error:", e.message);
    }
}

testTmpFilesUpload();
