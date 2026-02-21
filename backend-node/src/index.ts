import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import formbody from '@fastify/formbody';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth.js';
import stationRoutes from './routes/stations.js';
import sessionRoutes from './routes/sessions.js';
import nfcRoutes from './routes/nfc.js';
import userRoutes from './routes/users.js';
import seedRoutes from './routes/seed.js';
import ocpiRoutes from './routes/ocpi.js';
import chargingRoutes from './routes/charging.js';
import qrRoutes from './routes/qr.js';
import ocpiTokenRoutes from './routes/ocpiTokens.js';
import adminTokenRoutes from './routes/adminTokens.js';
import adminPortalRoutes from './routes/adminPortal.js';
import { ChargerSimulator } from './services/chargerSimulator.js';

dotenv.config();

// Create PrismaClient
const prisma = new PrismaClient();
const chargerSimulator = new ChargerSimulator(prisma);

const fastify = Fastify({
  logger: true,
});

// Declare module augmentation for fastify
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    chargerSimulator: ChargerSimulator;
    authenticate: any;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; email: string };
    user: { userId: string; email: string };
  }
}

async function build() {
  // Register form body parser (for admin forms)
  await fastify.register(formbody);
  
  // Register CORS
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Register JWT
  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'chargetap-secret-key-2025',
  });

  // Decorate with prisma
  fastify.decorate('prisma', prisma);
  fastify.decorate('chargerSimulator', chargerSimulator);

  // Authentication decorator
  fastify.decorate('authenticate', async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  });

  // Register routes with /api prefix
  await fastify.register(async function (api) {
    api.register(authRoutes, { prefix: '/auth' });
    api.register(stationRoutes, { prefix: '/stations' });
    api.register(sessionRoutes, { prefix: '/sessions' });
    api.register(nfcRoutes, { prefix: '/nfc' });
    api.register(userRoutes, { prefix: '/users' });
    api.register(seedRoutes, { prefix: '' });
    api.register(ocpiRoutes, { prefix: '/ocpi' });
    api.register(chargingRoutes, { prefix: '/charging' });
    api.register(qrRoutes, { prefix: '' }); // QR routes at /api/v1/qr/* and /api/admin/qr/*
    api.register(ocpiTokenRoutes, { prefix: '/ocpi' }); // OCPI eMSP Token endpoints
    api.register(adminTokenRoutes, { prefix: '/admin' }); // Admin API for tokens

    // Health check
    api.get('/health', async () => ({ status: 'healthy' }));
    api.get('/', async () => ({ 
      message: 'ChargeTap API', 
      version: '2.2.0', 
      stack: 'Node.js/Fastify/PostgreSQL',
      features: ['OCPI 2.2.1', 'QR-Start', 'Remote Start/Stop', 'RFID Tokens']
    }));
  }, { prefix: '/api' });

  // Register admin portal (HTML pages)
  await fastify.register(adminPortalRoutes, { prefix: '/admin' });

  return fastify;
}

async function start() {
  try {
    const server = await build();
    const port = parseInt(process.env.PORT || '8001', 10);
    
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`\n🚀 ChargeTap API running on port ${port}`);
    console.log(`📚 Stack: Node.js + Fastify + PostgreSQL + Prisma`);
    console.log(`🔌 OCPI 2.2.1 Remote Start/Stop enabled`);
    console.log(`📱 QR-Start enabled`);
    console.log(`💳 RFID Token Management enabled`);
    console.log(`🔑 Admin Portal: http://localhost:${port}/admin/tokens\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  await fastify.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  await fastify.close();
  process.exit(0);
});

start();
