import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rawBody from 'fastify-raw-body';
import rateLimit from '@fastify/rate-limit';

import authRoutes from './routes/auth.js';
import clientsRoutes from './routes/clients.js';
import motorcyclesRoutes from './routes/motorcycles.js';
import servicesRoutes from './routes/services.js';
import ordersRoutes from './routes/orders.js';
import statusesRoutes from './routes/statuses.js';
import photosRoutes from './routes/photos.js';
import statsRoutes from './routes/stats.js';
import earningsRoutes from './routes/earnings.js';
import orderRequestsRoutes from './routes/order-requests.js';
import paymentRequestsRoutes from './routes/payment-requests.js';
import orderUpdatesRoutes from './routes/order-updates.js';
import appointmentsRoutes from './routes/appointments.js';
import whatsappRoutes from './routes/whatsapp.js';
import whatsappBotProxy from './routes/whatsapp-bot-proxy.js';
import migrateMotosRoute from './routes/migrate-motos.js';
import orderPdfRoutes from './routes/order-pdf.js';
import quotationPdfRoutes from './routes/quotation-pdf.js';
import workspacesRoutes from './routes/workspaces.js';
import billingRoutes from './routes/billing.js';
import automationsRoutes from './routes/automations.js';
import templatesRoutes from './routes/templates.js';
import tasksRoutes from './routes/tasks.js';
import referralsRoutes from './routes/referrals.js';
import integrationsRoutes from './routes/integrations.js';
import superRoutes from './routes/super.js';
import ticketsRoutes from './routes/tickets.js';
import quotationsRoutes from './routes/quotations.js';
import { installWorkspaceStore } from './middleware/workspace.js';

const fastify = Fastify({ logger: true });

// Plugins
await fastify.register(cors, {
  origin: (origin, cb) => {
    const envOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [];
    const allowedOrigins = [
      'https://motopartes.cloud',
      'http://motopartes.cloud',
      ...envOrigins
    ];
    // Sin origin: permitimos solo si viene sin cookies/auth (e.g. curl a /health).
    // Rechazamos same-server navegador/mobile-apps spoofeando porque pueden usar
    // cookies del dominio. En la práctica los clientes legítimos siempre envían
    // Origin. Si necesitas permitir native apps, configurar CORS_ALLOW_NO_ORIGIN=true.
    if (!origin) {
      if (process.env.CORS_ALLOW_NO_ORIGIN === 'true') return cb(null, true);
      return cb(null, false); // reject silencioso (sin error loggeado)
    }
    if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      cb(null, true);
      return;
    }
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true
});

await fastify.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Raw body plugin — opt-in per route. The Stripe webhook marks itself with
// config.rawBody=true; all other routes keep Fastify's default parsing.
await fastify.register(rawBody, {
  field: 'rawBody',
  global: false,
  encoding: 'utf8',
  runFirst: true,
});

// Rate limiter global — protege contra fuerza bruta y spam.
// Límites específicos en endpoints sensibles (login/register/tickets)
// se aplican via config.rateLimit en cada ruta.
await fastify.register(rateLimit, {
  global: false, // opt-in por ruta
  max: 120,      // default si se activa
  timeWindow: '1 minute',
  errorResponseBuilder: (req, ctx) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Demasiados intentos. Intenta de nuevo en ${Math.ceil(ctx.ttl / 1000)}s.`,
  }),
});

// Install the per-request AsyncLocalStorage workspace store at the earliest
// possible point. resolveWorkspace later mutates this store once the user
// and workspace are known; mutating (instead of calling enterWith a second
// time inside a preHandler) is what makes Prisma's auto-scoping propagate
// reliably across Fastify's internal async boundaries.
fastify.addHook('onRequest', async (request) => {
  installWorkspaceStore(request);
});

// Health check
fastify.get('/api/health', async () => ({ status: 'ok', service: 'motopartes-api' }));

// Routes
await fastify.register(authRoutes, { prefix: '/api/auth' });
await fastify.register(clientsRoutes, { prefix: '/api/clients' });
await fastify.register(motorcyclesRoutes, { prefix: '/api/motorcycles' });
await fastify.register(servicesRoutes, { prefix: '/api/services' });
await fastify.register(ordersRoutes, { prefix: '/api/orders' });
await fastify.register(statusesRoutes, { prefix: '/api/statuses' });
await fastify.register(photosRoutes, { prefix: '/api/photos' });
await fastify.register(statsRoutes, { prefix: '/api/stats' });
await fastify.register(earningsRoutes, { prefix: '/api/earnings' });
await fastify.register(orderRequestsRoutes, { prefix: '/api/order-requests' });
await fastify.register(paymentRequestsRoutes, { prefix: '/api/payment-requests' });
await fastify.register(orderUpdatesRoutes, { prefix: '/api/order-updates' });
await fastify.register(appointmentsRoutes, { prefix: '/api/appointments' });
await fastify.register(whatsappRoutes, { prefix: '/api/whatsapp' });
await fastify.register(whatsappBotProxy, { prefix: '/api/whatsapp-bot' });
await fastify.register(migrateMotosRoute, { prefix: '/api/admin/migrate-motos' });
await fastify.register(orderPdfRoutes, { prefix: '/api/order-pdf' });
await fastify.register(quotationPdfRoutes, { prefix: '/api/quotation-pdf' });
await fastify.register(workspacesRoutes, { prefix: '/api/workspaces' });
await fastify.register(billingRoutes, { prefix: '/api/billing' });
await fastify.register(automationsRoutes, { prefix: '/api/automations' });
await fastify.register(templatesRoutes, { prefix: '/api/templates' });
await fastify.register(tasksRoutes, { prefix: '/api/tasks' });
await fastify.register(referralsRoutes, { prefix: '/api/referrals' });
await fastify.register(integrationsRoutes, { prefix: '/api/integrations' });
await fastify.register(superRoutes, { prefix: '/api/super' });
await fastify.register(ticketsRoutes, { prefix: '/api/tickets' });
await fastify.register(quotationsRoutes, { prefix: '/api/quotations' });

// Periodic billing sweep — every hour on the hour, plus once at startup.
import { runBillingSweep } from './lib/billing-sweep.js';
runBillingSweep().catch((e) => console.error('[billing-sweep] boot run failed:', e.message));
setInterval(() => {
    runBillingSweep().catch((e) => console.error('[billing-sweep] failed:', e.message));
}, 60 * 60 * 1000);

// Automation sweeps:
//   - Job worker every 30s (processes pending automation jobs)
//   - Temporal sweep every 5min (generates jobs for time-based triggers)
import { runAutomationSweep, runTemporalSweep } from './lib/automations.js';
setInterval(() => {
    runAutomationSweep().catch((e) => console.error('[automations] worker error:', e.message));
}, 30 * 1000);
setInterval(() => {
    runTemporalSweep().catch((e) => console.error('[automations] temporal error:', e.message));
}, 5 * 60 * 1000);

// Referral payout sweep — corre 1× por día. Internamente solo genera
// payouts si es día 1 del mes. Barato, idempotente por @@unique.
import { runReferralPayoutSweep } from './lib/referral-sweep.js';
runReferralPayoutSweep().catch((e) => console.error('[referral-sweep] boot run failed:', e.message));
setInterval(() => {
    runReferralPayoutSweep().catch((e) => console.error('[referral-sweep] failed:', e.message));
}, 24 * 60 * 60 * 1000);

// Start
const PORT = process.env.PORT || 3000;
try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🚀 MotoPartes API running on port ${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

// Forces restart for config reload
