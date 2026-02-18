import https from 'https';

const options = {
    hostname: 'motopartes.cloud',
    port: 443,
    method: 'HEAD',
    rejectUnauthorized: false
};

const req = https.request(options, (res) => {
    const cert = res.socket.getPeerCertificate();
    if (Object.keys(cert).length > 0) {
        console.log('Certificate Found:');
        console.log(`  Subject: ${cert.subject.CN}`);
        console.log(`  Issuer: ${cert.issuer.CN}`);
        console.log(`  Valid From: ${cert.valid_from}`);
        console.log(`  Valid To: ${cert.valid_to}`);
    } else {
        console.log('No certificate provided.');
    }
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.end();
