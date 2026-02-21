const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const id = '2d20625d2cb1'; // From previous step
    c.exec(`docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' ${id}`, (err, stream) => {
        stream.pipe(process.stdout);
        stream.on('close', () => c.end());
    });
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
