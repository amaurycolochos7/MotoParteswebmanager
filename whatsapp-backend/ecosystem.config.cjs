module.exports = {
    apps: [{
        name: 'whatsapp-backend',
        script: './server.js',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '500M',
        env_production: {
            NODE_ENV: 'production'
        },
        error_file: './logs/error.log',
        out_file: './logs/out.log',
        log_file: './logs/combined.log',
        time: true,
        merge_logs: true,
        // Restart on crash
        min_uptime: '10s',
        max_restarts: 10,
        // Cron restart (opcional - reiniciar cada día a las 3am)
        // cron_restart: '0 3 * * *',
    }]
};
