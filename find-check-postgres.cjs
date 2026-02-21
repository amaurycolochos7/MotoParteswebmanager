const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    c.exec('docker ps --filter ancestor=postgres:15-alpine --format "{{.ID}} {{.Names}}"', (err, stream) => {
        let output = '';
        stream.on('data', d => output += d.toString());
        stream.on('close', () => {
            console.log(output);
            const id = output.trim().split(' ')[0];
            if (id) {
                const cmd = `docker exec ${id} psql -U motopartes -d motopartes -c "SELECT id, email FROM profiles; SELECT id, full_name, created_by FROM clients LIMIT 5;"`;
                c.exec(cmd, (err, stream) => {
                    stream.pipe(process.stdout);
                    stream.stderr.pipe(process.stderr);
                    stream.on('close', () => c.end());
                });
            } else {
                console.log('No Postgres container found');
                c.end();
            }
        });
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
