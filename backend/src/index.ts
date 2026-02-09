import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import config from './config';
import prisma from './config/database';
import logger from './config/logger';
import { errorHandler } from './types';
import { authenticate } from './middleware/auth';
import authRoutes from './modules/auth/auth.routes';
import whatsappRoutes from './modules/whatsapp/whatsapp.routes';
import { contactsRoutes } from './modules/contacts';
import { broadcastsRoutes } from './modules/broadcasts';
import { webhookRoutes } from './modules/webhooks';
import { apiKeyRoutes } from './modules/api-keys';
import { templatesRoutes } from './modules/templates';
import { tagsRoutes } from './modules/tags';
import { teamRoutes } from './modules/team';
import { subscriptionPlansRoutes } from './modules/subscription-plans';
import { invoicesRoutes } from './modules/invoices';
import { paymentsRoutes } from './modules/payments';
import uploadRoutes from './modules/uploads/uploads.routes';
import { externalApiRoutes } from './modules/external-api/external-api.routes';
import { initializeActiveInstances, baileysEvents } from './modules/whatsapp/baileys.service';
import { initializeWorkers, shutdownWorkers } from './workers';
import { createWebhookService } from './modules/webhooks/webhooks.service';
import path from 'path';
import fs from 'fs';
import fastifyStatic from '@fastify/static';

const fastify = Fastify({
  logger: true,
  bodyLimit: 10 * 1024 * 1024, // 10MB
});

