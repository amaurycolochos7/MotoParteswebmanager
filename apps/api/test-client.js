import jwt from 'jsonwebtoken';
import https from 'http'; // http actually for port 3010

const SECRET = 'MotoPartes-JWT-Secret-2026-Production';
const USER = {
    id: 'd1b5a85e-f745-4155-aeaf-2bf1dcff9a3a',
    email: 'maciel77@gmail.com',
    role: 'admin'
};

const token = jwt.sign(USER, SECRET, { expiresIn: '1h' });
// console.log('Token:', token);

const data = JSON.stringify({
    full_name: 'Test Client API Debug',
    phone: `555${Math.floor(Math.random() * 10000000)}`,
    email: 'test@example.com',
    notes: 'Created via debug script'
});

const req = https.request({
    hostname: '187.77.11.79',
    port: 3010,
    path: '/api/clients',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    }
}, (res) => {
    console.log(`StatusCode: ${res.statusCode}`);
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => console.log('Body:', body));
});

req.on('error', e => console.error(e));
req.write(data);
req.end();
