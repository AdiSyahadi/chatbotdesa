/**
 * API Keys Module - Routes
 * @module api-keys/routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createApiKeyService, ApiKeyService } from './api-keys.service';
import {
  createApiKeySchema,
  CreateApiKeyInput,
  updateApiKeySchema,
  UpdateApiKeyInput,
  listApiKeysQuerySchema,
  ListApiKeysQuery,
  API_KEY_PERMISSIONS,
} from './api-keys.schema';
import { AppError } from '../../types';
import logger from '../../config/logger';
import { requireRole } from '../../middleware/rbac';
import { UserRole } from '@prisma/client';

// ============================================
// ROUTE HANDLER
// ============================================

export async function apiKeyRoutes(fastify: FastifyInstance) {
  const apiKeyService = createApiKeyService(fastify);

  // ============================================
  // API KEY CRUD
  // ============================================

  /**
   * POST /api-keys - Create new API key
   */
  fastify.post<{
    Body: CreateApiKeyInput;
  }>(
    '/',
    {
      preHandler: [fastify.authenticate, requireRole(UserRole.ORG_OWNER, UserRole.ORG_ADMIN)],
      schema: {
        description: 'Create a new API key',
        tags: ['API Keys'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            permissions: {
              type: 'array',
              items: { type: 'string', enum: API_KEY_PERMISSIONS as unknown as string[] },
              minItems: 1,
            },
            rate_limit: { type: 'number', minimum: 10, maximum: 10000, default: 1000 },
            expires_at: { type: 'string', format: 'date-time' },
          },
          required: ['name', 'permissions'],
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  key_prefix: { type: 'string' },
                  api_key: { type: 'string' },
                  permissions: { type: 'array', items: { type: 'string' } },
                  rate_limit: { type: 'number' },
                  is_active: { type: 'boolean' },
                  expires_at: { type: 'string', nullable: true },
                  created_at: { type: 'string' },
                },
              },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as { organizationId: string };
      const input = createApiKeySchema.parse(request.body);

      const apiKey = await apiKeyService.createApiKey(user.organizationId, input);

      logger.info(
        { apiKeyId: apiKey.id, organizationId: user.organizationId },
        'API key created'
      );

      return reply.status(201).send({
        success: true,
        data: apiKey,
        message: 'API key created successfully. Please save the api_key value - it will only be shown once!',
      });
    }
  );

  /**
   * GET /api-keys - List API keys
   */
  fastify.get<{
    Querystring: ListApiKeysQuery;
  }>(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'List all API keys for the organization',
        tags: ['API Keys'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 20, maximum: 100 },
            is_active: { type: 'string', enum: ['true', 'false'] },
            search: { type: 'string', maxLength: 100 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'array' },
              pagination: {
                type: 'object',
                properties: {
                  total: { type: 'number' },
                  page: { type: 'number' },
                  limit: { type: 'number' },
                  total_pages: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as { organizationId: string };
      const query = listApiKeysQuerySchema.parse(request.query);

      const result = await apiKeyService.listApiKeys(user.organizationId, query);

      return {
        success: true,
        ...result,
      };
    }
  );

  /**
   * GET /api-keys/:id - Get API key by ID
   */
  fastify.get<{
    Params: { id: string };
  }>(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Get API key details by ID',
        tags: ['API Keys'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user as { organizationId: string };

      const apiKey = await apiKeyService.getApiKey(user.organizationId, id);

      return {
        success: true,
        data: apiKey,
      };
    }
  );

  /**
   * PUT /api-keys/:id - Update API key
   */
  fastify.put<{
    Params: { id: string };
    Body: UpdateApiKeyInput;
  }>(
    '/:id',
    {
      preHandler: [fastify.authenticate, requireRole(UserRole.ORG_OWNER, UserRole.ORG_ADMIN)],
      schema: {
        description: 'Update API key settings',
        tags: ['API Keys'],
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
            name: { type: 'string', minLength: 1, maxLength: 255 },
            permissions: {
              type: 'array',
              items: { type: 'string', enum: API_KEY_PERMISSIONS as unknown as string[] },
              minItems: 1,
            },
            rate_limit: { type: 'number', minimum: 10, maximum: 10000 },
            is_active: { type: 'boolean' },
            expires_at: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user as { organizationId: string };
      const input = updateApiKeySchema.parse(request.body);

      const apiKey = await apiKeyService.updateApiKey(user.organizationId, id, input);

      return {
        success: true,
        data: apiKey,
      };
    }
  );

  /**
   * DELETE /api-keys/:id - Delete (revoke) API key
   */
  fastify.delete<{
    Params: { id: string };
  }>(
    '/:id',
    {
      preHandler: [fastify.authenticate, requireRole(UserRole.ORG_OWNER, UserRole.ORG_ADMIN)],
      schema: {
        description: 'Delete (revoke) an API key',
        tags: ['API Keys'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user as { organizationId: string };

      await apiKeyService.deleteApiKey(user.organizationId, id);

      return {
        success: true,
        message: 'API key deleted successfully',
      };
    }
  );

  /**
   * POST /api-keys/:id/regenerate - Regenerate API key
   */
  fastify.post<{
    Params: { id: string };
  }>(
    '/:id/regenerate',
    {
      preHandler: [fastify.authenticate, requireRole(UserRole.ORG_OWNER, UserRole.ORG_ADMIN)],
      schema: {
        description: 'Regenerate API key (creates new key, invalidates old one)',
        tags: ['API Keys'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  key_prefix: { type: 'string' },
                  api_key: { type: 'string' },
                  permissions: { type: 'array', items: { type: 'string' } },
                },
              },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const user = request.user as { organizationId: string };

      const apiKey = await apiKeyService.regenerateApiKey(user.organizationId, id);

      return {
        success: true,
        data: apiKey,
        message: 'API key regenerated successfully. Please save the new api_key value - it will only be shown once!',
      };
    }
  );

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * GET /api-keys/stats - Get API key statistics
   */
  fastify.get(
    '/stats',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Get API key statistics for the organization',
        tags: ['API Keys'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  total: { type: 'number' },
                  active: { type: 'number' },
                  inactive: { type: 'number' },
                  expired: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user as { organizationId: string };

      const stats = await apiKeyService.getApiKeyStats(user.organizationId);

      return {
        success: true,
        data: stats,
      };
    }
  );

  /**
   * GET /api-keys/permissions - Get available permissions
   */
  fastify.get(
    '/permissions',
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: 'Get list of available API key permissions',
        tags: ['API Keys'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      return {
        success: true,
        data: API_KEY_PERMISSIONS,
      };
    }
  );
}

export default apiKeyRoutes;
