import http from 'http';

const options = {
    hostname: 'motopartes.cloud',
    port: 80,
    path: '/login',
    method: 'HEAD'
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);

    if (res.statusCode >= 300 && res.statusCode < 400) {
        console.log(`Redirect location: ${res.headers.location}`);
    } else {
        console.log('No redirect detected.');
    }
});

req.end();
