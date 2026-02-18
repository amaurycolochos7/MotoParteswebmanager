import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROJECT_ID = 'evytpaczrwhrhgdkfxfk';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2eXRwYWN6cndocmhnZGtmeGZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTY2Mzk0MCwiZXhwIjoyMDgxMjM5OTQwfQ.zTF38VAvMboLbcuZJQ4324wcZP8U1F2Py1OF1i1Q-7M';
const URL = `https://${PROJECT_ID}.supabase.co/rest/v1/profiles?select=*&limit=1`;

const headers = {
    'apikey': KEY,
    'Authorization': `Bearer ${KEY}`
};

async function main() {
    console.log('DEBUG: Starting...');

    // Test Fetch
    try {
        console.log('DEBUG: Fetching Supabase...');
        const res = await fetch(URL, { headers });
        console.log('DEBUG: Status:', res.status);
        const json = await res.json();
        console.log('DEBUG: Data:', json.length);
    } catch (e) {
        console.error('DEBUG: Fetch Error:', e.message);
    }

    // Test Prisma
    try {
        console.log('DEBUG: Checking Prisma...');
        const count = await prisma.profile.count();
        console.log('DEBUG: Profiles count:', count);
    } catch (e) {
        console.error('DEBUG: Prisma Error:', e.message);
    }
}

main().catch(console.error);
