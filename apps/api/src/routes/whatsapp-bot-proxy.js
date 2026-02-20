/**
 * Proxy route: forwards /api/whatsapp-bot/* → http://whatsapp-bot:3002/*
 *
 * In production the frontend is served as static files (no Vite dev proxy).
 * The frontend calls /api/whatsapp-bot/sessions/:id/qr etc. 
 * This route forwards those requests to the whatsapp-bot container.
 */

const BOT_URL = process.env.WHATSAPP_BOT_INTERNAL_URL || 'http://whatsapp-bot:3002';
const BOT_KEY = process.env.WHATSAPP_API_KEY || 'motopartes-whatsapp-key';

export default async function whatsappBotProxy(fastify) {
    // Disable Fastify's default content-type parsing for this route
    fastify.removeAllContentTypeParsers();
    fastify.addContentTypeParser('*', function (request, payload, done) {
        let data = '';
        payload.on('data', chunk => { data += chunk; });
        payload.on('end', () => { done(null, data); });
    });

    // Catch-all for any method under /api/whatsapp-bot/*
    fastify.route({
        method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        url: '/*',
        handler: async (request, reply) => {
            // Build the target URL: strip /api/whatsapp-bot prefix
            const targetPath = request.url.replace(/^\/api\/whatsapp-bot/, '') || '/';
            const targetUrl = `${BOT_URL}${targetPath}`;

            fastify.log.info(`[WA-Proxy] ${request.method} ${request.url} → ${targetUrl}`);

            try {
                const fetchHeaders = {
                    'content-type': 'application/json',
                    'x-api-key': BOT_KEY,
                };

                const fetchOptions = {
                    method: request.method,
                    headers: fetchHeaders,
                };

                // Forward body for POST/PUT/PATCH
                if (['POST', 'PUT', 'PATCH'].includes(request.method) && request.body) {
                    fetchOptions.body = typeof request.body === 'string'
                        ? request.body
                        : JSON.stringify(request.body);
                    fastify.log.info(`[WA-Proxy] Body: ${fetchOptions.body?.substring(0, 200)}`);
                }

                const response = await fetch(targetUrl, fetchOptions);
                const contentType = response.headers.get('content-type') || 'application/json';
                const data = await response.text();

                if (!response.ok) {
                    fastify.log.error(`[WA-Proxy] Bot returned ${response.status}: ${data.substring(0, 500)}`);
                }

                reply
                    .code(response.status)
                    .header('content-type', contentType)
                    .send(data);
            } catch (err) {
                fastify.log.error(`[WA-Proxy] Fetch error: ${err.message}`);
                reply.code(502).send(JSON.stringify({ error: 'WhatsApp Bot service unavailable', details: err.message }));
            }
        }
    });
}
