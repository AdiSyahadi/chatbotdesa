import { FastifyInstance } from 'fastify';
import { WhatsAppService } from './whatsapp.service';
import prisma from '../../config/database';
import { Prisma } from '@prisma/client';
import { UserRole } from '@prisma/client';
import {
  createInstanceSchema,
  updateInstanceSchema,
  instanceIdSchema,
  listInstancesQuerySchema,
  sendTextMessageSchema,
  sendMediaMessageSchema,
  sendLocationSchema,
  messagesQuerySchema,
} from './whatsapp.schema';
import { JWTPayload, AuthenticatedRequest } from '../../types';
import '../../types';
import { requireRole } from '../../middleware/rbac';

// ============================================
// WHATSAPP ROUTES
// API endpoints for WhatsApp instance management
// ============================================

export default async function whatsappRoutes(fastify: FastifyInstance) {
  const service = new WhatsAppService(fastify);

  // ============================================
  // INSTANCE MANAGEMENT ROUTES
  // ============================================

  /**
   * List all instances
   * GET /api/whatsapp/instances
   */
  fastify.get('/instances', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'List all WhatsApp instances for organization',
      tags: ['WhatsApp Instances'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['DISCONNECTED', 'CONNECTING', 'CONNECTED', 'QR_READY', 'ERROR', 'BANNED'],
          },
          page: { type: 'string', default: '1' },
          limit: { type: 'string', default: '20' },
          search: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const query = listInstancesQuerySchema.parse(request.query);
    
    const result = await service.listInstances(user.organizationId, query);
    return reply.send({ success: true, ...result });
  });

  /**
   * Create new instance
   * POST /api/whatsapp/instances
   */
  fastify.post('/instances', {
    onRequest: [fastify.authenticate],
    preHandler: [requireRole(UserRole.ORG_OWNER, UserRole.ORG_ADMIN)],
    schema: {
      description: 'Create new WhatsApp instance',
      tags: ['WhatsApp Instances'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100 },
          webhook_url: { type: 'string', format: 'uri' },
          webhook_events: {
            type: 'array',
            items: { type: 'string', enum: ['message', 'status', 'connection', 'qr'] },
          },
          webhook_secret: { type: 'string', minLength: 16 },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const body = createInstanceSchema.parse(request.body);
    
    const result = await service.createInstance(user.organizationId, body);
    return reply.status(201).send({ success: true, data: result });
  });

  /**
   * Get instance by ID
   * GET /api/whatsapp/instances/:id
   */
  fastify.get('/instances/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get WhatsApp instance details',
      tags: ['WhatsApp Instances'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const params = request.params as { id: string };
    const { id } = instanceIdSchema.parse(params);
    
    const result = await service.getInstance(id, user.organizationId);
    return reply.send({ success: true, data: result });
  });

  /**
   * Update instance
   * PATCH /api/whatsapp/instances/:id
   */
  fastify.patch('/instances/:id', {
    onRequest: [fastify.authenticate],
    preHandler: [requireRole(UserRole.ORG_OWNER, UserRole.ORG_ADMIN)],
    schema: {
      description: 'Update WhatsApp instance settings',
      tags: ['WhatsApp Instances'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        additionalProperties: true,
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100 },
          webhook_url: { type: 'string', nullable: true },
          webhook_events: {},
          webhook_secret: { type: 'string', nullable: true },
          is_active: { type: 'boolean' },
          auto_reconnect: { type: 'boolean' },
          read_receipts: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const params = request.params as { id: string };
    const { id } = instanceIdSchema.parse(params);
    
    // Transform body before Zod validation
    const rawBody = request.body as any;
    
    // Convert empty webhook_url to null (empty string fails .url() validation)
    if (rawBody.webhook_url === '' || rawBody.webhook_url === undefined) {
      rawBody.webhook_url = null;
    }
    
    if (rawBody.webhook_events != null) {
      const eventMap: Record<string, string> = {
        message_received: 'message.received',
        message_sent: 'message.sent',
        message_delivered: 'message.delivered',
        message_read: 'message.read',
        connection_update: 'connection',  // prefix: matches connection.connected, connection.disconnected
        qr_update: 'qr',                 // prefix: matches qr.updated
      };

      if (Array.isArray(rawBody.webhook_events)) {
        // Already an array — clean it: only keep valid dot-notation event strings
        rawBody.webhook_events = rawBody.webhook_events.filter(
          (e: any) => typeof e === 'string' && e.includes('.')
        );
      } else if (typeof rawBody.webhook_events === 'object') {
        // Frontend sends: { message_received: true, message_sent: false, ... }
        // Convert to: ['message.received', ...]
        rawBody.webhook_events = Object.entries(rawBody.webhook_events)
          .filter(([key, enabled]) => enabled === true && key in eventMap)
          .map(([key]) => eventMap[key]);
      } else {
        // Invalid format — set to empty array
        rawBody.webhook_events = [];
      }
    }
    
    const body = updateInstanceSchema.parse(rawBody);
    const result = await service.updateInstance(id, user.organizationId, body);
    return reply.send({ success: true, data: result });
  });

  /**
   * Delete instance
   * DELETE /api/whatsapp/instances/:id
   */
  fastify.delete('/instances/:id', {
    onRequest: [fastify.authenticate],
    preHandler: [requireRole(UserRole.ORG_OWNER, UserRole.ORG_ADMIN)],
    schema: {
      description: 'Delete WhatsApp instance',
      tags: ['WhatsApp Instances'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const params = request.params as { id: string };
    const { id } = instanceIdSchema.parse(params);
    
    await service.deleteInstance(id, user.organizationId);
    return reply.send({ success: true, message: 'Instance deleted successfully' });
  });

  // ============================================
  // CONNECTION MANAGEMENT ROUTES
  // ============================================

  /**
   * Connect instance (start QR code generation)
   * POST /api/whatsapp/instances/:id/connect
   */
  fastify.post('/instances/:id/connect', {
    onRequest: [fastify.authenticate],
    preHandler: [requireRole(UserRole.ORG_OWNER, UserRole.ORG_ADMIN)],
    schema: {
      description: 'Start WhatsApp connection and generate QR code',
      tags: ['WhatsApp Connection'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const params = request.params as { id: string };
    const { id } = instanceIdSchema.parse(params);
    
    const result = await service.connectInstance(id, user.organizationId);
    return reply.send({ success: true, data: result });
  });

  /**
   * Disconnect instance
   * POST /api/whatsapp/instances/:id/disconnect
   */
  fastify.post('/instances/:id/disconnect', {
    onRequest: [fastify.authenticate],
    preHandler: [requireRole(UserRole.ORG_OWNER, UserRole.ORG_ADMIN)],
    schema: {
      description: 'Disconnect WhatsApp instance',
      tags: ['WhatsApp Connection'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const params = request.params as { id: string };
    const { id } = instanceIdSchema.parse(params);
    
    const result = await service.disconnect(id, user.organizationId);
    return reply.send({ success: true, data: result });
  });

  /**
   * Get QR code
   * GET /api/whatsapp/instances/:id/qr
   */
  fastify.get('/instances/:id/qr', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get current QR code for instance',
      tags: ['WhatsApp Connection'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const params = request.params as { id: string };
    const { id } = instanceIdSchema.parse(params);
    
    const result = await service.getQR(id, user.organizationId);
    return reply.send({ success: true, data: result });
  });

  /**
   * Get connection status
   * GET /api/whatsapp/instances/:id/status
   */
  fastify.get('/instances/:id/status', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get real-time connection status',
      tags: ['WhatsApp Connection'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const params = request.params as { id: string };
    const { id } = instanceIdSchema.parse(params);
    
    const result = await service.getStatus(id, user.organizationId);
    return reply.send({ success: true, data: result });
  });

  /**
   * Restart instance
   * POST /api/whatsapp/instances/:id/restart
   */
  fastify.post('/instances/:id/restart', {
    onRequest: [fastify.authenticate],
    preHandler: [requireRole(UserRole.ORG_OWNER, UserRole.ORG_ADMIN)],
    schema: {
      description: 'Restart WhatsApp instance connection',
      tags: ['WhatsApp Connection'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const params = request.params as { id: string };
    const { id } = instanceIdSchema.parse(params);
    
    const result = await service.restart(id, user.organizationId);
    return reply.send({ success: true, data: result });
  });

  // ============================================
  // MESSAGING ROUTES
  // ============================================

  /**
   * Send text message
   * POST /api/whatsapp/instances/:id/messages/text
   */
  fastify.post('/instances/:id/messages/text', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Send text message via WhatsApp',
      tags: ['WhatsApp Messages'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        required: ['to', 'message'],
        properties: {
          to: { type: 'string', description: 'Phone number (e.g., 628123456789)' },
          message: { type: 'string', maxLength: 4096 },
          delay: { type: 'number', minimum: 0, maximum: 10000 },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const params = request.params as { id: string };
    const { id } = instanceIdSchema.parse(params);
    const body = sendTextMessageSchema.parse(request.body);
    
    const result = await service.sendText(id, user.organizationId, body);
    return reply.send({ success: true, data: result });
  });

  /**
   * Send media message
   * POST /api/whatsapp/instances/:id/messages/media
   */
  fastify.post('/instances/:id/messages/media', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Send media message (image/video/audio/document)',
      tags: ['WhatsApp Messages'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        required: ['to', 'media_url', 'media_type'],
        properties: {
          to: { type: 'string' },
          media_url: { type: 'string', format: 'uri' },
          media_type: { type: 'string', enum: ['image', 'video', 'audio', 'document'] },
          caption: { type: 'string', maxLength: 1024 },
          filename: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const params = request.params as { id: string };
    const { id } = instanceIdSchema.parse(params);
    const body = sendMediaMessageSchema.parse(request.body);
    
    const result = await service.sendMedia(id, user.organizationId, body);
    return reply.send({ success: true, data: result });
  });

  /**
   * Send location
   * POST /api/whatsapp/instances/:id/messages/location
   */
  fastify.post('/instances/:id/messages/location', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Send location message',
      tags: ['WhatsApp Messages'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        required: ['to', 'latitude', 'longitude'],
        properties: {
          to: { type: 'string' },
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
          name: { type: 'string' },
          address: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const params = request.params as { id: string };
    const { id } = instanceIdSchema.parse(params);
    const body = sendLocationSchema.parse(request.body);
    
    const result = await service.sendLocation(id, user.organizationId, body);
    return reply.send({ success: true, data: result });
  });

  /**
   * Get messages for instance
   * GET /api/whatsapp/instances/:id/messages
   */
  fastify.get('/instances/:id/messages', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get message history for instance',
      tags: ['WhatsApp Messages'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          chat_jid: { type: 'string' },
          direction: { type: 'string', enum: ['INCOMING', 'OUTGOING'] },
          page: { type: 'string', default: '1' },
          limit: { type: 'string', default: '50' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const params = request.params as { id: string };
    const { id } = instanceIdSchema.parse(params);
    const query = messagesQuerySchema.parse(request.query);
    
    const result = await service.getMessages(id, user.organizationId, {
      chat_jid: query.chat_jid,
      direction: query.direction,
      page: query.page,
      limit: query.limit,
    });
    return reply.send({ success: true, ...result });
  });

  // ============================================
  // GLOBAL MESSAGES ROUTES
  // ============================================

  /**
   * Get all messages for organization
   * GET /api/whatsapp/messages
   */
  fastify.get('/messages', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get all messages for organization',
      tags: ['WhatsApp Messages'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          instanceId: { type: 'string', format: 'uuid' },
          direction: { type: 'string', enum: ['INCOMING', 'OUTGOING'] },
          status: { type: 'string' },
          source: { type: 'string', enum: ['REALTIME', 'HISTORY_SYNC', 'MANUAL_IMPORT'] },
          page: { type: 'string', default: '1' },
          limit: { type: 'string', default: '20' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const query = request.query as {
      instanceId?: string;
      direction?: 'INCOMING' | 'OUTGOING';
      status?: string;
      source?: string;
      page?: string;
      limit?: string;
    };
    
    const result = await service.getAllMessages(user.organizationId, {
      instanceId: query.instanceId,
      direction: query.direction,
      status: query.status,
      source: query.source,
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 20,
    });
    return reply.send({ success: true, ...result });
  });

  /**
   * Send message (global route with instance_id in body)
   * POST /api/whatsapp/messages/send
   */
  fastify.post('/messages/send', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Send a WhatsApp message',
      tags: ['WhatsApp Messages'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['instance_id', 'to', 'type', 'content'],
        properties: {
          instance_id: { type: 'string', format: 'uuid' },
          to: { type: 'string', minLength: 10 },
          type: { type: 'string', enum: ['text', 'image', 'document', 'video', 'audio'] },
          content: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              caption: { type: 'string' },
              url: { type: 'string' },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user as JWTPayload;
    const body = request.body as {
      instance_id: string;
      to: string;
      type: string;
      content: { text?: string; caption?: string; url?: string };
    };
    
    // Verify ownership
    const instance = await service.getInstance(body.instance_id, user.organizationId);
    if (!instance) {
      return reply.status(404).send({ success: false, error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found' } });
    }

    // Send based on type
    let result;
    if (body.type === 'text') {
      result = await service.sendText(body.instance_id, user.organizationId, {
        to: body.to,
        message: body.content.text || '',
        delay: 0,
      });
    } else {
      // For media types
      result = await service.sendMedia(body.instance_id, user.organizationId, {
        to: body.to,
        media_url: body.content.url || '',
        media_type: body.type as 'image' | 'document' | 'video' | 'audio',
        caption: body.content.caption,
      });
    }

    return reply.send({ success: true, data: result });
  });

  // ============================================
  // HISTORY SYNC (Dashboard) ENDPOINTS
  // ============================================

  // GET /api/whatsapp/instances/:id/sync-status
  fastify.get<{ Params: { id: string } }>('/instances/:id/sync-status', {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const user = (request as AuthenticatedRequest).user;
      const { id } = request.params;

      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id, organization_id: user.organizationId, deleted_at: null },
        select: {
          id: true,
          status: true,
          sync_history_on_connect: true,
          history_sync_status: true,
          history_sync_progress: true,
          last_history_sync_at: true,
        },
      });

      if (!instance) {
        return reply.status(404).send({ success: false, error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found' } });
      }

      // Safety net 1: if instance is CONNECTED and sync is stale (>2 min since last batch),
      // it means the completion timer was lost (e.g. server restart). Auto-complete the sync.
      // WhatsApp sends batches every few seconds during active sync, so 2 min = definitely done.
      let effectiveStatus = instance.history_sync_status;
      let effectiveProgress = instance.history_sync_progress;
      if (
        effectiveStatus === 'SYNCING' &&
        instance.status === 'CONNECTED'
      ) {
        const progress = (instance.history_sync_progress as any) || {};
        const lastBatchAt = progress.last_batch_at
          ? new Date(progress.last_batch_at).getTime()
          : progress.started_at
            ? new Date(progress.started_at).getTime()
            : 0;
        const staleDurationMs = Date.now() - lastBatchAt;
        const COMPLETION_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

        if (lastBatchAt > 0 && staleDurationMs > COMPLETION_THRESHOLD_MS) {
          // Sync is done — no new batches for >2 min while connected. Auto-complete.
          progress.percentage = 100;
          progress.completed_at = new Date().toISOString();
          progress.auto_completed_reason = 'stale_sync_connected';
          const finalStatus = (progress.batch_errors || 0) > 0 ? 'PARTIAL' : 'COMPLETED';
          effectiveStatus = finalStatus;
          effectiveProgress = progress;

          // Persist in background
          prisma.whatsAppInstance.update({
            where: { id },
            data: {
              history_sync_status: finalStatus,
              history_sync_progress: progress,
              last_history_sync_at: new Date(),
            },
          }).catch((err: unknown) => {
            request.log.warn({ err, instanceId: id }, 'Failed to auto-complete stale sync');
          });

          request.log.info({ instanceId: id, finalStatus, messagesInserted: progress.messages_inserted }, '✅ [SYNC-STATUS] Auto-completed stale sync (connected, no batches for >2min)');
        }
      }

      // Safety net 2: if instance is DISCONNECTED and sync has been stale for >5 minutes,
      // auto-correct to STOPPED (stale state from process crash or missed cleanup).
      // Short disconnects (<5 min) are tolerated — instance can auto-reconnect.
      if (
        effectiveStatus === 'SYNCING' &&
        instance.status !== 'CONNECTED'
      ) {
        const progress = (instance.history_sync_progress as any) || {};
        const lastBatchAt = progress.last_batch_at
          ? new Date(progress.last_batch_at).getTime()
          : progress.started_at
            ? new Date(progress.started_at).getTime()
            : 0;
        const staleDurationMs = Date.now() - lastBatchAt;
        const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

        if (staleDurationMs > STALE_THRESHOLD_MS) {
          // Genuinely stale — mark as STOPPED and persist
          progress.stopped_at = new Date().toISOString();
          progress.stopped_reason = 'stale_auto_corrected';
          effectiveStatus = 'STOPPED';
          effectiveProgress = progress;

          // Fix DB in background (fire-and-forget)
          prisma.whatsAppInstance.update({
            where: { id },
            data: {
              history_sync_status: 'STOPPED',
              history_sync_progress: progress,
            },
          }).catch((err: unknown) => {
            request.log.warn({ err, instanceId: id }, 'Failed to auto-correct stale sync status');
          });
        }
        // else: recent activity — keep SYNCING, instance may auto-reconnect
      }

      // Detect if instance needs re-pair:
      // sync is enabled, instance connected, but never actually received history sync data
      const needsRepair = (
        instance.sync_history_on_connect === true &&
        instance.status === 'CONNECTED' &&
        (effectiveStatus === 'IDLE' || effectiveStatus === null) &&
        instance.last_history_sync_at === null &&
        instance.history_sync_progress === null
      );

      return reply.send({
        success: true,
        data: {
          status: effectiveStatus,
          progress: effectiveProgress || null,
          instance_status: instance.status, // for frontend smart polling decisions
          settings: {
            sync_history_on_connect: instance.sync_history_on_connect,
          },
          last_sync_at: instance.last_history_sync_at,
          needs_repair: needsRepair,
        },
      });
    },
  });

  // PATCH /api/whatsapp/instances/:id/sync-settings
  fastify.patch<{
    Params: { id: string };
    Body: { sync_history_on_connect?: boolean };
  }>('/instances/:id/sync-settings', {
    onRequest: [fastify.authenticate],
    preHandler: [requireRole(UserRole.ORG_OWNER, UserRole.ORG_ADMIN)],
    handler: async (request, reply) => {
      const user = (request as AuthenticatedRequest).user;
      const { id } = request.params;
      const body = request.body || {};

      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id, organization_id: user.organizationId, deleted_at: null },
        select: {
          id: true,
          status: true,
          organization: {
            select: {
              subscription_plan: {
                select: { allow_history_sync: true },
              },
            },
          },
        },
      });

      if (!instance) {
        return reply.status(404).send({ success: false, error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found' } });
      }

      // Check plan allows sync
      const plan = instance.organization?.subscription_plan;
      if (plan && !plan.allow_history_sync && body.sync_history_on_connect === true) {
        return reply.status(403).send({
          success: false,
          error: { code: 'PLAN_HISTORY_SYNC_DISABLED', message: 'Your subscription plan does not allow history sync. Upgrade to enable this feature.' },
        });
      }

      const updateData: any = {};
      if (body.sync_history_on_connect !== undefined) {
        updateData.sync_history_on_connect = body.sync_history_on_connect;
      }

      const updated = await prisma.whatsAppInstance.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          sync_history_on_connect: true,
          status: true,
        },
      });

      // Invalidate sync config cache
      const { invalidateSyncConfigCache } = await import('./baileys.service');
      invalidateSyncConfigCache(id);

      const warning = updated.status === 'CONNECTED'
        ? 'History sync hanya terjadi saat initial pairing (scan QR pertama). Untuk sync ulang, disconnect lalu reconnect (scan QR baru).'
        : undefined;

      return reply.send({
        success: true,
        data: {
          settings: {
            sync_history_on_connect: updated.sync_history_on_connect,
          },
          warning,
        },
      });
    },
  });

  // POST /api/whatsapp/instances/:id/re-pair
  fastify.post<{ Params: { id: string } }>('/instances/:id/re-pair', {
    onRequest: [fastify.authenticate],
    preHandler: [requireRole(UserRole.ORG_OWNER, UserRole.ORG_ADMIN)],
    handler: async (request, reply) => {
      const user = (request as AuthenticatedRequest).user;
      const { id } = request.params;

      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id, organization_id: user.organizationId, deleted_at: null },
        select: {
          id: true,
          status: true,
          history_sync_status: true,
          organization: {
            select: {
              subscription_plan: {
                select: { allow_history_sync: true },
              },
            },
          },
        },
      });

      if (!instance) {
        return reply.status(404).send({ success: false, error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found' } });
      }

      // Check plan
      const plan = instance.organization?.subscription_plan;
      if (plan && !plan.allow_history_sync) {
        return reply.status(403).send({
          success: false,
          error: { code: 'PLAN_HISTORY_SYNC_DISABLED', message: 'Your subscription plan does not allow history sync. Upgrade to enable this feature.' },
        });
      }

      // Block if currently syncing
      if (instance.history_sync_status === 'SYNCING') {
        return reply.status(409).send({
          success: false,
          error: { code: 'HISTORY_SYNC_IN_PROGRESS', message: 'History sync is currently in progress. Wait for it to complete before re-pairing.' },
        });
      }

      // Enable sync and disconnect (logout + delete session)
      await prisma.whatsAppInstance.update({
        where: { id },
        data: {
          sync_history_on_connect: true,
          history_sync_status: 'IDLE',
          history_sync_progress: Prisma.DbNull,
        },
      });

      // Invalidate cache
      const { invalidateSyncConfigCache, disconnectInstance } = await import('./baileys.service');
      invalidateSyncConfigCache(id);

      // Disconnect (this calls socket.logout() which deletes the session)
      await disconnectInstance(id);

      return reply.send({
        success: true,
        message: 'Instance logged out. Scan QR to reconnect — history sync will start automatically.',
        data: {
          status: 'DISCONNECTED',
          note: 'Connect ulang lalu scan QR baru',
        },
      });
    },
  });

  // ============================================
  // SYNC DATA — Clear History
  // ============================================

  /**
   * Delete all history sync messages and reset sync state
   * DELETE /instances/:id/sync-data
   */
  fastify.delete<{ Params: { id: string } }>('/instances/:id/sync-data', {
    onRequest: [fastify.authenticate],
    preHandler: [requireRole(UserRole.ORG_OWNER, UserRole.ORG_ADMIN)],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
    },
    handler: async (request, reply) => {
      const user = (request as AuthenticatedRequest).user;
      const { id } = request.params;

      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id, organization_id: user.organizationId, deleted_at: null },
        select: { id: true, history_sync_status: true },
      });

      if (!instance) {
        return reply.status(404).send({ success: false, error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found' } });
      }

      // Block if sync is currently running
      if (instance.history_sync_status === 'SYNCING') {
        return reply.status(409).send({
          success: false,
          error: { code: 'HISTORY_SYNC_IN_PROGRESS', message: 'Cannot clear data while sync is in progress. Stop the sync first.' },
        });
      }

      // 1. Stop any in-memory sync state (safety)
      const { cleanupSyncState } = await import('./baileys.service');
      cleanupSyncState(id);

      // 2. Delete all HISTORY_SYNC messages for this instance
      const deleted = await prisma.message.deleteMany({
        where: { instance_id: id, source: 'HISTORY_SYNC' },
      });

      // 3. Reset sync state on instance
      await prisma.whatsAppInstance.update({
        where: { id },
        data: {
          history_sync_status: 'IDLE',
          history_sync_progress: Prisma.DbNull,
          last_history_sync_at: null,
        },
      });

      return reply.send({
        success: true,
        message: `Deleted ${deleted.count} history sync messages. Sync state reset to IDLE.`,
        data: {
          deleted_count: deleted.count,
          status: 'IDLE',
        },
      });
    },
  });

  // ============================================
  // SYNC CONTROL — Stop / Resume
  // ============================================

  /**
   * Control history sync: stop or resume
   * POST /instances/:id/sync-control
   */
  fastify.route<{
    Params: { id: string };
    Body: { action: 'stop' | 'resume' };
  }>({
    method: 'POST',
    url: '/instances/:id/sync-control',
    onRequest: [fastify.authenticate],
    preHandler: [requireRole(UserRole.ORG_OWNER, UserRole.ORG_ADMIN)],
    schema: {
      params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
      body: {
        type: 'object',
        properties: { action: { type: 'string', enum: ['stop', 'resume'] } },
        required: ['action'],
      },
    },
    handler: async (request, reply) => {
      const { id } = request.params;
      const { action } = request.body;
      const user = request.user as JWTPayload;

      // Verify ownership
      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id, organization_id: user.organizationId },
        select: { id: true, history_sync_status: true },
      });

      if (!instance) {
        return reply.status(404).send({ success: false, error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found' } });
      }

      const { stopHistorySync, resumeHistorySync } = await import('./baileys.service');

      if (action === 'stop') {
        // Allow stopping from any state except already STOPPED
        if (instance.history_sync_status === 'STOPPED') {
          return reply.send({
            success: true,
            message: 'History sync is already stopped.',
            data: { status: 'STOPPED' },
          });
        }

        // stopHistorySync handles everything: in-memory, DB status, sync_history_on_connect
        await stopHistorySync(id);

        return reply.send({
          success: true,
          message: 'History sync stopped successfully.',
          data: { status: 'STOPPED' },
        });
      }

      if (action === 'resume') {
        // Allow resuming from STOPPED or PARTIAL state
        if (instance.history_sync_status === 'SYNCING') {
          return reply.send({
            success: true,
            message: 'History sync is already running.',
            data: { status: 'SYNCING' },
          });
        }

        await resumeHistorySync(id);
        return reply.send({
          success: true,
          message: 'History sync resumed. Incoming batches will be processed again.',
          data: { status: 'SYNCING' },
        });
      }

      return reply.status(400).send({ success: false, error: { code: 'INVALID_ACTION', message: 'Invalid action. Use "stop" or "resume".' } });
    },
  });
}
