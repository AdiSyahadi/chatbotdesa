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
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { contactService } from '../contacts/contacts.service';
import { listContactsQuerySchema, createContactSchema, updateContactSchema, contactIdParamSchema } from '../contacts/contacts.schema';
import { createWebhookService } from '../webhooks/webhooks.service';
import { getStorageStats } from '../../workers/media-cleanup.worker';
import prisma from '../../config/database';
import logger from '../../config/logger';

// ============================================
// RATE LIMIT HEADER HELPER
// ============================================

function addRateLimitHeaders(reply: FastifyReply, req: ApiKeyAuthenticatedRequest) {
  const rateLimit = req.apiKey.rate_limit || 1000;
  reply.header('X-RateLimit-Limit', rateLimit);
  reply.header('X-RateLimit-Remaining', Math.max(0, rateLimit - 1)); // Approximate
  reply.header('X-RateLimit-Reset', new Date(Date.now() + 60000).toISOString());
}

// ============================================
// EXTERNAL API ROUTES (API Key Auth)
// ============================================

export async function externalApiRoutes(fastify: FastifyInstance) {
  const whatsappService = new WhatsAppService(fastify);
  const webhookService = createWebhookService(fastify);

  // All routes require API Key authentication
  fastify.addHook('preHandler', authenticateApiKey);

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
        required: ['instance_id', 'to', 'message'],
        properties: {
          instance_id: { type: 'string', format: 'uuid', description: 'WhatsApp instance ID' },
          to: { type: 'string', description: 'Phone number (e.g., 628123456789)' },
          message: { type: 'string', maxLength: 4096, description: 'Text message content' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    const body = request.body as { instance_id: string; to: string; message: string };

    const result = await whatsappService.sendText(
      body.instance_id,
      req.apiKey.organization_id,
      { to: body.to, message: body.message, delay: 0 }
    );

    logger.info({ instanceId: body.instance_id, to: body.to, apiKeyId: req.apiKey.id }, 'External API: text message sent');
    addRateLimitHeaders(reply, req);
    return reply.send({ success: true, data: result });
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
    addRateLimitHeaders(reply, req);
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
    addRateLimitHeaders(reply, req);
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

    const page = query.page ? parseInt(query.page) : 1;
    const limit = query.limit ? parseInt(query.limit) : 20;
    const skip = (page - 1) * limit;

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

    // Time range filters
    if (query.since || query.until) {
      where.created_at = {};
      if (query.since) {
        const sinceDate = new Date(query.since);
        if (!isNaN(sinceDate.getTime())) where.created_at.gte = sinceDate;
      }
      if (query.until) {
        const untilDate = new Date(query.until);
        if (!isNaN(untilDate.getTime())) where.created_at.lte = untilDate;
      }
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
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

    // Add rate limit headers
    addRateLimitHeaders(reply, req);

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
    addRateLimitHeaders(reply, req);
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
    const page = query.page ? parseInt(query.page) : 1;
    const limit = query.limit ? parseInt(query.limit) : 20;
    const offset = (page - 1) * limit;
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

    // Get distinct conversations using raw query for reliability
    const allMessages = await prisma.message.findMany({
      where,
      select: {
        chat_jid: true,
        instance_id: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });

    // Group by chat_jid + instance_id
    const conversationMap = new Map<string, { chat_jid: string; instance_id: string; count: number; last_at: Date; is_lid: boolean; is_group: boolean; is_self: boolean }>();
    for (const msg of allMessages) {
      if (!msg.chat_jid) continue;

      const isLid = msg.chat_jid.endsWith('@lid');
      const isGroup = msg.chat_jid.endsWith('@g.us');
      const isSelf = instancePhones.has(msg.chat_jid);

      // Filter out @lid conversations unless include_lid=true
      if (isLid && !includeLid) continue;
      // Filter out self-chat unless include_self=true
      if (isSelf && !includeSelf) continue;

      const key = `${msg.chat_jid}__${msg.instance_id}`;
      if (!conversationMap.has(key)) {
        conversationMap.set(key, {
          chat_jid: msg.chat_jid,
          instance_id: msg.instance_id,
          count: 0,
          last_at: msg.created_at,
          is_lid: isLid,
          is_group: isGroup,
          is_self: isSelf,
        });
      }
      conversationMap.get(key)!.count++;
    }

    // Sort by last message time desc
    const conversations = Array.from(conversationMap.values())
      .sort((a, b) => b.last_at.getTime() - a.last_at.getTime());

    const total = conversations.length;
    const paginatedConversations = conversations.slice(offset, offset + limit);

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
        }
        // @lid has no phone number — leave it empty

        // Try to find contact
        const contact = await prisma.contact.findFirst({
          where: {
            organization_id: req.apiKey.organization_id,
            instance_id: conv.instance_id,
            jid: conv.chat_jid || undefined,
          },
          select: { id: true, name: true, phone_number: true, tags: true },
        });

        return {
          chat_jid: conv.chat_jid,
          instance_id: conv.instance_id,
          phone_number: phoneNumber,
          is_group: conv.is_group,
          is_lid: conv.is_lid,
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

    // Add rate limit headers
    addRateLimitHeaders(reply, req);

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
}
