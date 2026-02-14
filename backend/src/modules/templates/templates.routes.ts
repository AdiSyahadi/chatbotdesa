/**
 * Templates Module - API Routes
 * @module templates/routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { templateService } from './templates.service';
import {
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesQuerySchema,
  templateIdParamSchema,
  previewTemplateSchema,
  CreateTemplateInput,
  UpdateTemplateInput,
  ListTemplatesQuery,
  TemplateIdParam,
  PreviewTemplateInput,
  TEMPLATE_CATEGORIES,
  MESSAGE_TYPES,
} from './templates.schema';
import { AppError } from '../../types';

// ============================================
// ROUTES REGISTRATION
// ============================================

export async function templatesRoutes(fastify: FastifyInstance) {
  // All routes require authentication
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({
        success: false,
        error: {
          code: 'AUTH_001',
          message: 'Unauthorized',
        },
      });
    }
  });

  // =====================
  // CREATE TEMPLATE
  // =====================
  fastify.post('/', {
    schema: {
      summary: 'Create a new message template',
      tags: ['Templates'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'content'],
        properties: {
          name: { type: 'string', description: 'Template name' },
          category: { type: 'string', enum: [...TEMPLATE_CATEGORIES], description: 'Template category' },
          message_type: { type: 'string', enum: [...MESSAGE_TYPES], description: 'Message type' },
          content: { type: 'string', description: 'Template content (supports {{variable}} syntax)' },
          media_url: { type: 'string', description: 'Media URL for non-text templates' },
          caption: { type: 'string', description: 'Caption for media templates' },
        },
      },
      response: {
        201: {
          description: 'Template created successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const input = createTemplateSchema.parse(request.body);

      const template = await templateService.createTemplate(user.organizationId, input);

      return reply.status(201).send({
        success: true,
        data: template,
      });
    } catch (error) {
      throw error;
    }
  });

  // =====================
  // LIST TEMPLATES
  // =====================
  fastify.get('/', {
    schema: {
      summary: 'List message templates',
      tags: ['Templates'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Search in name or content' },
          category: { type: 'string', enum: [...TEMPLATE_CATEGORIES], description: 'Filter by category' },
          message_type: { type: 'string', enum: [...MESSAGE_TYPES], description: 'Filter by message type' },
          is_active: { type: 'string', enum: ['true', 'false'], description: 'Filter by active status' },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          sort_by: { type: 'string', enum: ['name', 'category', 'usage_count', 'created_at', 'updated_at'], default: 'created_at' },
          sort_order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
        },
      },
      response: {
        200: {
          description: 'List of templates',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: { type: 'object' } },
            pagination: { type: 'object' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const query = listTemplatesQuerySchema.parse(request.query);

      const result = await templateService.listTemplates(user.organizationId, query);

      return reply.send({
        success: true,
        data: result.items,
        pagination: result.pagination,
      });
    } catch (error) {
      throw error;
    }
  });

  // =====================
  // GET TEMPLATE STATISTICS
  // =====================
  fastify.get('/stats', {
    schema: {
      summary: 'Get template statistics',
      tags: ['Templates'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          description: 'Template statistics',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };

      const stats = await templateService.getTemplateStats(user.organizationId);

      return reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      throw error;
    }
  });

  // =====================
  // GET CATEGORIES LIST
  // =====================
  fastify.get('/categories', {
    schema: {
      summary: 'Get available template categories',
      tags: ['Templates'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          description: 'List of categories',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      data: TEMPLATE_CATEGORIES,
    });
  });

  // =====================
  // GET TEMPLATE BY ID
  // =====================
  fastify.get('/:id', {
    schema: {
      summary: 'Get template by ID',
      tags: ['Templates'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Template ID' },
        },
      },
      response: {
        200: {
          description: 'Template details',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const { id } = templateIdParamSchema.parse(request.params);

      const template = await templateService.getTemplate(user.organizationId, id);

      if (!template) {
        throw new AppError('Template not found', 404, 'TEMPLATE_001');
      }

      return reply.send({
        success: true,
        data: template,
      });
    } catch (error) {
      throw error;
    }
  });

  // =====================
  // UPDATE TEMPLATE
  // =====================
  fastify.put('/:id', {
    schema: {
      summary: 'Update a template',
      tags: ['Templates'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Template ID' },
        },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string', enum: [...TEMPLATE_CATEGORIES] },
          message_type: { type: 'string', enum: [...MESSAGE_TYPES] },
          content: { type: 'string' },
          media_url: { type: ['string', 'null'] },
          caption: { type: ['string', 'null'] },
          is_active: { type: 'boolean' },
        },
      },
      response: {
        200: {
          description: 'Template updated successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const { id } = templateIdParamSchema.parse(request.params);
      const input = updateTemplateSchema.parse(request.body);

      const template = await templateService.updateTemplate(user.organizationId, id, input);

      if (!template) {
        throw new AppError('Template not found', 404, 'TEMPLATE_001');
      }

      return reply.send({
        success: true,
        data: template,
      });
    } catch (error) {
      throw error;
    }
  });

  // =====================
  // DELETE TEMPLATE
  // =====================
  fastify.delete('/:id', {
    schema: {
      summary: 'Delete a template',
      tags: ['Templates'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Template ID' },
        },
      },
      response: {
        200: {
          description: 'Template deleted successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const { id } = templateIdParamSchema.parse(request.params);

      const deleted = await templateService.deleteTemplate(user.organizationId, id);

      if (!deleted) {
        throw new AppError('Template not found', 404, 'TEMPLATE_001');
      }

      return reply.send({
        success: true,
        message: 'Template deleted successfully',
      });
    } catch (error) {
      throw error;
    }
  });

  // =====================
  // PREVIEW TEMPLATE
  // =====================
  fastify.post('/:id/preview', {
    schema: {
      summary: 'Preview template with variable substitution',
      tags: ['Templates'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Template ID' },
        },
      },
      body: {
        type: 'object',
        properties: {
          variables: {
            type: 'object',
            additionalProperties: true,
            description: 'Variables to substitute in the template',
          },
        },
      },
      response: {
        200: {
          description: 'Template preview',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const { id } = templateIdParamSchema.parse(request.params);
      const input = previewTemplateSchema.parse(request.body);

      const preview = await templateService.previewTemplate(
        user.organizationId,
        id,
        input.variables || {}
      );

      if (!preview) {
        throw new AppError('Template not found', 404, 'TEMPLATE_001');
      }

      return reply.send({
        success: true,
        data: preview,
      });
    } catch (error) {
      throw error;
    }
  });

  // =====================
  // CLONE TEMPLATE
  // =====================
  fastify.post('/:id/clone', {
    schema: {
      summary: 'Clone an existing template',
      tags: ['Templates'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Template ID to clone' },
        },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'New template name (optional)' },
        },
      },
      response: {
        201: {
          description: 'Template cloned successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const { id } = templateIdParamSchema.parse(request.params);
      const body = request.body as { name?: string };

      const clone = await templateService.cloneTemplate(user.organizationId, id, body.name);

      if (!clone) {
        throw new AppError('Template not found', 404, 'TEMPLATE_001');
      }

      return reply.status(201).send({
        success: true,
        data: clone,
      });
    } catch (error) {
      throw error;
    }
  });

  // =====================
  // GET TEMPLATES BY CATEGORY
  // =====================
  fastify.get('/category/:category', {
    schema: {
      summary: 'Get templates by category',
      tags: ['Templates'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['category'],
        properties: {
          category: { type: 'string', enum: [...TEMPLATE_CATEGORIES], description: 'Template category' },
        },
      },
      response: {
        200: {
          description: 'Templates in category',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const { category } = request.params as { category: string };

      const templates = await templateService.getTemplatesByCategory(user.organizationId, category);

      return reply.send({
        success: true,
        data: templates,
      });
    } catch (error) {
      throw error;
    }
  });
}

export default templatesRoutes;
