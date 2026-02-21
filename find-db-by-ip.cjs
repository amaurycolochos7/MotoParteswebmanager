const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    c.exec('docker network inspect dokploy-network', (err, stream) => {
        let json = '';
        stream.on('data', d => json += d.toString());
        stream.on('close', () => {
            try {
                const net = JSON.parse(json);
                const containers = net[0].Containers;
                // Find container with IPv4Address containing 10.0.1.57
                const target = Object.entries(containers).find(([id, info]) => info.IPv4Address.includes('10.0.1.57'));
                if (target) {
                    console.log(`DB Container ID: ${target[0]}`);
                    console.log(`Name: ${target[1].Name}`);
                    // Check counts
                    const id = target[0];
                    c.exec(`docker exec ${id} psql -U motopartes -d motopartes -c "SELECT count(*) FROM clients; SELECT count(*) FROM motorcycles;"`, (err, stream) => {
                        stream.pipe(process.stdout);
                        stream.stderr.pipe(process.stderr);
                        stream.on('close', () => c.end());
                    });
                } else {
                    console.log('No container found for 10.0.1.57');
                    c.end();
                }
            } catch (e) {
                console.log('JSON parse error or invalid output');
                console.log(json.substring(0, 500)); // debug
                c.end();
            }
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
