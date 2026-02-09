/**
 * Tags Module - API Routes
 * @module tags/routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { tagService } from './tags.service';
import {
  createTagSchema,
  updateTagSchema,
  listTagsQuerySchema,
  tagIdParamSchema,
  assignTagSchema,
  removeTagSchema,
  bulkTagOperationSchema,
  mergeTagsSchema,
  CreateTagInput,
  UpdateTagInput,
  ListTagsQuery,
  TagIdParam,
  AssignTagInput,
  RemoveTagInput,
  BulkTagOperationInput,
  MergeTagsInput,
} from './tags.schema';
import logger from '../../config/logger';

// ============================================
// ERROR HANDLING
// ============================================

const errorCodeMap: Record<string, { statusCode: number; code: string; message: string }> = {
  TAG_NOT_FOUND: {
    statusCode: 404,
    code: 'TAG_001',
    message: 'Tag not found',
  },
  TAG_EXISTS: {
    statusCode: 409,
    code: 'TAG_002',
    message: 'Tag with this name already exists',
  },
};

function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof Error) {
    // Check for specific error messages
    if (error.message.includes('already exists')) {
      return reply.status(409).send({
        success: false,
        error: {
          code: 'TAG_002',
          message: error.message,
        },
      });
    }

    const mappedError = errorCodeMap[error.message];
    if (mappedError) {
      return reply.status(mappedError.statusCode).send({
        success: false,
        error: {
          code: mappedError.code,
          message: mappedError.message,
        },
      });
    }
  }

  logger.error({ err: error }, 'Tags module error');
  return reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}

// ============================================
// ROUTES REGISTRATION
// ============================================

export async function tagsRoutes(fastify: FastifyInstance) {
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
  // CREATE TAG
  // =====================
  fastify.post('/', {
    schema: {
      summary: 'Create a new tag',
      tags: ['Tags'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Tag name' },
          color: { type: 'string', description: 'Hex color code (e.g., #FF5733)' },
          description: { type: 'string', description: 'Tag description' },
        },
      },
      response: {
        201: {
          description: 'Tag created successfully',
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
      const input = createTagSchema.parse(request.body);

      const tag = await tagService.createTag(user.organizationId, input);

      return reply.status(201).send({
        success: true,
        data: tag,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // LIST TAGS
  // =====================
  fastify.get('/', {
    schema: {
      summary: 'List all tags',
      tags: ['Tags'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Search in name or description' },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          sort_by: { type: 'string', enum: ['name', 'contact_count', 'created_at', 'updated_at'], default: 'name' },
          sort_order: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
        },
      },
      response: {
        200: {
          description: 'List of tags',
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
      const query = listTagsQuerySchema.parse(request.query);

      const result = await tagService.listTags(user.organizationId, query);

      return reply.send({
        success: true,
        data: result.items,
        pagination: result.pagination,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // GET ALL TAGS (for dropdowns)
  // =====================
  fastify.get('/all', {
    schema: {
      summary: 'Get all tags without pagination',
      tags: ['Tags'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          description: 'All tags',
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

      const tags = await tagService.getAllTags(user.organizationId);

      return reply.send({
        success: true,
        data: tags,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // GET TAG STATISTICS
  // =====================
  fastify.get('/stats', {
    schema: {
      summary: 'Get tag statistics',
      tags: ['Tags'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          description: 'Tag statistics',
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

      const stats = await tagService.getTagStats(user.organizationId);

      return reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // GET AVAILABLE COLORS
  // =====================
  fastify.get('/colors', {
    schema: {
      summary: 'Get available tag colors',
      tags: ['Tags'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          description: 'Available colors',
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
      data: tagService.getAvailableColors(),
    });
  });

  // =====================
  // BULK TAG OPERATION
  // =====================
  fastify.post('/bulk', {
    schema: {
      summary: 'Bulk add or remove tags from contacts',
      tags: ['Tags'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['tag_ids', 'contact_ids', 'operation'],
        properties: {
          tag_ids: { type: 'array', items: { type: 'string' }, description: 'Tag IDs' },
          contact_ids: { type: 'array', items: { type: 'string' }, description: 'Contact IDs' },
          operation: { type: 'string', enum: ['add', 'remove'], description: 'Operation to perform' },
        },
      },
      response: {
        200: {
          description: 'Bulk operation result',
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
      const input = bulkTagOperationSchema.parse(request.body);

      const result = await tagService.bulkTagOperation(user.organizationId, input);

      return reply.send({
        success: result.success,
        data: result,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // MERGE TAGS
  // =====================
  fastify.post('/merge', {
    schema: {
      summary: 'Merge multiple tags into one',
      tags: ['Tags'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['source_tag_ids', 'target_tag_id'],
        properties: {
          source_tag_ids: { type: 'array', items: { type: 'string' }, description: 'Source tag IDs to merge' },
          target_tag_id: { type: 'string', description: 'Target tag ID' },
          delete_source: { type: 'boolean', default: true, description: 'Delete source tags after merge' },
        },
      },
      response: {
        200: {
          description: 'Merge result',
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
      const input = mergeTagsSchema.parse(request.body);

      const result = await tagService.mergeTags(user.organizationId, input);

      return reply.send({
        success: result.success,
        data: result,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // GET TAG BY ID
  // =====================
  fastify.get('/:id', {
    schema: {
      summary: 'Get tag by ID',
      tags: ['Tags'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Tag ID' },
        },
      },
      response: {
        200: {
          description: 'Tag details',
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
      const { id } = tagIdParamSchema.parse(request.params);

      const tag = await tagService.getTag(user.organizationId, id);

      if (!tag) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'TAG_001',
            message: 'Tag not found',
          },
        });
      }

      return reply.send({
        success: true,
        data: tag,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // UPDATE TAG
  // =====================
  fastify.put('/:id', {
    schema: {
      summary: 'Update a tag',
      tags: ['Tags'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Tag ID' },
        },
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          color: { type: 'string' },
          description: { type: ['string', 'null'] },
        },
      },
      response: {
        200: {
          description: 'Tag updated successfully',
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
      const { id } = tagIdParamSchema.parse(request.params);
      const input = updateTagSchema.parse(request.body);

      const tag = await tagService.updateTag(user.organizationId, id, input);

      if (!tag) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'TAG_001',
            message: 'Tag not found',
          },
        });
      }

      return reply.send({
        success: true,
        data: tag,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // DELETE TAG
  // =====================
  fastify.delete('/:id', {
    schema: {
      summary: 'Delete a tag',
      tags: ['Tags'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Tag ID' },
        },
      },
      response: {
        200: {
          description: 'Tag deleted successfully',
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
      const { id } = tagIdParamSchema.parse(request.params);

      const deleted = await tagService.deleteTag(user.organizationId, id);

      if (!deleted) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'TAG_001',
            message: 'Tag not found',
          },
        });
      }

      return reply.send({
        success: true,
        message: 'Tag deleted successfully',
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // ASSIGN TAG TO CONTACTS
  // =====================
  fastify.post('/:id/assign', {
    schema: {
      summary: 'Assign tag to contacts',
      tags: ['Tags'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Tag ID' },
        },
      },
      body: {
        type: 'object',
        required: ['contact_ids'],
        properties: {
          contact_ids: { type: 'array', items: { type: 'string' }, description: 'Contact IDs to assign tag to' },
        },
      },
      response: {
        200: {
          description: 'Assignment result',
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
      const { id } = tagIdParamSchema.parse(request.params);
      const input = assignTagSchema.parse(request.body);

      const result = await tagService.assignTagToContacts(user.organizationId, id, input);

      return reply.send({
        success: result.success,
        data: result,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // REMOVE TAG FROM CONTACTS
  // =====================
  fastify.post('/:id/remove', {
    schema: {
      summary: 'Remove tag from contacts',
      tags: ['Tags'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Tag ID' },
        },
      },
      body: {
        type: 'object',
        required: ['contact_ids'],
        properties: {
          contact_ids: { type: 'array', items: { type: 'string' }, description: 'Contact IDs to remove tag from' },
        },
      },
      response: {
        200: {
          description: 'Removal result',
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
      const { id } = tagIdParamSchema.parse(request.params);
      const input = removeTagSchema.parse(request.body);

      const result = await tagService.removeTagFromContacts(user.organizationId, id, input);

      return reply.send({
        success: result.success,
        data: result,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // GET CONTACTS WITH TAG
  // =====================
  fastify.get('/:id/contacts', {
    schema: {
      summary: 'Get contacts with a specific tag',
      tags: ['Tags'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Tag ID' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
      response: {
        200: {
          description: 'Contacts with tag',
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
      const { id } = tagIdParamSchema.parse(request.params);
      const query = request.query as { page?: number; limit?: number };

      const result = await tagService.getContactsByTag(
        user.organizationId,
        id,
        query.page || 1,
        query.limit || 20
      );

      return reply.send({
        success: true,
        data: result.contacts,
        pagination: result.pagination,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });
}

export default tagsRoutes;
