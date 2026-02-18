const API_URL = 'https://motopartes.cloud/api/auth/reset-emergency';

async function wait() {
    console.log('Waiting for deployment...');
    let attempts = 0;
    while (attempts < 30) { // 5 minutes max
        try {
            const res = await fetch(API_URL); // No key -> should be 403
            console.log(`Attempt ${attempts + 1}: Status ${res.status}`);

            if (res.status === 200) {
                const text = await res.text();
                console.log('Body start:', text.substring(0, 150));
            }

            if (res.status === 403) {
                console.log('✅ Endpoint deployed and ready!');
                process.exit(0);
            }
        } catch (e) {
            console.log(`Attempt ${attempts + 1}: Error ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 10000));
        attempts++;
    }
    console.log('❌ Timeout waiting for deployment');
    process.exit(1);
}

wait();
