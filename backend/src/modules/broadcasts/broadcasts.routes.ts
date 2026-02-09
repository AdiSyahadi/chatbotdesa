/**
 * Broadcasts Module - API Routes
 * @module broadcasts/routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { broadcastService } from './broadcasts.service';
import {
  createBroadcastSchema,
  updateBroadcastSchema,
  addRecipientsSchema,
  addRecipientsFromContactsSchema,
  addRecipientsFromTagsSchema,
  listBroadcastsQuerySchema,
  broadcastIdParamSchema,
  listRecipientsQuerySchema,
  CreateBroadcastInput,
  UpdateBroadcastInput,
  AddRecipientsInput,
  AddRecipientsFromContactsInput,
  AddRecipientsFromTagsInput,
  ListBroadcastsQuery,
  BroadcastIdParam,
  ListRecipientsQuery,
} from './broadcasts.schema';
import logger from '../../config/logger';

// ============================================
// ERROR HANDLING
// ============================================

const errorCodeMap: Record<string, { statusCode: number; code: string; message: string }> = {
  BROADCAST_NOT_FOUND: {
    statusCode: 404,
    code: 'BROADCAST_001',
    message: 'Broadcast not found',
  },
  BROADCAST_NOT_EDITABLE: {
    statusCode: 400,
    code: 'BROADCAST_002',
    message: 'Broadcast cannot be edited. Only DRAFT or SCHEDULED broadcasts can be modified.',
  },
  BROADCAST_CANNOT_DELETE: {
    statusCode: 400,
    code: 'BROADCAST_003',
    message: 'Running broadcasts cannot be deleted. Pause or cancel first.',
  },
  BROADCAST_CANNOT_START: {
    statusCode: 400,
    code: 'BROADCAST_004',
    message: 'Broadcast cannot be started. It may already be running or completed.',
  },
  BROADCAST_NO_RECIPIENTS: {
    statusCode: 400,
    code: 'BROADCAST_005',
    message: 'Broadcast has no recipients. Add recipients before starting.',
  },
  BROADCAST_NOT_RUNNING: {
    statusCode: 400,
    code: 'BROADCAST_006',
    message: 'Broadcast is not currently running.',
  },
  BROADCAST_CANNOT_CANCEL: {
    statusCode: 400,
    code: 'BROADCAST_007',
    message: 'Broadcast cannot be cancelled in its current state.',
  },
  INSTANCE_NOT_FOUND: {
    statusCode: 404,
    code: 'BROADCAST_008',
    message: 'WhatsApp instance not found',
  },
  INSTANCE_NOT_CONNECTED: {
    statusCode: 400,
    code: 'BROADCAST_009',
    message: 'WhatsApp instance is not connected. Connect the instance first.',
  },
};

function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof Error) {
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

  logger.error({ err: error }, 'Broadcasts module error');
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

export async function broadcastsRoutes(fastify: FastifyInstance) {
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
  // LIST BROADCASTS
  // =====================
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const query = listBroadcastsQuerySchema.parse(request.query);

      const result = await broadcastService.listBroadcasts(
        user.organizationId,
        query
      );

      return reply.send({
        success: true,
        data: result.broadcasts,
        pagination: result.pagination,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // GET SINGLE BROADCAST
  // =====================
  fastify.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = broadcastIdParamSchema.parse(request.params);

      const broadcast = await broadcastService.getBroadcastById(
        params.id,
        user.organizationId
      );

      if (!broadcast) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'BROADCAST_001',
            message: 'Broadcast not found',
          },
        });
      }

      return reply.send({
        success: true,
        data: broadcast,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // CREATE BROADCAST
  // =====================
  fastify.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const body = createBroadcastSchema.parse(request.body);

      const broadcast = await broadcastService.createBroadcast(
        user.organizationId,
        body
      );

      return reply.status(201).send({
        success: true,
        data: broadcast,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // UPDATE BROADCAST
  // =====================
  fastify.patch('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = broadcastIdParamSchema.parse(request.params);
      const body = updateBroadcastSchema.parse(request.body);

      const broadcast = await broadcastService.updateBroadcast(
        params.id,
        user.organizationId,
        body
      );

      return reply.send({
        success: true,
        data: broadcast,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // DELETE BROADCAST
  // =====================
  fastify.delete('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = broadcastIdParamSchema.parse(request.params);

      await broadcastService.deleteBroadcast(params.id, user.organizationId);

      return reply.send({
        success: true,
        data: { message: 'Broadcast deleted successfully' },
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // GET BROADCAST STATS
  // =====================
  fastify.get('/:id/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = broadcastIdParamSchema.parse(request.params);

      const stats = await broadcastService.getBroadcastStats(
        params.id,
        user.organizationId
      );

      return reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // LIST RECIPIENTS
  // =====================
  fastify.get('/:id/recipients', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = broadcastIdParamSchema.parse(request.params);
      const query = listRecipientsQuerySchema.parse(request.query);

      const result = await broadcastService.listRecipients(
        params.id,
        user.organizationId,
        query
      );

      return reply.send({
        success: true,
        data: result.recipients,
        pagination: result.pagination,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // ADD RECIPIENTS MANUALLY
  // =====================
  fastify.post('/:id/recipients', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = broadcastIdParamSchema.parse(request.params);
      const body = addRecipientsSchema.parse(request.body);

      const result = await broadcastService.addRecipients(
        params.id,
        user.organizationId,
        body
      );

      return reply.status(201).send({
        success: true,
        data: result,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // ADD RECIPIENTS FROM CONTACTS
  // =====================
  fastify.post('/:id/recipients/from-contacts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = broadcastIdParamSchema.parse(request.params);
      const body = addRecipientsFromContactsSchema.parse(request.body);

      const result = await broadcastService.addRecipientsFromContactsPublic(
        params.id,
        user.organizationId,
        body
      );

      return reply.status(201).send({
        success: true,
        data: result,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // ADD RECIPIENTS FROM TAGS
  // =====================
  fastify.post('/:id/recipients/from-tags', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = broadcastIdParamSchema.parse(request.params);
      const body = addRecipientsFromTagsSchema.parse(request.body);

      const result = await broadcastService.addRecipientsFromTagsPublic(
        params.id,
        user.organizationId,
        body
      );

      return reply.status(201).send({
        success: true,
        data: result,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // REMOVE RECIPIENT
  // =====================
  fastify.delete('/:id/recipients/:recipientId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = request.params as { id: string; recipientId: string };
      
      broadcastIdParamSchema.parse({ id: params.id });

      await broadcastService.removeRecipient(
        params.id,
        params.recipientId,
        user.organizationId
      );

      return reply.send({
        success: true,
        data: { message: 'Recipient removed successfully' },
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // CLEAR ALL RECIPIENTS
  // =====================
  fastify.delete('/:id/recipients', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = broadcastIdParamSchema.parse(request.params);

      await broadcastService.clearRecipients(
        params.id,
        user.organizationId
      );

      return reply.send({
        success: true,
        data: { message: 'All recipients cleared' },
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // START BROADCAST
  // =====================
  fastify.post('/:id/start', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = broadcastIdParamSchema.parse(request.params);

      const broadcast = await broadcastService.startBroadcast(
        params.id,
        user.organizationId
      );

      return reply.send({
        success: true,
        data: broadcast,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // PAUSE BROADCAST
  // =====================
  fastify.post('/:id/pause', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = broadcastIdParamSchema.parse(request.params);

      const broadcast = await broadcastService.pauseBroadcast(
        params.id,
        user.organizationId
      );

      return reply.send({
        success: true,
        data: broadcast,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // RESUME BROADCAST
  // =====================
  fastify.post('/:id/resume', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = broadcastIdParamSchema.parse(request.params);

      const broadcast = await broadcastService.resumeBroadcast(
        params.id,
        user.organizationId
      );

      return reply.send({
        success: true,
        data: broadcast,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // CANCEL BROADCAST
  // =====================
  fastify.post('/:id/cancel', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const params = broadcastIdParamSchema.parse(request.params);

      const broadcast = await broadcastService.cancelBroadcast(
        params.id,
        user.organizationId
      );

      return reply.send({
        success: true,
        data: broadcast,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });
}

export default broadcastsRoutes;