async function start() {
  try {
    // Register plugins
    await fastify.register(helmet, {
      contentSecurityPolicy: false,
    });

    await fastify.register(cors, {
      origin: config.cors.origin,
      credentials: true,
    });

    await fastify.register(jwt, {
      secret: config.jwt.secret,
    });

    await fastify.register(multipart, {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 5,
      },
    });

    await fastify.register(rateLimit, {
      max: config.rateLimit.max,
      timeWindow: config.rateLimit.window,
    });

    // Swagger documentation
    await fastify.register(swagger, {
      openapi: {
        info: {
          title: 'WhatsApp SaaS API',
          description: 'Unofficial WhatsApp SaaS API using Baileys',
          version: '1.0.0',
        },
        servers: [
          {
            url: config.app.url,
            description: 'Development server',
          },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
            apiKeyAuth: {
              type: 'apiKey',
              in: 'header',
              name: 'X-API-Key',
              description: 'API key for external integrations',
            },
          },
        },
        security: [{ bearerAuth: [] }],
      },
    });

    await fastify.register(swaggerUi, {
      routePrefix: '/api/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
      },
    });

    // Decorate fastify with authenticate method
    fastify.decorate('authenticate', authenticate);

    // Error handler
    fastify.setErrorHandler(errorHandler);

    // Root route
    fastify.get('/', async () => {
      return {
        name: 'WhatsApp SaaS API',
        version: '1.0.0',
        status: 'running',
        docs: config.app.url + '/api/docs',
      };
    });

    // Health check
    fastify.get('/health', async () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      };
    });

    // Register routes
    await fastify.register(authRoutes, { prefix: '/api/auth' });
    await fastify.register(whatsappRoutes, { prefix: '/api/whatsapp' });
    await fastify.register(contactsRoutes, { prefix: '/api/contacts' });
    await fastify.register(broadcastsRoutes, { prefix: '/api/broadcasts' });
    await fastify.register(webhookRoutes, { prefix: '/api/webhooks' });
    await fastify.register(apiKeyRoutes, { prefix: '/api/api-keys' });
    await fastify.register(templatesRoutes, { prefix: '/api/templates' });
    await fastify.register(tagsRoutes, { prefix: '/api/tags' });
    await fastify.register(teamRoutes, { prefix: '/api/team' });
    await fastify.register(subscriptionPlansRoutes, { prefix: '/api/billing' });
    await fastify.register(invoicesRoutes, { prefix: '/api/invoices' });
    await fastify.register(paymentsRoutes, { prefix: '/api/payments' });
    await fastify.register(uploadRoutes, { prefix: '/api/uploads' });

    // External API routes (API Key authentication for n8n, Make, Zapier, etc.)
    await fastify.register(externalApiRoutes, { prefix: '/api/v1' });

    // Static file serving for uploads
    const uploadsRoot = path.resolve(config.storage.path, 'uploads');
    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsRoot)) {
      fs.mkdirSync(uploadsRoot, { recursive: true });
    }
    await fastify.register(fastifyStatic, {
      root: uploadsRoot,
      prefix: '/uploads/',
      decorateReply: false,
    });

    // Start server
    await fastify.listen({
      port: config.app.port,
      host: '0.0.0.0',
    });

    console.log('');
    console.log('🚀 Server running!');
    console.log(`📡 API: ${config.app.url}`);
    console.log(`📚 Docs: ${config.app.url}/api/docs`);
    console.log(`🏥 Health: ${config.app.url}/health`);
    console.log('');

    // Initialize active WhatsApp instances (after server is running)
    setTimeout(async () => {
      console.log('📱 Initializing active WhatsApp instances...');
      await initializeActiveInstances();
    }, 2000);

    // Initialize background workers (BullMQ) - delay to allow Redis connection
    setTimeout(() => {
      console.log('🔧 Initializing background workers...');
      initializeWorkers();
    }, 3000);

    // Wire up baileysEvents → webhook delivery
    // This sends incoming WhatsApp messages to configured webhook URLs (for n8n, etc.)
    const webhookService = createWebhookService(fastify);

    baileysEvents.on('message', async (event: { instanceId: string; type: string; message: any }) => {
      try {
        console.log(`📨 [WEBHOOK] Message event received: type=${event.type}, from=${event.message?.from}, id=${event.message?.id}`);
        
        // Get instance to find organization_id
        const instance = await prisma.whatsAppInstance.findUnique({
          where: { id: event.instanceId },
          select: { organization_id: true, webhook_url: true },
        });
        if (!instance) {
          console.log(`📨 [WEBHOOK] Instance not found: ${event.instanceId}`);
          return;
        }
        
        console.log(`📨 [WEBHOOK] Instance found, webhook_url: ${instance.webhook_url ? 'SET' : 'NOT SET'}`);

        const eventType = event.type === 'incoming' ? 'message.received' : 'message.sent';
        
        // Deep-clone and sanitize payload to ensure it's JSON-serializable
        // This prevents PrismaClientValidationError from protobuf Long objects
        const safePayload = JSON.parse(JSON.stringify(event.message));
        
        const webhookId = await webhookService.queueWebhook({
          instance_id: event.instanceId,
          organization_id: instance.organization_id,
          event_type: eventType,
          payload: safePayload,
          idempotency_key: `msg_${event.message?.id || Date.now()}`,
        });
        
        console.log(`📨 [WEBHOOK] Queue result: ${webhookId ? `queued (${webhookId})` : 'skipped'}`);
      } catch (error) {
        console.error('❌ [WEBHOOK] Error forwarding message to webhook:', error);
      }
    });

    baileysEvents.on('connection', async (event: { instanceId: string; status: string; phone_number?: string }) => {
      try {
        console.log(`🔗 [WEBHOOK] Connection event: status=${event.status}, instanceId=${event.instanceId}`);
        
        const instance = await prisma.whatsAppInstance.findUnique({
          where: { id: event.instanceId },
          select: { organization_id: true },
        });
        if (!instance) return;

        const eventType = event.status === 'CONNECTED' ? 'connection.connected' : 'connection.disconnected';

        await webhookService.queueWebhook({
          instance_id: event.instanceId,
          organization_id: instance.organization_id,
          event_type: eventType as any,
          payload: { status: event.status, phone_number: event.phone_number },
          idempotency_key: `conn_${event.instanceId}_${Date.now()}`,
        });
      } catch (error) {
        console.error('Error forwarding connection event to webhook:', error);
      }
    });

    console.log('🔗 Webhook event listeners initialized');
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    console.log(`\n${signal} received, closing server...`);
    await shutdownWorkers();
    await fastify.close();
    process.exit(0);
  });
});

start();
