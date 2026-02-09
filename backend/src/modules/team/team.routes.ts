/**
 * Team Module - API Routes
 * @module team/routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { teamService } from './team.service';
import {
  inviteTeamMemberSchema,
  acceptInvitationSchema,
  verifyInvitationSchema,
  updateMemberRoleSchema,
  listTeamMembersQuerySchema,
  listInvitationsQuerySchema,
  memberIdParamSchema,
  invitationIdParamSchema,
  InviteTeamMemberInput,
  AcceptInvitationInput,
  VerifyInvitationInput,
  UpdateMemberRoleInput,
  ListTeamMembersQuery,
  ListInvitationsQuery,
  MemberIdParam,
  InvitationIdParam,
  USER_ROLES,
  ROLE_DESCRIPTIONS,
} from './team.schema';
import logger from '../../config/logger';

// ============================================
// ERROR HANDLING
// ============================================

const errorCodeMap: Record<string, { statusCode: number; code: string; message: string }> = {
  MEMBER_NOT_FOUND: {
    statusCode: 404,
    code: 'TEAM_001',
    message: 'Team member not found',
  },
  INVITATION_NOT_FOUND: {
    statusCode: 404,
    code: 'TEAM_002',
    message: 'Invitation not found',
  },
  PERMISSION_DENIED: {
    statusCode: 403,
    code: 'TEAM_003',
    message: 'You do not have permission to perform this action',
  },
};

function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof Error) {
    // Check for specific error messages
    if (error.message.includes('already a member')) {
      return reply.status(409).send({
        success: false,
        error: {
          code: 'TEAM_004',
          message: error.message,
        },
      });
    }

    if (error.message.includes('already pending')) {
      return reply.status(409).send({
        success: false,
        error: {
          code: 'TEAM_005',
          message: error.message,
        },
      });
    }

    if (error.message.includes('Cannot')) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'TEAM_006',
          message: error.message,
        },
      });
    }

    if (error.message.includes('Invalid invitation') || error.message.includes('expired')) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'TEAM_007',
          message: error.message,
        },
      });
    }

    if (error.message.includes('already exists')) {
      return reply.status(409).send({
        success: false,
        error: {
          code: 'TEAM_008',
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

  logger.error({ err: error }, 'Team module error');
  return reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}

// ============================================
// ROLE CHECK MIDDLEWARE
// ============================================

function requireRole(allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { role: string };
    if (!allowedRoles.includes(user.role)) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'TEAM_003',
          message: 'You do not have permission to perform this action',
        },
      });
    }
  };
}

// ============================================
// ROUTES REGISTRATION
// ============================================

export async function teamRoutes(fastify: FastifyInstance) {
  // ============================================
  // PUBLIC ROUTES (No authentication required)
  // ============================================

  // =====================
  // VERIFY INVITATION TOKEN
  // =====================
  fastify.get('/invitations/verify', {
    schema: {
      summary: 'Verify an invitation token',
      tags: ['Team'],
      querystring: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'Invitation token' },
        },
      },
      response: {
        200: {
          description: 'Invitation verification result',
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
      const { token } = request.query as { token: string };

      const result = await teamService.verifyInvitation(token);

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // ACCEPT INVITATION
  // =====================
  fastify.post('/invitations/accept', {
    schema: {
      summary: 'Accept an invitation and create account',
      tags: ['Team'],
      body: {
        type: 'object',
        required: ['token', 'full_name', 'password'],
        properties: {
          token: { type: 'string', description: 'Invitation token' },
          full_name: { type: 'string', description: 'User full name' },
          password: { type: 'string', description: 'Account password' },
        },
      },
      response: {
        201: {
          description: 'Account created successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const input = acceptInvitationSchema.parse(request.body);

      const result = await teamService.acceptInvitation(input);

      return reply.status(201).send({
        success: true,
        data: {
          user: result.user,
          organization_id: result.organizationId,
        },
        message: 'Account created successfully. You can now log in.',
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // GET AVAILABLE ROLES
  // =====================
  fastify.get('/roles', {
    schema: {
      summary: 'Get available team roles and their descriptions',
      tags: ['Team'],
      response: {
        200: {
          description: 'Available roles',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { 
              type: 'object',
              additionalProperties: true,
              properties: {
                roles: { type: 'array', items: { type: 'string' } },
                descriptions: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
      },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      data: {
        roles: USER_ROLES,
        descriptions: ROLE_DESCRIPTIONS,
      },
    });
  });

  // ============================================
  // AUTHENTICATED ROUTES
  // ============================================

  // Authentication hook for remaining routes
  fastify.addHook('onRequest', async (request, reply) => {
    // Skip auth for public routes
    const publicPaths = ['/invitations/verify', '/invitations/accept', '/roles'];
    const url = request.url.split('?')[0];
    
    if (publicPaths.some(path => url.endsWith(path))) {
      return;
    }

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
  // INVITE TEAM MEMBER
  // =====================
  fastify.post('/invite', {
    preHandler: [requireRole(['ORG_OWNER', 'ORG_ADMIN'])],
    schema: {
      summary: 'Invite a new team member',
      tags: ['Team'],
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', description: 'Email to invite' },
          role: { type: 'string', enum: [...USER_ROLES], default: 'ORG_MEMBER', description: 'Role to assign' },
        },
      },
      response: {
        201: {
          description: 'Invitation created',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { id: string; organizationId: string };
      const input = inviteTeamMemberSchema.parse(request.body);

      const invitation = await teamService.inviteTeamMember(
        user.organizationId,
        user.id,
        input
      );

      return reply.status(201).send({
        success: true,
        data: invitation,
        message: `Invitation sent to ${input.email}`,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // LIST TEAM MEMBERS
  // =====================
  fastify.get('/members', {
    schema: {
      summary: 'List team members',
      tags: ['Team'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Search in name or email' },
          role: { type: 'string', enum: [...USER_ROLES], description: 'Filter by role' },
          is_active: { type: 'string', enum: ['true', 'false'], description: 'Filter by active status' },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          sort_by: { type: 'string', enum: ['full_name', 'email', 'role', 'created_at', 'last_login_at'], default: 'created_at' },
          sort_order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
        },
      },
      response: {
        200: {
          description: 'List of team members',
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
      const query = listTeamMembersQuerySchema.parse(request.query);

      const result = await teamService.listTeamMembers(user.organizationId, query);

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
  // LIST INVITATIONS
  // =====================
  fastify.get('/invitations', {
    preHandler: [requireRole(['ORG_OWNER', 'ORG_ADMIN'])],
    schema: {
      summary: 'List pending invitations',
      tags: ['Team'],
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELED'], description: 'Filter by status' },
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
      response: {
        200: {
          description: 'List of invitations',
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
      const query = listInvitationsQuerySchema.parse(request.query);

      const result = await teamService.listInvitations(user.organizationId, query);

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
  // GET TEAM STATISTICS
  // =====================
  fastify.get('/stats', {
    schema: {
      summary: 'Get team statistics',
      tags: ['Team'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          description: 'Team statistics',
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

      const stats = await teamService.getTeamStats(user.organizationId);

      return reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // RESEND INVITATION
  // =====================
  fastify.post('/invitations/:id/resend', {
    preHandler: [requireRole(['ORG_OWNER', 'ORG_ADMIN'])],
    schema: {
      summary: 'Resend an invitation',
      tags: ['Team'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Invitation ID' },
        },
      },
      response: {
        200: {
          description: 'Invitation resent',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = request.user as { organizationId: string };
      const { id } = invitationIdParamSchema.parse(request.params);

      const invitation = await teamService.resendInvitation(user.organizationId, id);

      return reply.send({
        success: true,
        data: invitation,
        message: 'Invitation resent successfully',
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // CANCEL INVITATION
  // =====================
  fastify.delete('/invitations/:id', {
    preHandler: [requireRole(['ORG_OWNER', 'ORG_ADMIN'])],
    schema: {
      summary: 'Cancel an invitation',
      tags: ['Team'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Invitation ID' },
        },
      },
      response: {
        200: {
          description: 'Invitation canceled',
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
      const { id } = invitationIdParamSchema.parse(request.params);

      const canceled = await teamService.cancelInvitation(user.organizationId, id);

      if (!canceled) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'TEAM_002',
            message: 'Invitation not found or already processed',
          },
        });
      }

      return reply.send({
        success: true,
        message: 'Invitation canceled successfully',
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // GET TEAM MEMBER BY ID
  // =====================
  fastify.get('/members/:id', {
    schema: {
      summary: 'Get team member by ID',
      tags: ['Team'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Member ID' },
        },
      },
      response: {
        200: {
          description: 'Team member details',
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
      const { id } = memberIdParamSchema.parse(request.params);

      const member = await teamService.getTeamMember(user.organizationId, id);

      if (!member) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'TEAM_001',
            message: 'Team member not found',
          },
        });
      }

      return reply.send({
        success: true,
        data: member,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // UPDATE MEMBER ROLE
  // =====================
  fastify.put('/members/:id/role', {
    preHandler: [requireRole(['ORG_OWNER', 'ORG_ADMIN'])],
    schema: {
      summary: 'Update team member role',
      tags: ['Team'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Member ID' },
        },
      },
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', enum: [...USER_ROLES], description: 'New role' },
        },
      },
      response: {
        200: {
          description: 'Role updated',
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
      const user = request.user as { id: string; organizationId: string };
      const { id } = memberIdParamSchema.parse(request.params);
      const input = updateMemberRoleSchema.parse(request.body);

      const member = await teamService.updateMemberRole(
        user.organizationId,
        id,
        input,
        user.id
      );

      if (!member) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'TEAM_001',
            message: 'Team member not found',
          },
        });
      }

      return reply.send({
        success: true,
        data: member,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // DEACTIVATE MEMBER
  // =====================
  fastify.post('/members/:id/deactivate', {
    preHandler: [requireRole(['ORG_OWNER', 'ORG_ADMIN'])],
    schema: {
      summary: 'Deactivate a team member',
      tags: ['Team'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Member ID' },
        },
      },
      response: {
        200: {
          description: 'Member deactivated',
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
      const user = request.user as { id: string; organizationId: string };
      const { id } = memberIdParamSchema.parse(request.params);

      const deactivated = await teamService.deactivateMember(
        user.organizationId,
        id,
        user.id
      );

      if (!deactivated) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'TEAM_001',
            message: 'Team member not found',
          },
        });
      }

      return reply.send({
        success: true,
        message: 'Team member deactivated',
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // REACTIVATE MEMBER
  // =====================
  fastify.post('/members/:id/reactivate', {
    preHandler: [requireRole(['ORG_OWNER', 'ORG_ADMIN'])],
    schema: {
      summary: 'Reactivate a team member',
      tags: ['Team'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Member ID' },
        },
      },
      response: {
        200: {
          description: 'Member reactivated',
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
      const { id } = memberIdParamSchema.parse(request.params);

      const member = await teamService.reactivateMember(user.organizationId, id);

      if (!member) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'TEAM_001',
            message: 'Team member not found',
          },
        });
      }

      return reply.send({
        success: true,
        data: member,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // =====================
  // REMOVE MEMBER
  // =====================
  fastify.delete('/members/:id', {
    preHandler: [requireRole(['ORG_OWNER'])],
    schema: {
      summary: 'Remove a team member',
      tags: ['Team'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Member ID' },
        },
      },
      response: {
        200: {
          description: 'Member removed',
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
      const user = request.user as { id: string; organizationId: string };
      const { id } = memberIdParamSchema.parse(request.params);

      const removed = await teamService.removeMember(
        user.organizationId,
        id,
        user.id
      );

      if (!removed) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'TEAM_001',
            message: 'Team member not found',
          },
        });
      }

      return reply.send({
        success: true,
        message: 'Team member removed',
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });
}

export default teamRoutes;
