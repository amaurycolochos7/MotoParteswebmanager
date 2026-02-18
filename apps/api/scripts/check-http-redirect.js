import http from 'http';

const options = {
    hostname: 'motopartes.cloud',
    port: 80,
    method: 'HEAD'
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);

    if (res.statusCode >= 300 && res.statusCode < 400) {
        console.log(`Redirect location: ${res.headers.location}`);
    } else {
        console.log('No redirect detected.');
    }
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.end();
