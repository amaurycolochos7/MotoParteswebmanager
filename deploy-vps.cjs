const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const config = {
    host: '187.77.11.79',
    port: 22,
    username: 'root',
    password: 'Jomoponse-1+',
    remotePath: '/root/motopartes-manager'
};

const conn = new Client();

async function createArchive() {
    console.log('📦 Creating archive...');
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream('deploy.zip');
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            console.log(archive.pointer() + ' total bytes archived');
            resolve('deploy.zip');
        });

        archive.on('entry', (entry) => {
            if (entry.name.endsWith('/')) return; // skip dirs
            // console.log('  + ' + entry.name); // Uncomment for verbose
        });

        archive.on('warning', (err) => {
            if (err.code === 'ENOENT') console.warn(err);
            else throw err;
        });

        archive.on('error', (err) => reject(err));
        archive.pipe(output);

        // Files to include
        archive.file('docker-compose.dokploy.yml', { name: 'docker-compose.yml' });
        archive.file('package.json', { name: 'package.json' });

        // Directories (excluding node_modules and others)
        archive.glob('apps/api/**/*', { ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'] });
        archive.glob('apps/whatsapp-bot/**/*', { ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/.wwebjs_auth/**'] });
        // Include root migrations folder
        archive.directory('migrations/', 'migrations');

        archive.finalize();
    });
}

conn.on('ready', async () => {
    console.log('🔌 Connected to VPS');

    try {
        // 1. Create remote directory
        await new Promise((resolve, reject) => {
            conn.exec(`mkdir -p ${config.remotePath}`, (err, stream) => {
                if (err) return reject(err);
                stream.on('close', (code, signal) => {
                    if (code === 0) resolve();
                    else reject(new Error(`mkdir failed with code ${code}`));
                }).on('data', (data) => console.log('STDOUT: ' + data)).stderr.on('data', (data) => console.log('STDERR: ' + data));
            });
        });
        console.log('📂 Remote directory ensured');

        // 2. Upload archive
        await createArchive();
        console.log('🚀 Uploading archive...');

        await new Promise((resolve, reject) => {
            conn.sftp((err, sftp) => {
                if (err) return reject(err);
                const readStream = fs.createReadStream('deploy.zip');
                const writeStream = sftp.createWriteStream(`${config.remotePath}/deploy.zip`);

                writeStream.on('close', () => resolve());
                writeStream.on('error', (err) => reject(err));
                readStream.pipe(writeStream);
            });
        });
        console.log('✅ Upload complete');

        // 3. Unzip and Deploy
        const deployCmd = `
            cd ${config.remotePath} && \
            (apk add --no-cache unzip || apt-get update && apt-get install -y unzip || yum install -y unzip || true) && \
            unzip -o deploy.zip && \
            rm deploy.zip && \
            echo "Building and Starting Containers..." && \
            docker compose down || true && \
            docker compose up -d --build
        `;

        console.log('🛠️ Executing deployment on VPS...');
        await new Promise((resolve, reject) => {
            conn.exec(deployCmd, (err, stream) => {
                if (err) return reject(err);
                stream.on('close', (code, signal) => {
                    console.log('Deployment finished with code ' + code);
                    resolve();
                }).on('data', (data) => console.log(data.toString())).stderr.on('data', (data) => console.log(data.toString()));
            });
        });

    } catch (err) {
        console.error('❌ Deployment failed:', err);
    } finally {
        conn.end();
        // Cleanup local zip
        // if (fs.existsSync('deploy.zip')) fs.unlinkSync('deploy.zip');
    }
}).connect(config);
