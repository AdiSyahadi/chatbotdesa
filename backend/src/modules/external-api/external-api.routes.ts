/**
 * External API Routes - For n8n, Make, Zapier, and other integrations
 * @module external-api/routes
 * 
 * All routes use X-API-Key header authentication
 * 
 * Usage:
 *   curl -H "X-API-Key: wa_xxxxxxxxxxxx" http://localhost:3001/api/v1/messages/send-text
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticateApiKey, requireApiKeyPermission, ApiKeyAuthenticatedRequest } from '../../middleware/api-key-auth';
import { apiRateLimitHook } from '../../middleware/api-rate-limiter';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { contactService } from '../contacts/contacts.service';
import { listContactsQuerySchema, createContactSchema, updateContactSchema, contactIdParamSchema } from '../contacts/contacts.schema';
import { createWebhookService } from '../webhooks/webhooks.service';
import { getStorageStats } from '../../workers/media-cleanup.worker';
import { parsePagination } from '../../utils/pagination';
import { batchResolveLidToPhone } from '../whatsapp/baileys.service';
import { saveFile, validateFile } from '../../services/storage.service';
import { Readable } from 'stream';
import prisma from '../../config/database';
import { Prisma } from '@prisma/client';
import logger from '../../config/logger';

// ============================================
// EXTERNAL API ROUTES (API Key Auth)
// ============================================

export async function externalApiRoutes(fastify: FastifyInstance) {
  const whatsappService = new WhatsAppService(fastify);
  const webhookService = createWebhookService(fastify);

  // All routes require API Key authentication
  fastify.addHook('preHandler', authenticateApiKey);

  // Real Redis-backed rate limiting per API key
  fastify.addHook('preHandler', apiRateLimitHook);

  // ============================================
  // INSTANCE ENDPOINTS
  // ============================================

  /**
   * List WhatsApp instances
   * GET /api/v1/instances
   * Permission: instance:read
   */
  fastify.get('/instances', {
    schema: {
      description: 'List all WhatsApp instances',
      tags: ['External API - Instances'],
      security: [{ apiKeyAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    
    const instances = await prisma.whatsAppInstance.findMany({
      where: { organization_id: req.apiKey.organization_id },
      select: {
        id: true,
        name: true,
        phone_number: true,
        wa_display_name: true,
        status: true,
        is_active: true,
        connected_at: true,
        daily_message_count: true,
        daily_limit: true,
        warming_phase: true,
        health_score: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return reply.send({
      success: true,
      data: instances,
    });
  });

  /**
   * Get instance status
   * GET /api/v1/instances/:instanceId/status
   * Permission: instance:read
   */
  fastify.get('/instances/:instanceId/status', {
    schema: {
      description: 'Get WhatsApp instance connection status',
      tags: ['External API - Instances'],
      security: [{ apiKeyAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceId'],
        properties: {
          instanceId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const { instanceId } = request.params as { instanceId: string };

    const result = await whatsappService.getStatus(instanceId, req.apiKey.organization_id);
    return reply.send({ success: true, data: result });
  });

  /**
   * Delete all data for an instance (messages, webhooks, webhook logs)
   * DELETE /api/v1/instances/:instanceId/data
   * Permission: instance:write
   * 
   * Cleans up all conversation/message data while keeping the instance itself
   */
  fastify.delete('/instances/:instanceId/data', {
    preHandler: [requireApiKeyPermission('instance:write')],
    schema: {
      description: 'Delete all messages, webhooks, and webhook logs for an instance. The instance itself is preserved.',
      tags: ['External API - Instances'],
      security: [{ apiKeyAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceId'],
        properties: {
          instanceId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const { instanceId } = request.params as { instanceId: string };

    // Verify instance belongs to org
    const instance = await prisma.whatsAppInstance.findFirst({
      where: { id: instanceId, organization_id: req.apiKey.organization_id, deleted_at: null },
    });
    if (!instance) {
      return reply.status(404).send({ success: false, error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found' } });
    }

    // Delete webhook logs first (FK constraint)
    const webhookIds = await prisma.webhook.findMany({
      where: { instance_id: instanceId, organization_id: req.apiKey.organization_id },
      select: { id: true },
    });
    const deletedLogs = await prisma.webhookLog.deleteMany({
      where: { webhook_id: { in: webhookIds.map(w => w.id) } },
    });

    // Delete webhooks
    const deletedWebhooks = await prisma.webhook.deleteMany({
      where: { instance_id: instanceId, organization_id: req.apiKey.organization_id },
    });

    // Delete messages
    const deletedMessages = await prisma.message.deleteMany({
      where: { instance_id: instanceId, organization_id: req.apiKey.organization_id },
    });

    logger.info({ instanceId, messages: deletedMessages.count, webhooks: deletedWebhooks.count, logs: deletedLogs.count }, 'External API: instance data cleaned up');

    return reply.send({
      success: true,
      data: {
        message: 'Instance data cleaned up successfully',
        deleted: {
          messages: deletedMessages.count,
          webhooks: deletedWebhooks.count,
          webhook_logs: deletedLogs.count,
        },
      },
    });
  });

  /**
   * Reset instance (disconnect + cleanup data + ready to reconnect)
   * POST /api/v1/instances/:instanceId/reset
   * Permission: instance:write
   *
   * Disconnects instance, cleans all data, resets counters
   */
  fastify.post('/instances/:instanceId/reset', {
    preHandler: [requireApiKeyPermission('instance:write')],
    schema: {
      description: 'Reset instance: disconnect, cleanup all data, reset counters. Instance is ready to scan QR again.',
      tags: ['External API - Instances'],
      security: [{ apiKeyAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceId'],
        properties: {
          instanceId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const { instanceId } = request.params as { instanceId: string };

    // Verify instance belongs to org
    const instance = await prisma.whatsAppInstance.findFirst({
      where: { id: instanceId, organization_id: req.apiKey.organization_id, deleted_at: null },
    });
    if (!instance) {
      return reply.status(404).send({ success: false, error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found' } });
    }

    // 1. Disconnect instance if connected
    try {
      await whatsappService.disconnect(instanceId, req.apiKey.organization_id);
    } catch (e) {
      // May already be disconnected, continue
    }

    // 2. Delete webhook logs
    const webhookIds = await prisma.webhook.findMany({
      where: { instance_id: instanceId, organization_id: req.apiKey.organization_id },
      select: { id: true },
    });
    await prisma.webhookLog.deleteMany({
      where: { webhook_id: { in: webhookIds.map(w => w.id) } },
    });

    // 3. Delete webhooks
    await prisma.webhook.deleteMany({
      where: { instance_id: instanceId, organization_id: req.apiKey.organization_id },
    });

    // 4. Delete messages
    await prisma.message.deleteMany({
      where: { instance_id: instanceId, organization_id: req.apiKey.organization_id },
    });

    // 5. Reset instance counters
    await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: {
        status: 'DISCONNECTED',
        phone_number: null,
        qr_code: null,
        daily_message_count: 0,
        health_score: 100,
        connected_at: null,
        disconnected_at: new Date(),
        session_data: null,
        session_last_sync: null,
      },
    });

    logger.info({ instanceId }, 'External API: instance reset');

    return reply.send({
      success: true,
      data: {
        message: 'Instance reset successfully. Ready to scan QR and reconnect.',
        instance_id: instanceId,
      },
    });
  });

  /**
   * Get webhook delivery status/stats for an instance
   * GET /api/v1/webhook/status
   * Permission: webhook:read
   */
  fastify.get('/webhook/status', {
    preHandler: [requireApiKeyPermission('webhook:read')],
    schema: {
      description: 'Get webhook delivery statistics: total, delivered, failed, pending counts.',
      tags: ['External API - Webhook'],
      security: [{ apiKeyAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          instance_id: { type: 'string', format: 'uuid', description: 'Filter by instance ID' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const query = request.query as { instance_id?: string };

    const where: any = { organization_id: req.apiKey.organization_id };
    if (query.instance_id) where.instance_id = query.instance_id;

    const [total, delivered, failed, pending] = await Promise.all([
      prisma.webhook.count({ where }),
      prisma.webhook.count({ where: { ...where, status: 'DELIVERED' } }),
      prisma.webhook.count({ where: { ...where, status: 'FAILED' } }),
      prisma.webhook.count({ where: { ...where, status: { in: ['PENDING', 'PROCESSING'] } } }),
    ]);

    return reply.send({
      success: true,
      data: {
        total,
        delivered,
        failed,
        pending,
        success_rate: total > 0 ? `${((delivered / total) * 100).toFixed(1)}%` : 'N/A',
      },
    });
  });

  // ============================================
  // MESSAGING ENDPOINTS
  // ============================================

  /**
   * Send text message
   * POST /api/v1/messages/send-text
   * Permission: message:send
   */
  fastify.post('/messages/send-text', {
    preHandler: [requireApiKeyPermission('message:send')],
    schema: {
      description: 'Send a text message via WhatsApp',
      tags: ['External API - Messages'],
      security: [{ apiKeyAuth: [] }],
      body: {
        type: 'object',
        required: ['instance_id', 'to'],
        properties: {
          instance_id: { type: 'string', format: 'uuid', description: 'WhatsApp instance ID' },
          to: { type: 'string', description: 'Phone number (e.g., 628123456789)' },
          message: { type: 'string', maxLength: 4096, description: 'Text message content' },
          text: { type: 'string', maxLength: 4096, description: 'Text message content (alias for message)' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const body = request.body as { instance_id: string; to: string; message?: string; text?: string };

    // Accept both 'message' and 'text' field names for backwards compatibility
    const messageContent = body.message || body.text;
    if (!messageContent) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION', message: 'Either "message" or "text" field is required' },
      });
    }

    const result = await whatsappService.sendText(
      body.instance_id,
      req.apiKey.organization_id,
      { to: body.to, message: messageContent, delay: 0 }
    );

    logger.info({ instanceId: body.instance_id, to: body.to, apiKeyId: req.apiKey.id }, 'External API: text message sent');
    return reply.send({ success: true, data: result });
  });

  /**
   * Upload media file
   * POST /api/v1/media/upload
   * Permission: message:send
   * Returns a public URL that can be used directly in send-media endpoint
   */
  fastify.post('/media/upload', {
    preHandler: [requireApiKeyPermission('message:send')],
    schema: {
      description: 'Upload a media file (image/video/audio/document). Returns a public URL for use with send-media.',
      tags: ['External API - Media'],
      security: [{ apiKeyAuth: [] }],
      consumes: ['multipart/form-data'],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;

    try {
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({ success: false, error: 'No file uploaded. Send file as multipart/form-data with field name "file".' });
      }

      // Read expected media type from form field or query param
      const typeField = data.fields?.type;
      const expectedType =
        (typeField && 'value' in typeField ? typeField.value as string : undefined)
        || (request.query as { type?: string }).type;

      // Consume stream to buffer for size validation
      const fileBuffer = await data.toBuffer();

      // Validate file type and size
      const validation = validateFile(data.mimetype, fileBuffer.length, expectedType);
      if (!validation.valid) {
        return reply.status(400).send({ success: false, error: validation.error });
      }

      // Save file using existing storage service (reuse, no duplication)
      const result = await saveFile(
        Readable.from(fileBuffer),
        data.filename,
        data.mimetype,
        req.apiKey.organization_id
      );

      if (!result.success) {
        return reply.status(500).send({ success: false, error: result.error });
      }

      // Return public URL (/media/ prefix — no auth required, UUID filenames = unguessable)
      const publicUrl = result.url!.replace('/uploads/', '/media/');

      logger.info({ apiKeyId: req.apiKey.id, mediaType: validation.mediaType, filename: data.filename }, 'External API: media uploaded');

      return reply.send({
        success: true,
        data: {
          url: publicUrl,
          media_type: validation.mediaType,
          mime_type: data.mimetype,
          file_size: fileBuffer.length,
          original_name: data.filename,
        },
      });
    } catch (error) {
      logger.error({ error }, 'External API: media upload failed');
      return reply.status(500).send({ success: false, error: 'Failed to process upload' });
    }
  });

  /**
   * Send media message (image, video, document, audio)
   * POST /api/v1/messages/send-media
   * Permission: message:send
   */
  fastify.post('/messages/send-media', {
    preHandler: [requireApiKeyPermission('message:send')],
    schema: {
      description: 'Send a media message (image/video/audio/document)',
      tags: ['External API - Messages'],
      security: [{ apiKeyAuth: [] }],
      body: {
        type: 'object',
        required: ['instance_id', 'to', 'media_url', 'media_type'],
        properties: {
          instance_id: { type: 'string', format: 'uuid', description: 'WhatsApp instance ID' },
          to: { type: 'string', description: 'Phone number (e.g., 628123456789)' },
          media_url: { type: 'string', format: 'uri', description: 'URL of the media file' },
          media_type: { type: 'string', enum: ['image', 'video', 'audio', 'document'], description: 'Type of media' },
          caption: { type: 'string', maxLength: 1024, description: 'Caption for the media (not for audio)' },
          filename: { type: 'string', description: 'Filename for document' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const body = request.body as {
      instance_id: string;
      to: string;
      media_url: string;
      media_type: 'image' | 'video' | 'audio' | 'document';
      caption?: string;
      filename?: string;
    };

    const result = await whatsappService.sendMedia(
      body.instance_id,
      req.apiKey.organization_id,
      {
        to: body.to,
        media_url: body.media_url,
        media_type: body.media_type,
        caption: body.caption,
        filename: body.filename,
      }
    );

    logger.info({ instanceId: body.instance_id, to: body.to, type: body.media_type, apiKeyId: req.apiKey.id }, 'External API: media message sent');
    return reply.send({ success: true, data: result });
  });

  /**
   * Send location message
   * POST /api/v1/messages/send-location
   * Permission: message:send
   */
  fastify.post('/messages/send-location', {
    preHandler: [requireApiKeyPermission('message:send')],
    schema: {
      description: 'Send a location message',
      tags: ['External API - Messages'],
      security: [{ apiKeyAuth: [] }],
      body: {
        type: 'object',
        required: ['instance_id', 'to', 'latitude', 'longitude'],
        properties: {
          instance_id: { type: 'string', format: 'uuid', description: 'WhatsApp instance ID' },
          to: { type: 'string', description: 'Phone number (e.g., 628123456789)' },
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
          name: { type: 'string', description: 'Location name' },
          address: { type: 'string', description: 'Location address' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const body = request.body as {
      instance_id: string;
      to: string;
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
    };

    const result = await whatsappService.sendLocation(
      body.instance_id,
      req.apiKey.organization_id,
      {
        to: body.to,
        latitude: body.latitude,
        longitude: body.longitude,
        name: body.name,
        address: body.address,
      }
    );

    logger.info({ instanceId: body.instance_id, to: body.to, apiKeyId: req.apiKey.id }, 'External API: location message sent');
    return reply.send({ success: true, data: result });
  });

  /**
   * Delete / revoke a WhatsApp message
   * POST /api/v1/messages/delete
   * Permission: message:send
   *
   * delete_for "everyone" — revokes the message so all chat participants
   *   see "This message was deleted" (works ~2 days after sending).
   * delete_for "me" — removes the message from the local device.
   */
  fastify.post('/messages/delete', {
    preHandler: [requireApiKeyPermission('message:send')],
    schema: {
      description: 'Delete / revoke a WhatsApp message',
      tags: ['External API - Messages'],
      security: [{ apiKeyAuth: [] }],
      body: {
        type: 'object',
        required: ['instance_id', 'message_id', 'chat_jid'],
        properties: {
          instance_id: { type: 'string', format: 'uuid', description: 'WhatsApp instance ID' },
          message_id: { type: 'string', description: 'WhatsApp message ID (wa_message_id)' },
          chat_jid: { type: 'string', description: 'Chat JID (e.g. 628xxx@s.whatsapp.net or xxx@g.us)' },
          from_me: { type: 'boolean', description: 'Whether the message was sent by this account (default: true)' },
          participant: { type: 'string', description: 'Sender JID in group (required when from_me=false in group chats)' },
          delete_for: { type: 'string', enum: ['everyone', 'me'], description: 'Delete for everyone or only for me (default: everyone)' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const body = request.body as {
      instance_id: string;
      message_id: string;
      chat_jid: string;
      from_me?: boolean;
      participant?: string;
      delete_for?: 'everyone' | 'me';
    };

    const result = await whatsappService.deleteMessage(
      body.instance_id,
      req.apiKey.organization_id,
      {
        message_id: body.message_id,
        chat_jid: body.chat_jid,
        from_me: body.from_me,
        participant: body.participant,
        delete_for: body.delete_for,
      }
    );

    logger.info({
      instanceId: body.instance_id,
      messageId: body.message_id,
      deleteFor: body.delete_for || 'everyone',
      apiKeyId: req.apiKey.id,
    }, 'External API: message deleted');

    return reply.send({ success: true, data: result });
  });

  /**
   * Edit a WhatsApp message (text body or media caption)
   * POST /api/v1/messages/edit
   * Permission: message:send
   *
   * Only works for messages sent by this account and within ~15 minutes
   * of the original send time (enforced by WhatsApp server).
   */
  fastify.post('/messages/edit', {
    preHandler: [requireApiKeyPermission('message:send')],
    schema: {
      description: 'Edit a WhatsApp message (text or media caption). Only own messages within ~15 min.',
      tags: ['External API - Messages'],
      security: [{ apiKeyAuth: [] }],
      body: {
        type: 'object',
        required: ['instance_id', 'message_id', 'chat_jid', 'new_text'],
        properties: {
          instance_id: { type: 'string', format: 'uuid', description: 'WhatsApp instance ID' },
          message_id: { type: 'string', description: 'WhatsApp message ID (wa_message_id)' },
          chat_jid: { type: 'string', description: 'Chat JID (e.g. 628xxx@s.whatsapp.net or xxx@g.us)' },
          new_text: { type: 'string', maxLength: 4096, description: 'New message text or caption' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const body = request.body as {
      instance_id: string;
      message_id: string;
      chat_jid: string;
      new_text: string;
    };

    if (!body.new_text || body.new_text.trim().length === 0) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION', message: 'new_text cannot be empty' },
      });
    }

    const result = await whatsappService.editMessage(
      body.instance_id,
      req.apiKey.organization_id,
      {
        message_id: body.message_id,
        chat_jid: body.chat_jid,
        new_text: body.new_text,
      }
    );

    logger.info({
      instanceId: body.instance_id,
      messageId: body.message_id,
      apiKeyId: req.apiKey.id,
    }, 'External API: message edited');

    return reply.send({ success: true, data: result });
  });

  /**
   * Get messages
   * GET /api/v1/messages
   * Permission: message:read
   */
  fastify.get('/messages', {
    preHandler: [requireApiKeyPermission('message:read')],
    schema: {
      description: 'Get message history. Filter by instance, direction, phone number, time range, or search content.',
      tags: ['External API - Messages'],
      security: [{ apiKeyAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          instance_id: { type: 'string', format: 'uuid', description: 'Filter by instance ID' },
          direction: { type: 'string', enum: ['INCOMING', 'OUTGOING'] },
          phone_number: { type: 'string', description: 'Filter by phone number (e.g., 628123456789)' },
          chat_jid: { type: 'string', description: 'Filter by chat JID (e.g., 628123456789@s.whatsapp.net)' },
          search: { type: 'string', description: 'Search message content (keyword)' },
          since: { type: 'string', description: 'Only return messages after this ISO timestamp (e.g., 2026-02-10T00:00:00Z)' },
          until: { type: 'string', description: 'Only return messages before this ISO timestamp' },
          page: { type: 'string', default: '1' },
          limit: { type: 'string', default: '20' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const query = request.query as {
      instance_id?: string;
      direction?: 'INCOMING' | 'OUTGOING';
      phone_number?: string;
      chat_jid?: string;
      search?: string;
      since?: string;
      until?: string;
      page?: string;
      limit?: string;
    };

    const { page, limit, skip } = parsePagination(query);

    // Build where clause with new filters
    const where: any = {
      organization_id: req.apiKey.organization_id,
    };

    if (query.instance_id) where.instance_id = query.instance_id;
    if (query.direction) where.direction = query.direction;

    // Filter by phone number (convert to JID)
    if (query.phone_number) {
      const phone = query.phone_number.replace(/[^0-9]/g, '');
      where.chat_jid = `${phone}@s.whatsapp.net`;
    }

    // Filter by chat_jid directly
    if (query.chat_jid) {
      where.chat_jid = query.chat_jid;
    }

    // Search message content
    if (query.search) {
      where.content = { contains: query.search };
    }

    // Time range filters — use sent_at (original message timestamp) not created_at
    // This ensures history-synced messages are filtered by their real date, not DB insert time
    if (query.since || query.until) {
      where.sent_at = {};
      if (query.since) {
        const sinceDate = new Date(query.since);
        if (!isNaN(sinceDate.getTime())) where.sent_at.gte = sinceDate;
      }
      if (query.until) {
        const untilDate = new Date(query.until);
        if (!isNaN(untilDate.getTime())) where.sent_at.lte = untilDate;
      }
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ sent_at: 'desc' }, { created_at: 'desc' }],
        select: {
          id: true,
          instance_id: true,
          wa_message_id: true,
          chat_jid: true,
          sender_jid: true,
          message_type: true,
          content: true,
          media_url: true,
          direction: true,
          status: true,
          sent_at: true,
          delivered_at: true,
          read_at: true,
          created_at: true,
        },
      }),
      prisma.message.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: messages,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  });

  // ============================================
  // CONTACT ENDPOINTS
  // ============================================

  /**
   * List contacts
   * GET /api/v1/contacts
   * Permission: contact:read
   */
  fastify.get('/contacts', {
    preHandler: [requireApiKeyPermission('contact:read')],
    schema: {
      description: 'List contacts',
      tags: ['External API - Contacts'],
      security: [{ apiKeyAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          instance_id: { type: 'string', format: 'uuid', description: 'Filter by instance ID' },
          search: { type: 'string', description: 'Search by name or phone' },
          page: { type: 'string', default: '1' },
          limit: { type: 'string', default: '20' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const query = listContactsQuerySchema.parse(request.query);

    const result = await contactService.listContacts(req.apiKey.organization_id, query);
    return reply.send({ success: true, ...result });
  });

  /**
   * Create contact
   * POST /api/v1/contacts
   * Permission: contact:write
   */
  fastify.post('/contacts', {
    preHandler: [requireApiKeyPermission('contact:write')],
    schema: {
      description: 'Create a new contact',
      tags: ['External API - Contacts'],
      security: [{ apiKeyAuth: [] }],
      body: {
        type: 'object',
        required: ['instance_id', 'phone_number'],
        properties: {
          instance_id: { type: 'string', format: 'uuid', description: 'WhatsApp instance ID' },
          phone_number: { type: 'string', description: 'Phone number (e.g., 628123456789)' },
          name: { type: 'string', description: 'Contact name' },
          notes: { type: 'string', description: 'Notes about contact' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags for contact' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const body = createContactSchema.parse(request.body);

    const result = await contactService.createContact(req.apiKey.organization_id, body);

    logger.info({ phone: body.phone_number, apiKeyId: req.apiKey.id }, 'External API: contact created');
    return reply.status(201).send({ success: true, data: result });
  });

  /**
   * Update contact
   * PATCH /api/v1/contacts/:id
   * Permission: contact:write
   */
  fastify.patch('/contacts/:id', {
    preHandler: [requireApiKeyPermission('contact:write')],
    schema: {
      description: 'Update an existing contact',
      tags: ['External API - Contacts'],
      security: [{ apiKeyAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Contact ID' },
        },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 255, description: 'Contact name' },
          notes: { type: 'string', maxLength: 5000, description: 'Notes about contact' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags for contact' },
          custom_fields: { type: 'object', description: 'Custom fields (key-value pairs)' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const params = contactIdParamSchema.parse(request.params);
    const body = updateContactSchema.parse(request.body);

    const result = await contactService.updateContact(params.id, req.apiKey.organization_id, body);

    logger.info({ contactId: params.id, apiKeyId: req.apiKey.id }, 'External API: contact updated');
    return reply.send({ success: true, data: result });
  });

  /**
   * Delete contact
   * DELETE /api/v1/contacts/:id
   * Permission: contact:delete
   */
  fastify.delete('/contacts/:id', {
    preHandler: [requireApiKeyPermission('contact:delete')],
    schema: {
      description: 'Delete a contact',
      tags: ['External API - Contacts'],
      security: [{ apiKeyAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Contact ID' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const params = contactIdParamSchema.parse(request.params);

    await contactService.deleteContact(params.id, req.apiKey.organization_id);

    logger.info({ contactId: params.id, apiKeyId: req.apiKey.id }, 'External API: contact deleted');
    return reply.send({ success: true, data: { message: 'Contact deleted successfully' } });
  });

  /**
   * Get single contact
   * GET /api/v1/contacts/:id
   * Permission: contact:read
   */
  fastify.get('/contacts/:id', {
    preHandler: [requireApiKeyPermission('contact:read')],
    schema: {
      description: 'Get a single contact by ID',
      tags: ['External API - Contacts'],
      security: [{ apiKeyAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Contact ID' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const params = contactIdParamSchema.parse(request.params);

    const contact = await prisma.contact.findFirst({
      where: {
        id: params.id,
        organization_id: req.apiKey.organization_id,
      },
    });

    if (!contact) {
      return reply.status(404).send({ success: false, error: { code: 'CONTACT_NOT_FOUND', message: 'Contact not found' } });
    }

    return reply.send({ success: true, data: contact });
  });

  // ============================================
  // CONVERSATION ENDPOINTS
  // ============================================

  /**
   * List conversations (grouped chats per contact)
   * GET /api/v1/conversations
   * Permission: message:read
   */
  fastify.get('/conversations', {
    preHandler: [requireApiKeyPermission('message:read')],
    schema: {
      description: 'List conversations grouped by contact (chat threads). Filters out @lid and self-chat by default.',
      tags: ['External API - Conversations'],
      security: [{ apiKeyAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          instance_id: { type: 'string', format: 'uuid', description: 'Filter by instance ID' },
          since: { type: 'string', description: 'Only return conversations with messages after this ISO timestamp (e.g., 2026-02-10T00:00:00Z)' },
          include_lid: { type: 'string', enum: ['true', 'false'], default: 'false', description: 'Include @lid conversations (default: false)' },
          include_self: { type: 'string', enum: ['true', 'false'], default: 'false', description: 'Include self-chat (default: false)' },
          page: { type: 'string', default: '1' },
          limit: { type: 'string', default: '20' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const query = request.query as { instance_id?: string; since?: string; include_lid?: string; include_self?: string; page?: string; limit?: string };
    const { page, limit, skip: offset } = parsePagination(query);
    const includeLid = query.include_lid === 'true';
    const includeSelf = query.include_self === 'true';

    // Build where clause
    const where: any = {
      organization_id: req.apiKey.organization_id,
      chat_jid: { not: '' },
    };
    if (query.instance_id) where.instance_id = query.instance_id;

    // Filter by time: "since" parameter
    if (query.since) {
      const sinceDate = new Date(query.since);
      if (!isNaN(sinceDate.getTime())) {
        where.created_at = { gte: sinceDate };
      }
    }

    // Get instance phone numbers for self-chat filtering
    let instancePhones: Set<string> = new Set();
    if (!includeSelf) {
      const instances = await prisma.whatsAppInstance.findMany({
        where: { organization_id: req.apiKey.organization_id, deleted_at: null },
        select: { phone_number: true },
      });
      for (const inst of instances) {
        if (inst.phone_number) {
          // Store as JID format for comparison
          const cleaned = inst.phone_number.replace(/[^0-9]/g, '').replace(/:.*$/, '');
          instancePhones.add(`${cleaned}@s.whatsapp.net`);
        }
      }
    }

    // Use Prisma groupBy to get conversations efficiently (no OOM risk)
    const conversationGroups = await prisma.message.groupBy({
      by: ['chat_jid', 'instance_id'],
      where,
      _count: { id: true },
      _max: { created_at: true },
    });

    // Filter and enrich with metadata in memory (only group keys, not full messages)
    const conversations = conversationGroups
      .filter(g => {
        if (!g.chat_jid) return false;
        const isLid = g.chat_jid.endsWith('@lid');
        const isSelf = instancePhones.has(g.chat_jid);
        if (isLid && !includeLid) return false;
        if (isSelf && !includeSelf) return false;
        return true;
      })
      .map(g => ({
        chat_jid: g.chat_jid,
        instance_id: g.instance_id,
        count: g._count.id,
        last_at: g._max.created_at!,
        is_lid: g.chat_jid.endsWith('@lid'),
        is_group: g.chat_jid.endsWith('@g.us'),
        is_self: instancePhones.has(g.chat_jid),
      }))
      .sort((a, b) => b.last_at.getTime() - a.last_at.getTime());

    const total = conversations.length;
    const paginatedConversations = conversations.slice(offset, offset + limit);

    // Batch-fetch contacts for paginated conversations (avoid N+1)
    const chatJids = paginatedConversations.map(c => c.chat_jid).filter(Boolean);
    const contacts = await prisma.contact.findMany({
      where: {
        organization_id: req.apiKey.organization_id,
        jid: { in: chatJids },
      },
      select: { id: true, name: true, phone_number: true, tags: true, jid: true, instance_id: true },
    });
    const contactMap = new Map(contacts.map(c => [`${c.jid}__${c.instance_id}`, c]));

    // Batch-resolve LID JIDs to phone numbers from mapping table
    const lidJids = paginatedConversations.filter(c => c.is_lid).map(c => c.chat_jid);
    // Group by instance_id for batch lookup
    const lidByInstance = new Map<string, string[]>();
    for (const conv of paginatedConversations) {
      if (conv.is_lid) {
        const list = lidByInstance.get(conv.instance_id) || [];
        list.push(conv.chat_jid);
        lidByInstance.set(conv.instance_id, list);
      }
    }
    const lidPhoneMap = new Map<string, string>(); // key: "instanceId__lidJid", value: phone_number
    for (const [instId, lids] of lidByInstance) {
      const resolved = await batchResolveLidToPhone(instId, lids);
      for (const [lid, phone] of resolved) {
        lidPhoneMap.set(`${instId}__${lid}`, phone);
      }
    }

    // Enrich with last message and contact info
    const enrichedConversations = await Promise.all(
      paginatedConversations.map(async (conv) => {
        // Get last message
        const lastMessage = await prisma.message.findFirst({
          where: {
            chat_jid: conv.chat_jid,
            instance_id: conv.instance_id,
            organization_id: req.apiKey.organization_id,
          },
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            content: true,
            message_type: true,
            direction: true,
            status: true,
            created_at: true,
          },
        });

        // Get unread count (incoming messages not read)
        const unreadCount = await prisma.message.count({
          where: {
            chat_jid: conv.chat_jid,
            instance_id: conv.instance_id,
            organization_id: req.apiKey.organization_id,
            direction: 'INCOMING',
            read_at: null,
          },
        });

        // Extract phone number from JID
        let phoneNumber = '';
        if (conv.chat_jid.endsWith('@s.whatsapp.net')) {
          phoneNumber = conv.chat_jid.replace('@s.whatsapp.net', '');
        } else if (conv.chat_jid.endsWith('@g.us')) {
          phoneNumber = conv.chat_jid.replace('@g.us', '');
        } else if (conv.is_lid) {
          // Try to resolve @lid to phone number from mapping table
          const resolvedPhone = lidPhoneMap.get(`${conv.instance_id}__${conv.chat_jid}`);
          phoneNumber = resolvedPhone || '';
        }
        // @lid with no mapping — leave it empty

        // Look up contact from batch-fetched map
        const contact = contactMap.get(`${conv.chat_jid}__${conv.instance_id}`) || null;

        return {
          chat_jid: conv.chat_jid,
          instance_id: conv.instance_id,
          phone_number: phoneNumber,
          is_group: conv.is_group,
          is_lid: conv.is_lid,
          lid_resolved: conv.is_lid && phoneNumber !== '', // true if @lid was resolved to phone
          is_self: conv.is_self,
          contact_name: contact?.name || null,
          contact_id: contact?.id || null,
          contact_tags: contact?.tags || [],
          total_messages: conv.count,
          unread_count: unreadCount,
          last_message: lastMessage,
          last_message_at: conv.last_at,
        };
      })
    );

    return reply.send({
      success: true,
      data: enrichedConversations,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  });

  // ============================================
  // LID MAPPING ENDPOINTS (via API Key)
  // ============================================

  /**
   * List LID → Phone mappings for an instance
   * GET /api/v1/lid-mappings
   */
  fastify.get('/lid-mappings', {
    preHandler: [requireApiKeyPermission('contact:read')],
    schema: {
      description: 'List all LID → Phone Number mappings for your instances. Useful for resolving @lid JIDs to real phone numbers.',
      tags: ['External API - LID Mappings'],
      security: [{ apiKeyAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          instance_id: { type: 'string', format: 'uuid', description: 'Filter by instance ID' },
          lid_jid: { type: 'string', description: 'Filter by specific LID JID' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const query = request.query as { instance_id?: string; lid_jid?: string };

    // Get all instance IDs for this organization
    const instances = await prisma.whatsAppInstance.findMany({
      where: {
        organization_id: req.apiKey.organization_id,
        deleted_at: null,
        ...(query.instance_id ? { id: query.instance_id } : {}),
      },
      select: { id: true },
    });
    const instanceIds = instances.map(i => i.id);

    if (instanceIds.length === 0) {
      return reply.send({ success: true, data: [], meta: { total: 0 } });
    }

    const where: any = {
      instance_id: { in: instanceIds },
    };
    if (query.lid_jid) {
      where.lid_jid = query.lid_jid;
    }

    const mappings = await prisma.lidPhoneMapping.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });

    return reply.send({
      success: true,
      data: mappings.map(m => ({
        lid_jid: m.lid_jid,
        phone_jid: m.phone_jid,
        phone_number: m.phone_number,
        instance_id: m.instance_id,
        source: m.source,
        created_at: m.created_at,
        updated_at: m.updated_at,
      })),
      meta: { total: mappings.length },
    });
  });

  /**
   * Resolve a single LID JID to phone number
   * GET /api/v1/lid-mappings/resolve/:lid_jid
   */
  fastify.get('/lid-mappings/resolve/:lid_jid', {
    preHandler: [requireApiKeyPermission('contact:read')],
    schema: {
      description: 'Resolve a single @lid JID to a real phone number.',
      tags: ['External API - LID Mappings'],
      security: [{ apiKeyAuth: [] }],
      params: {
        type: 'object',
        required: ['lid_jid'],
        properties: {
          lid_jid: { type: 'string', description: 'The LID JID to resolve (e.g., 37224598995033@lid)' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          instance_id: { type: 'string', format: 'uuid', description: 'Instance ID (optional, searches all if omitted)' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const { lid_jid } = request.params as { lid_jid: string };
    const query = request.query as { instance_id?: string };

    // Get applicable instance IDs
    const instances = await prisma.whatsAppInstance.findMany({
      where: {
        organization_id: req.apiKey.organization_id,
        deleted_at: null,
        ...(query.instance_id ? { id: query.instance_id } : {}),
      },
      select: { id: true },
    });
    const instanceIds = instances.map(i => i.id);

    const mapping = await prisma.lidPhoneMapping.findFirst({
      where: {
        instance_id: { in: instanceIds },
        lid_jid: lid_jid,
      },
    });

    if (!mapping) {
      return reply.status(404).send({
        success: false,
        error: 'LID mapping not found. This LID has not been resolved to a phone number yet.',
      });
    }

    return reply.send({
      success: true,
      data: {
        lid_jid: mapping.lid_jid,
        phone_jid: mapping.phone_jid,
        phone_number: mapping.phone_number,
        instance_id: mapping.instance_id,
        source: mapping.source,
        resolved_at: mapping.created_at,
      },
    });
  });

  // ============================================
  // WEBHOOK CONFIG ENDPOINTS (via API Key)
  // ============================================

  /**
   * Get webhook configuration
   * GET /api/v1/webhook/config
   * Permission: webhook:read
   */
  fastify.get('/webhook/config', {
    preHandler: [requireApiKeyPermission('webhook:read')],
    schema: {
      description: 'Get webhook configurations for your instances',
      tags: ['External API - Webhook'],
      security: [{ apiKeyAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          instance_id: { type: 'string', format: 'uuid', description: 'Filter by instance ID' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const query = request.query as { instance_id?: string };

    const where: any = {
      organization_id: req.apiKey.organization_id,
      deleted_at: null,
      webhook_url: { not: null },
    };
    if (query.instance_id) where.id = query.instance_id;

    const instances = await prisma.whatsAppInstance.findMany({
      where,
      select: {
        id: true,
        name: true,
        webhook_url: true,
        webhook_events: true,
        is_active: true,
        created_at: true,
      },
    });

    const configs = instances.map((inst) => ({
      instance_id: inst.id,
      instance_name: inst.name,
      url: inst.webhook_url,
      events: inst.webhook_events as string[] || [],
      is_active: inst.is_active && !!inst.webhook_url,
      created_at: inst.created_at.toISOString(),
    }));

    return reply.send({ success: true, data: configs });
  });

  /**
   * Create/Update webhook configuration
   * PUT /api/v1/webhook/config
   * Permission: webhook:write
   */
  fastify.put('/webhook/config', {
    preHandler: [requireApiKeyPermission('webhook:write')],
    schema: {
      description: 'Create or update webhook configuration for an instance',
      tags: ['External API - Webhook'],
      security: [{ apiKeyAuth: [] }],
      body: {
        type: 'object',
        required: ['instance_id', 'url', 'events'],
        properties: {
          instance_id: { type: 'string', format: 'uuid', description: 'WhatsApp instance ID' },
          url: { type: 'string', format: 'uri', description: 'Webhook endpoint URL (must be HTTPS in production)' },
          events: {
            type: 'array',
            items: { type: 'string' },
            description: 'Events to subscribe to (e.g., message.received, connection.connected)',
          },
          secret: { type: 'string', description: 'Webhook secret for signature verification (optional)' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const body = request.body as { instance_id: string; url: string; events: string[]; secret?: string };

    // Verify instance belongs to org
    const instance = await prisma.whatsAppInstance.findFirst({
      where: { id: body.instance_id, organization_id: req.apiKey.organization_id, deleted_at: null },
    });
    if (!instance) {
      return reply.status(404).send({ success: false, error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found' } });
    }

    // Update webhook config
    const updated = await prisma.whatsAppInstance.update({
      where: { id: body.instance_id },
      data: {
        webhook_url: body.url,
        webhook_events: body.events,
        ...(body.secret && { webhook_secret: body.secret }),
      },
      select: { id: true, name: true, webhook_url: true, webhook_events: true, webhook_secret: true, is_active: true, created_at: true },
    });

    logger.info({ instanceId: body.instance_id, apiKeyId: req.apiKey.id }, 'External API: webhook config updated');

    return reply.send({
      success: true,
      data: {
        instance_id: updated.id,
        instance_name: updated.name,
        url: updated.webhook_url,
        events: updated.webhook_events as string[],
        has_secret: !!updated.webhook_secret,
        is_active: updated.is_active && !!updated.webhook_url,
        created_at: updated.created_at.toISOString(),
      },
    });
  });

  /**
   * Delete webhook configuration
   * DELETE /api/v1/webhook/config/:instanceId
   * Permission: webhook:write
   */
  fastify.delete('/webhook/config/:instanceId', {
    preHandler: [requireApiKeyPermission('webhook:write')],
    schema: {
      description: 'Remove webhook configuration from an instance',
      tags: ['External API - Webhook'],
      security: [{ apiKeyAuth: [] }],
      params: {
        type: 'object',
        required: ['instanceId'],
        properties: {
          instanceId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const { instanceId } = request.params as { instanceId: string };

    await webhookService.deleteWebhookConfig(req.apiKey.organization_id, instanceId);

    logger.info({ instanceId, apiKeyId: req.apiKey.id }, 'External API: webhook config deleted');
    return reply.send({ success: true, data: { message: 'Webhook configuration removed' } });
  });

  // ============================================
  // HEALTH & STORAGE ENDPOINTS
  // ============================================

  /**
   * Health check / verify API key
   * GET /api/v1/health
   * No specific permission required (just valid API key)
   */
  fastify.get('/health', {
    schema: {
      description: 'Verify API key and check API health',
      tags: ['External API - Health'],
      security: [{ apiKeyAuth: [] }],
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;

    return reply.send({
      success: true,
      data: {
        status: 'ok',
        api_key_id: req.apiKey.id,
        organization_id: req.apiKey.organization_id,
        permissions: req.apiKey.permissions,
        rate_limit: req.apiKey.rate_limit,
        timestamp: new Date().toISOString(),
      },
    });
  });

  // ============================================
  // AUTO-REPLY TOGGLE
  // ============================================

  /**
   * Get auto-reply settings for an instance
   * GET /api/v1/instances/:instanceId/auto-reply
   */
  fastify.get('/instances/:instanceId/auto-reply', {
    schema: {
      description: 'Get auto-reply settings for a WhatsApp instance',
      tags: ['Instances'],
      params: {
        type: 'object',
        properties: { instanceId: { type: 'string' } },
        required: ['instanceId'],
      },
    },
    handler: async (request, reply) => {
      const req = request as ApiKeyAuthenticatedRequest;
      const { instanceId } = req.params as { instanceId: string };

      const instance = await prisma.whatsAppInstance.findFirst({
        where: {
          id: instanceId,
          organization_id: req.apiKey.organization_id,
          deleted_at: null,
        },
        select: {
          id: true,
          name: true,
          auto_reply_enabled: true,
          auto_reply_max_per_hour: true,
        },
      });

      if (!instance) {
        return reply.status(404).send({
          success: false,
          error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found' },
        });
      }

      return reply.send({
        success: true,
        data: {
          instance_id: instance.id,
          instance_name: instance.name,
          auto_reply_enabled: instance.auto_reply_enabled,
          auto_reply_max_per_hour: instance.auto_reply_max_per_hour,
        },
      });
    },
  });

  /**
   * Update auto-reply settings for an instance
   * PATCH /api/v1/instances/:instanceId/auto-reply
   */
  fastify.patch('/instances/:instanceId/auto-reply', {
    schema: {
      description: 'Enable/disable auto-reply and configure rate limits for a WhatsApp instance',
      tags: ['Instances'],
      params: {
        type: 'object',
        properties: { instanceId: { type: 'string' } },
        required: ['instanceId'],
      },
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean', description: 'Enable or disable auto-reply' },
          max_per_hour: { type: 'integer', minimum: 1, maximum: 200, description: 'Maximum auto-replies per hour (1-200)' },
        },
        anyOf: [
          { required: ['enabled'] },
          { required: ['max_per_hour'] },
        ],
      },
    },
    handler: async (request, reply) => {
      const req = request as ApiKeyAuthenticatedRequest;
      const { instanceId } = req.params as { instanceId: string };
      const body = req.body as { enabled?: boolean; max_per_hour?: number };

      const instance = await prisma.whatsAppInstance.findFirst({
        where: {
          id: instanceId,
          organization_id: req.apiKey.organization_id,
          deleted_at: null,
        },
      });

      if (!instance) {
        return reply.status(404).send({
          success: false,
          error: { code: 'INSTANCE_NOT_FOUND', message: 'Instance not found' },
        });
      }

      const updateData: any = {};
      if (body.enabled !== undefined) updateData.auto_reply_enabled = body.enabled;
      if (body.max_per_hour !== undefined) updateData.auto_reply_max_per_hour = body.max_per_hour;

      const updated = await prisma.whatsAppInstance.update({
        where: { id: instanceId },
        data: updateData,
        select: {
          id: true,
          name: true,
          auto_reply_enabled: true,
          auto_reply_max_per_hour: true,
        },
      });

      return reply.send({
        success: true,
        data: {
          instance_id: updated.id,
          instance_name: updated.name,
          auto_reply_enabled: updated.auto_reply_enabled,
          auto_reply_max_per_hour: updated.auto_reply_max_per_hour,
        },
        message: `Auto-reply ${updated.auto_reply_enabled ? 'enabled' : 'disabled'} for instance ${updated.name}`,
      });
    },
  });

  // ============================================
  // HISTORY SYNC ENDPOINTS
  // ============================================

  // GET /api/instances/:instanceId/sync-history/status
  fastify.get<{ Params: { instanceId: string } }>('/api/instances/:instanceId/sync-history/status', {
    preHandler: [authenticateApiKey],
    handler: async (request, reply) => {
      const { instanceId } = request.params;
      const organizationId = (request as ApiKeyAuthenticatedRequest).apiKey.organization_id;

      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id: instanceId, organization_id: organizationId, deleted_at: null },
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
        return reply.status(404).send({ success: false, error: 'Instance not found' });
      }

      // Safety net: if instance is disconnected but DB still says SYNCING,
      // auto-correct to STOPPED (stale state from process crash or missed cleanup)
      let effectiveStatus = instance.history_sync_status;
      let effectiveProgress = instance.history_sync_progress;
      if (
        effectiveStatus === 'SYNCING' &&
        instance.status !== 'CONNECTED'
      ) {
        const progress = (instance.history_sync_progress as any) || {};
        progress.stopped_at = new Date().toISOString();
        progress.stopped_reason = 'stale_auto_corrected';
        effectiveStatus = 'STOPPED';
        effectiveProgress = progress;

        // Fix DB in background (fire-and-forget)
        prisma.whatsAppInstance.update({
          where: { id: instanceId },
          data: {
            history_sync_status: 'STOPPED',
            history_sync_progress: progress,
          },
        }).catch((err: unknown) => {
          request.log.warn({ err, instanceId }, 'Failed to auto-correct stale sync status');
        });
      }

      // Detect if instance needs re-pair
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
          settings: {
            sync_history_on_connect: instance.sync_history_on_connect,
          },
          last_sync_at: instance.last_history_sync_at,
          needs_repair: needsRepair,
        },
      });
    },
  });

  // PATCH /api/instances/:instanceId/sync-history/settings
  fastify.patch<{
    Params: { instanceId: string };
    Body: { sync_history_on_connect?: boolean };
  }>('/api/instances/:instanceId/sync-history/settings', {
    preHandler: [authenticateApiKey],
    handler: async (request, reply) => {
      const { instanceId } = request.params;
      const organizationId = (request as ApiKeyAuthenticatedRequest).apiKey.organization_id;
      const body = request.body || {};

      // Validate instance belongs to org
      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id: instanceId, organization_id: organizationId, deleted_at: null },
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
        return reply.status(404).send({ success: false, error: 'Instance not found' });
      }

      // Check plan allows sync
      const plan = instance.organization?.subscription_plan;
      if (plan && !plan.allow_history_sync && body.sync_history_on_connect === true) {
        return reply.status(403).send({
          success: false,
          error: 'Your subscription plan does not allow history sync. Upgrade to enable this feature.',
        });
      }

      const updateData: any = {};
      if (body.sync_history_on_connect !== undefined) {
        updateData.sync_history_on_connect = body.sync_history_on_connect;
      }

      const updated = await prisma.whatsAppInstance.update({
        where: { id: instanceId },
        data: updateData,
        select: {
          id: true,
          sync_history_on_connect: true,
          status: true,
        },
      });

      // Invalidate sync config cache
      const { invalidateSyncConfigCache } = await import('../whatsapp/baileys.service');
      invalidateSyncConfigCache(instanceId);

      const warning = updated.status === 'CONNECTED'
        ? 'History sync hanya terjadi saat initial pairing (scan QR pertama). Untuk sync ulang, gunakan endpoint re-pair.'
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

  // POST /api/instances/:instanceId/sync-history/re-pair
  fastify.post<{ Params: { instanceId: string } }>('/api/instances/:instanceId/sync-history/re-pair', {
    preHandler: [authenticateApiKey],
    handler: async (request, reply) => {
      const { instanceId } = request.params;
      const organizationId = (request as ApiKeyAuthenticatedRequest).apiKey.organization_id;

      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id: instanceId, organization_id: organizationId, deleted_at: null },
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
        return reply.status(404).send({ success: false, error: 'Instance not found' });
      }

      // Check plan
      const plan = instance.organization?.subscription_plan;
      if (plan && !plan.allow_history_sync) {
        return reply.status(403).send({
          success: false,
          error: 'Your subscription plan does not allow history sync.',
        });
      }

      // Block if currently syncing
      if (instance.history_sync_status === 'SYNCING') {
        return reply.status(409).send({
          success: false,
          error: 'History sync is currently in progress. Wait for it to complete before re-pairing.',
        });
      }

      // Enable sync and disconnect (logout + delete session)
      await prisma.whatsAppInstance.update({
        where: { id: instanceId },
        data: {
          sync_history_on_connect: true,
          history_sync_status: 'IDLE',
          history_sync_progress: Prisma.DbNull,
        },
      });

      // Invalidate cache
      const { invalidateSyncConfigCache, disconnectInstance } = await import('../whatsapp/baileys.service');
      invalidateSyncConfigCache(instanceId);

      // Disconnect (this calls socket.logout() which deletes the session)
      await disconnectInstance(instanceId);

      return reply.send({
        success: true,
        message: 'Instance logged out. Scan QR to reconnect — history sync will start automatically.',
        data: {
          status: 'DISCONNECTED',
          note: 'Connect ulang via POST /instances/:id/connect kemudian scan QR baru',
        },
      });
    },
  });

  // ============================================
  // SYNC CONTROL — Stop / Resume (External API)
  // ============================================

  /**
   * Control history sync: stop or resume
   * POST /api/instances/:instanceId/sync-history/control
   */
  fastify.route<{
    Params: { instanceId: string };
    Body: { action: 'stop' | 'resume' };
  }>({
    method: 'POST',
    url: '/api/instances/:instanceId/sync-history/control',
    preHandler: [authenticateApiKey],
    schema: {
      params: { type: 'object', properties: { instanceId: { type: 'string', format: 'uuid' } }, required: ['instanceId'] },
      body: {
        type: 'object',
        properties: { action: { type: 'string', enum: ['stop', 'resume'] } },
        required: ['action'],
      },
    },
    handler: async (request, reply) => {
      const { instanceId } = request.params;
      const { action } = request.body;
      const req = request as ApiKeyAuthenticatedRequest;

      // Verify ownership
      const instance = await prisma.whatsAppInstance.findFirst({
        where: { id: instanceId, organization_id: req.apiKey.organization_id },
        select: { id: true, history_sync_status: true },
      });

      if (!instance) {
        return reply.status(404).send({ success: false, error: 'Instance not found' });
      }

      const { stopHistorySync, resumeHistorySync } = await import('../whatsapp/baileys.service');

      if (action === 'stop') {
        // Allow stopping from any state except already STOPPED (consistent with internal API)
        if (instance.history_sync_status === 'STOPPED') {
          return reply.send({
            success: true,
            message: 'History sync is already stopped.',
            data: { status: 'STOPPED' },
          });
        }

        await stopHistorySync(instanceId);
        return reply.send({
          success: true,
          message: 'History sync stopped successfully.',
          data: { status: 'STOPPED' },
        });
      }

      if (action === 'resume') {
        // Allow resuming from STOPPED or PARTIAL state (consistent with internal API)
        if (instance.history_sync_status === 'SYNCING') {
          return reply.send({
            success: true,
            message: 'History sync is already running.',
            data: { status: 'SYNCING' },
          });
        }

        await resumeHistorySync(instanceId);
        return reply.send({
          success: true,
          message: 'History sync resumed. Incoming batches will be processed again.',
          data: { status: 'SYNCING' },
        });
      }

      return reply.status(400).send({ success: false, error: 'Invalid action. Use "stop" or "resume".' });
    },
  });
}
