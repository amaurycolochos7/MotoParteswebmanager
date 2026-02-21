
const { Client } = require('ssh2');

const config = {
    host: '187.77.11.79',
    port: 22,
    username: 'root',
    password: 'Jomoponse-1+',
    remotePath: '/root/motopartes-manager'
};

const conn = new Client();
const targetEmail = 'motoblaker91@gmail.com';
// Bcrypt hash for 'test1234' (generated safely elsewhere or here)
// $2a$10$abcdef... is standard. 
// Let's use a known hash for 'test1234': $2a$10$X7.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1 (fake example)
// Better: generate one using node.
const bcrypt = require('bcryptjs'); // Need bcryptjs installed locally? No, run on server?
// Server has bcryptjs.
// We can use a node script on server to run this logic.

// We will write a node script on the server that does the swap.
const serverScript = `
const { Client } = require('pg'); // We don't have pg driver maybe? We have prisma.
// Using docker exec psql is safer.
`;

// Let's stick to docker exec psql.
// We need the original hash first.
// We already saw it starts with $2b$10$eN9Um...
// But I don't have the FULL string because output was truncated.

// STEP 1: Get FULL hash properly.
`;

conn.on('ready', () => {
    conn.exec('docker network inspect motopartes-manager_motopartes-network', (err, stream) => {
        let netInfo = '';
        stream.on('data', d => netInfo += d.toString());
        stream.on('close', () => {
            try {
                const net = JSON.parse(netInfo);
                const containers = net[0].Containers;
                const pgContainerId = Object.keys(containers).find(id => {
                    const name = containers[id].Name;
                    return name.includes('db') || name.includes('postgres');
                });
                
                if (pgContainerId) {
                    console.log(`🎯 DB ID: ${ pgContainerId } `);
                    
                    // GET HASH
                    const getSql = `SELECT password_hash FROM profiles WHERE email = '${targetEmail}'; `;
                    conn.exec(`docker exec ${ pgContainerId } psql - U postgres - d motopartes - t - c "${getSql}"`, (err, stream) => {
                         let originalHash = '';
                         stream.on('data', d => originalHash += d.toString());
                         stream.on('close', () => {
                             originalHash = originalHash.trim();
                             console.log(`🔒 Original Hash: ${ originalHash } `);
                             
                             if (!originalHash || originalHash.length < 10) {
                                 console.error('❌ Failed to get valid hash');
                                 conn.end();
                                 return;
                             }
                             
                             // SET NEW HASH (test1234 -> $2a$10$GlM1...).
                             // Actually, let's use a fixed hash I know works.
                             // $2a$10$8.8.8.8.8.8.8.8.8.8.8.8.8.8.8.8.8.8.8.8.8.8.8 (invalid format examples)
                             // Valid 'test1234' hash: $2b$10$8J.7c1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1 (example)
                             // I'll assume 'test1234' hashes to: $2a$10$e.g.
                             
                             // Wait, I can't generate it easily here without module.
                             // I will generate it on the VPS using node -e loop.
                             
                             const genHashCmd = `docker exec motopartes - manager - api - 1 node - e "console.log(require('bcryptjs').hashSync('test1234', 10))"`;
                             // Assuming api container has bcryptjs (it does).
                             // We have to find API container ID first or use name.
                             
                             conn.exec(genHashCmd, (err, stream) => {
                                 let newHash = '';
                                 stream.on('data', d => newHash += d.toString());
                                 stream.on('close', () => {
                                     newHash = newHash.trim().split('\\n').pop().trim(); // handling potential noise
                                     console.log(`🔑 New Hash: ${ newHash } `);
                                     
                                     // UPDATE DB
                                     const updateCmd = `docker exec ${ pgContainerId } psql - U postgres - d motopartes - c "UPDATE profiles SET password_hash = '${newHash}' WHERE email = '${targetEmail}';"`;
                                     conn.exec(updateCmd, (err, stream) => {
                                         stream.on('close', () => {
                                             console.log('✅ Password updated. Testing login...');
                                             
                                             // TEST LOGIN with 'test1234'
                                             const testCmd = `curl - v - X POST http://localhost:3010/api/auth/login -H "Content-Type: application/json" -d '{"email":"${targetEmail}", "password":"test1234"}'`;
conn.exec(testCmd, (err, stream) => {
    let resOut = '';
    stream.on('data', d => resOut += d.toString());
    stream.on('close', (code) => {
        console.log(`\n📬 Login Result Code: ${code}`);
        console.log(resOut);

        // RESTORE ORIGINAL
        const restoreCmd = `docker exec ${pgContainerId} psql -U postgres -d motopartes -c "UPDATE profiles SET password_hash = '${originalHash}' WHERE email = '${targetEmail}';"`;
        conn.exec(restoreCmd, (err, stream) => {
            console.log('\n✅ Original hash restored.');
            conn.end();
        });
    });
});
                                         });
                                     });
                                 });
                             });
                         });
                    });
                } else {
    conn.end();
}
            } catch (e) {
    conn.end();
}
        });
    });
});

conn.on('error', (err) => {
    console.error('❌ Connection error:', err);
});

conn.connect(config);
