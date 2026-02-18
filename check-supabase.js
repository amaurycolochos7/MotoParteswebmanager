const PROJECT_ID = 'evytpaczrwhrhgdkfxfk';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2eXRwYWN6cndocmhnZGtmeGZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTY2Mzk0MCwiZXhwIjoyMDgxMjM5OTQwfQ.zTF38VAvMboLbcuZJQ4324wcZP8U1F2Py1OF1i1Q-7M';
const URL = `https://${PROJECT_ID}.supabase.co/rest/v1/profiles?select=*&limit=1`;

const options = {
    headers: {
        'apikey': KEY,
        'Authorization': `Bearer ${KEY}`
    }
};

async function getCount(table) {
    const res = await fetch(`https://${PROJECT_ID}.supabase.co/rest/v1/${table}?select=*&head=true`, {
        headers: { ...options.headers, 'Prefer': 'count=exact' }
    });
    const range = res.headers.get('content-range');
    return range ? range.split('/')[1] : '0';
}

(async () => {
    console.log('Profiles:', await getCount('profiles'));
    console.log('Clients:', await getCount('clients'));
    console.log('Motorcycles:', await getCount('motorcycles'));
})();
