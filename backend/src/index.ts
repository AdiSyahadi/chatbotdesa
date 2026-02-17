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
import { authenticateJwtOrApiKey } from './middleware/api-key-auth';
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
      origin: (origin, cb) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin) return cb(null, true);
        const allowedOrigins = (config.cors.origin || 'http://localhost:3000')
          .split(',')
          .map((o: string) => o.trim());
        if (allowedOrigins.includes(origin)) {
          return cb(null, true);
        }
        cb(new Error('CORS: origin not allowed'), false);
      },
      credentials: true,
    });

    await fastify.register(jwt, {
      secret: config.jwt.secret,
    });

    await fastify.register(multipart, {
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB — matches max document size in storage.service.ts
        files: 5,
      },
    });

    await fastify.register(rateLimit, {
      max: config.rateLimit.max,
      timeWindow: config.rateLimit.window,
    });

    // Swagger documentation — only in development
    const isDev = process.env.NODE_ENV !== 'production';

    if (isDev) {
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
    }

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

    // Static file serving for uploads (authenticated via JWT or internal routes only)
    const uploadsRoot = path.resolve(config.storage.path, 'uploads');
    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsRoot)) {
      fs.mkdirSync(uploadsRoot, { recursive: true });
    }

    // Serve uploads only through authenticated internal API routes
    // The /uploads/ prefix is only accessible from internal/authenticated routes
    await fastify.register(fastifyStatic, {
      root: uploadsRoot,
      prefix: '/uploads/',
      // decorateReply must be true (default) so reply.sendFile() is available
      serve: false, // Don't auto-serve — only via reply.sendFile()
    });

    // Authenticated file access endpoint — uses real JWT/API-key verification
    // Used by dashboard frontend (browser with JWT cookie)
    fastify.get('/uploads/*', {
      onRequest: [authenticateJwtOrApiKey],
    }, async (request, reply) => {
      const urlPath = (request.params as any)['*'] as string;
      if (!urlPath) {
        return reply.status(400).send({ success: false, error: 'File path required' });
      }

      // Sanitize: prevent path traversal
      const sanitized = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.resolve(uploadsRoot, sanitized);

      // Verify file is within uploads directory
      if (!filePath.startsWith(path.resolve(uploadsRoot))) {
        return reply.status(400).send({ success: false, error: 'Invalid file path' });
      }

      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ success: false, error: 'File not found' });
      }

      return reply.sendFile(sanitized, uploadsRoot);
    });

    // ── Public media endpoint (capability URL) ──────────────────────────
    // Serves media files WITHOUT authentication.
    // Security: filenames are UUID v4 (122 bits randomness) — unguessable.
    // Same pattern as S3 pre-signed URLs, Telegram, WhatsApp Web CDN.
    // Used by external webhook consumers (CRM) that receive media_url.
    // Path: /media/:orgId/:filename
    fastify.get('/media/*', async (request, reply) => {
      const urlPath = (request.params as any)['*'] as string;
      if (!urlPath) {
        return reply.status(400).send({ success: false, error: 'File path required' });
      }

      // Sanitize: prevent path traversal
      const sanitized = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.resolve(uploadsRoot, sanitized);

      // Verify file is within uploads directory
      if (!filePath.startsWith(path.resolve(uploadsRoot))) {
        return reply.status(400).send({ success: false, error: 'Invalid file path' });
      }

      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ success: false, error: 'File not found' });
      }

      return reply.sendFile(sanitized, uploadsRoot);
    });

    // Start server
    await fastify.listen({
      port: config.app.port,
      host: '0.0.0.0',
    });

    logger.info('🚀 Server running!');
    logger.info(`📡 API: ${config.app.url}`);
    if (isDev) logger.info(`📚 Docs: ${config.app.url}/api/docs`);
    logger.info(`🏥 Health: ${config.app.url}/health`);

    // Initialize active WhatsApp instances (after server is running)
    setTimeout(async () => {
      logger.info('📱 Initializing active WhatsApp instances...');
      await initializeActiveInstances();
    }, 2000);

    // Initialize background workers (BullMQ) - delay to allow Redis connection
    setTimeout(() => {
      logger.info('🔧 Initializing background workers...');
      initializeWorkers().catch(err => logger.error({ err }, 'Worker init failed'));
    }, 3000);

    // Wire up baileysEvents → webhook delivery
    // This sends incoming WhatsApp messages to configured webhook URLs (for n8n, etc.)
    const webhookService = createWebhookService(fastify);

    baileysEvents.on('message', async (event: { instanceId: string; type: string; message: any }) => {
      try {
        logger.info({ type: event.type, from: event.message?.from, id: event.message?.id }, '[WEBHOOK] Message event received');
        
        // Get instance to find organization_id
        const instance = await prisma.whatsAppInstance.findUnique({
          where: { id: event.instanceId },
          select: { organization_id: true, webhook_url: true },
        });
        if (!instance) {
          logger.warn({ instanceId: event.instanceId }, '[WEBHOOK] Instance not found');
          return;
        }
        
        logger.debug({ instanceId: event.instanceId, hasWebhook: !!instance.webhook_url }, '[WEBHOOK] Instance found');

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
        
        logger.debug({ webhookId, instanceId: event.instanceId }, '[WEBHOOK] Queue result');
      } catch (error) {
        logger.error({ err: error }, '[WEBHOOK] Error forwarding message to webhook');
      }
    });

    baileysEvents.on('connection', async (event: { instanceId: string; status: string; phone_number?: string; wa_display_name?: string }) => {
      try {
        logger.info({ status: event.status, instanceId: event.instanceId }, '[WEBHOOK] Connection event');
        
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
          payload: { status: event.status, phone_number: event.phone_number, wa_display_name: event.wa_display_name },
          idempotency_key: `conn_${event.instanceId}_${Date.now()}`,
        });
      } catch (error) {
        logger.error({ err: error }, '[WEBHOOK] Error forwarding connection event');
      }
    });

    // LID → Phone mapping resolved (for CRM real-time updates)
    baileysEvents.on('lid.mapping.resolved', async (event: {
      instanceId: string;
      lid_jid: string;
      phone_jid: string;
      phone_number: string;
      contacts_updated: number;
    }) => {
      try {
        logger.info({ lid_jid: event.lid_jid, phone_number: event.phone_number }, '[WEBHOOK] LID mapping resolved');

        const instance = await prisma.whatsAppInstance.findUnique({
          where: { id: event.instanceId },
          select: { organization_id: true },
        });
        if (!instance) return;

        await webhookService.queueWebhook({
          instance_id: event.instanceId,
          organization_id: instance.organization_id,
          event_type: 'lid.mapping.resolved' as any,
          payload: {
            lid_jid: event.lid_jid,
            phone_jid: event.phone_jid,
            phone_number: event.phone_number,
            contacts_updated: event.contacts_updated,
          },
          idempotency_key: `lid_${event.instanceId}_${event.lid_jid}`,
        });
      } catch (error) {
        logger.error({ err: error }, '[WEBHOOK] Error forwarding LID mapping event');
      }
    });

    logger.info('🔗 Webhook event listeners initialized');
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    logger.info(`${signal} received, closing server...`);
    try {
      await shutdownWorkers();
    } catch (err) {
      logger.error({ err }, 'Error shutting down workers');
    }
    try {
      await fastify.close();
    } catch (err) {
      logger.error({ err }, 'Error closing Fastify');
    }
    process.exit(0);
  });
});

start();
