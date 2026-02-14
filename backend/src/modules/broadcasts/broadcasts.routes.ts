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
import { AppError } from '../../types';

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
      throw error;
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
        throw new AppError('Broadcast not found', 404, 'BROADCAST_001');
      }

      return reply.send({
        success: true,
        data: broadcast,
      });
    } catch (error) {
      throw error;
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
      throw error;
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
      throw error;
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
      throw error;
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
      throw error;
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
      throw error;
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
      throw error;
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
      throw error;
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
      throw error;
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
      throw error;
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
      throw error;
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
      throw error;
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
      throw error;
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
      throw error;
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
      throw error;
    }
  });
}

export default broadcastsRoutes;
