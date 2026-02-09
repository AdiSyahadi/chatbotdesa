/**
 * Webhooks Module - Routes
 * Handles both webhook config CRUD and delivery history
 * @module webhooks/routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createWebhookService, WebhookService } from './webhooks.service';
import {
  configureWebhookSchema,
  ConfigureWebhookInput,
  listWebhooksQuerySchema,
  ListWebhooksQuery,
  getWebhookLogsQuerySchema,
  GetWebhookLogsQuery,
  WEBHOOK_EVENTS,
} from './webhooks.schema';
import { AppError } from '../../types';
import logger from '../../config/logger';

// ============================================
// ROUTE HANDLER
// ============================================

export async function webhookRoutes(fastify: FastifyInstance) {
  const webhookService = createWebhookService(fastify);

  // ============================================
  // WEBHOOK CONFIG CRUD (for frontend Webhooks page)
  // ============================================

  /**
   * GET /webhooks - List webhook configurations
   * Returns instances that have webhook_url configured
   */
  fastify.get(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'List all webhook configurations',
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            instance_id: { type: 'string' },
            instanceId: { type: 'string' },
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 20, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as { organizationId: string };
      const query = request.query as any;

      const result = await webhookService.listWebhookConfigs(user.organizationId, {
        instance_id: query.instance_id || query.instanceId,
        page: query.page ? Number(query.page) : 1,
        limit: query.limit ? Number(query.limit) : 20,
      });

      return {
        success: true,
        ...result,
      };
    }
  );

  /**
   * POST /webhooks - Create webhook config on an instance
   */
  fastify.post(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Create webhook configuration for an instance',
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['instance_id', 'url', 'events'],
          properties: {
            instance_id: { type: 'string', format: 'uuid' },
            url: { type: 'string' },
            events: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as { organizationId: string };
      const body = request.body as { instance_id: string; url: string; events: string[] };

      const result = await webhookService.createWebhookConfig(user.organizationId, body);

      return {
        success: true,
        data: result,
      };
    }
  );

  /**
   * PATCH /webhooks/:id - Update webhook config (id = instance_id)
   */
  fastify.patch<{
    Params: { id: string };
  }>(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Update webhook configuration',
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            events: { type: 'array', items: { type: 'string' } },
            is_active: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user as { organizationId: string };
      const body = request.body as { url?: string; events?: string[]; is_active?: boolean };

      const result = await webhookService.updateWebhookConfig(user.organizationId, id, body);

      return {
        success: true,
        data: result,
      };
    }
  );

  /**
   * DELETE /webhooks/:id - Delete webhook config (id = instance_id)
   */
  fastify.delete<{
    Params: { id: string };
  }>(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Delete webhook configuration',
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user as { organizationId: string };

      await webhookService.deleteWebhookConfig(user.organizationId, id);

      return {
        success: true,
        message: 'Webhook configuration deleted',
      };
    }
  );

  /**
   * POST /webhooks/:id/test - Test webhook for an instance (id = instance_id)
   */
  fastify.post<{
    Params: { id: string };
  }>(
    '/:id/test',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Test webhook configuration',
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user as { organizationId: string };

      const result = await webhookService.testWebhook(user.organizationId, id);

      return {
        success: true,
        data: result,
      };
    }
  );

  // ============================================
  // WEBHOOK CONFIGURATION (legacy API — backward compat)
  // ============================================

  /**
   * GET /webhooks/config/:instanceId - Get webhook configuration
   */
  fastify.get<{
    Params: { instanceId: string };
  }>(
    '/config/:instanceId',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Get webhook configuration for an instance',
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            instanceId: { type: 'string', format: 'uuid' },
          },
          required: ['instanceId'],
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params;
      const user = request.user as { organizationId: string };

      const config = await webhookService.getWebhookConfig(user.organizationId, instanceId);

      return {
        success: true,
        data: config,
      };
    }
  );

  /**
   * PUT /webhooks/config - Configure webhook for an instance
   */
  fastify.put<{
    Body: ConfigureWebhookInput;
  }>(
    '/config',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Configure webhook for an instance',
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            instance_id: { type: 'string', format: 'uuid' },
            webhook_url: { type: 'string', nullable: true },
            webhook_events: {
              type: 'array',
              items: { type: 'string' },
            },
            webhook_secret: { type: 'string', nullable: true },
          },
          required: ['instance_id'],
        },
      },
    },
    async (request, reply) => {
      const user = request.user as { organizationId: string };
      const input = configureWebhookSchema.parse(request.body);

      const config = await webhookService.configureWebhook(user.organizationId, input);

      logger.info(
        { instanceId: input.instance_id, organizationId: user.organizationId },
        'Webhook configured'
      );

      return {
        success: true,
        data: config,
      };
    }
  );

  /**
   * POST /webhooks/test/:instanceId - Test webhook (legacy path)
   */
  fastify.post<{
    Params: { instanceId: string };
  }>(
    '/test/:instanceId',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Test webhook configuration by sending a test event',
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            instanceId: { type: 'string', format: 'uuid' },
          },
          required: ['instanceId'],
        },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params;
      const user = request.user as { organizationId: string };

      const result = await webhookService.testWebhook(user.organizationId, instanceId);

      return {
        success: true,
        data: result,
      };
    }
  );

  // ============================================
  // WEBHOOK DELIVERY HISTORY
  // ============================================

  /**
   * GET /webhooks/history - List webhook delivery records
   */
  fastify.get<{
    Querystring: ListWebhooksQuery;
  }>(
    '/history',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'List webhook delivery records with pagination',
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            instance_id: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['PENDING', 'DELIVERED', 'FAILED', 'RETRYING'] },
            event_type: { type: 'string' },
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 20, maximum: 100 },
            start_date: { type: 'string', format: 'date-time' },
            end_date: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as { organizationId: string };
      const query = listWebhooksQuerySchema.parse(request.query);

      const result = await webhookService.listWebhooks(user.organizationId, query);

      return {
        success: true,
        ...result,
      };
    }
  );

  /**
   * GET /webhooks/history/:id - Get delivery record detail
   */
  fastify.get<{
    Params: { id: string };
  }>(
    '/history/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Get webhook delivery details by ID',
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user as { organizationId: string };

      const webhook = await webhookService.getWebhook(user.organizationId, id);

      return {
        success: true,
        data: webhook,
      };
    }
  );

  /**
   * GET /webhooks/history/:id/logs - Get delivery logs
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { page?: number; limit?: number };
  }>(
    '/history/:id/logs',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Get webhook delivery attempt logs',
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 20, maximum: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user as { organizationId: string };
      const query = getWebhookLogsQuerySchema.parse({
        webhook_id: id,
        ...request.query,
      });

      const result = await webhookService.getWebhookLogs(user.organizationId, query);

      return {
        success: true,
        ...result,
      };
    }
  );

  /**
   * POST /webhooks/history/:id/retry - Retry failed webhook
   */
  fastify.post<{
    Params: { id: string };
  }>(
    '/history/:id/retry',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Retry a failed webhook delivery',
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user as { organizationId: string };

      const result = await webhookService.retryWebhook(user.organizationId, id);

      return result;
    }
  );

  // ============================================
  // WEBHOOK STATISTICS & META
  // ============================================

  /**
   * GET /webhooks/stats - Get webhook statistics
   */
  fastify.get<{
    Querystring: { instance_id?: string };
  }>(
    '/stats',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Get webhook delivery statistics',
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            instance_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as { organizationId: string };
      const { instance_id } = request.query;

      const stats = await webhookService.getWebhookStats(user.organizationId, instance_id);

      return {
        success: true,
        data: stats,
      };
    }
  );

  /**
   * GET /webhooks/events - Get available webhook events
   */
  fastify.get(
    '/events',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Get list of available webhook event types',
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      return {
        success: true,
        data: WEBHOOK_EVENTS,
      };
    }
  );
}

export default webhookRoutes;
