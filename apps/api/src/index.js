import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';

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

const fastify = Fastify({ logger: true });

// Plugins
await fastify.register(cors, {
  origin: (origin, cb) => {
    const allowedOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [];
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return cb(null, true);
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
