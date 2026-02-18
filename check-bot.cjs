const { Client } = require('ssh2');
const c = new Client();
c.on('ready', () => {
    console.log('Connected');
    const cmds = [
        // Kill zombie Chrome processes inside container
        'CID=$(docker ps -q --filter name=app-calculate-cross-platform-monitor); docker exec $CID pkill -9 chromium 2>&1; docker exec $CID pkill -9 chrome 2>&1; echo "Killed Chrome processes"',
        // Clean up stale session data
        'CID=$(docker ps -q --filter name=app-calculate-cross-platform-monitor); docker exec $CID rm -rf /app/.wwebjs_auth/session-* 2>&1; echo "Cleaned session dirs"',
        // Restart the container
        'docker service update --force app-calculate-cross-platform-monitor-n39v21 2>&1',
        // Wait for container to come back up
        'sleep 15 && echo "Container restarted" && docker ps --filter name=app-calculate-cross-platform-monitor --format "{{.ID}} {{.Status}}"',
    ];
    let i = 0;
    function next() {
        if (i >= cmds.length) { c.end(); return; }
        const cmd = cmds[i++];
        console.log(`\n=== Step ${i}: ${cmd.substring(0, 80)} ===`);
        c.exec(cmd, (err, stream) => {
            if (err) { console.error(err); next(); return; }
            let out = '';
            stream.on('data', d => out += d.toString());
            stream.stderr.on('data', d => out += d.toString());
            stream.on('close', () => { console.log(out); next(); });
        });
    }
    next();
});
c.connect({ host: '187.77.11.79', port: 22, username: 'root', password: 'Jomoponse-1+' });
