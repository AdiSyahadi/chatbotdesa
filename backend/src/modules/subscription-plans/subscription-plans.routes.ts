/**
 * Subscription Plans Module - API Routes
 * @module subscription-plans/routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as subscriptionPlansService from './subscription-plans.service';
import {
  createPlanSchema,
  updatePlanSchema,
  listPlansQuerySchema,
  createSubscriptionSchema,
  updateSubscriptionSchema,
  changePlanSchema,
  CreatePlanInput,
  UpdatePlanInput,
  ListPlansQuery,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  ChangePlanInput,
  BILLING_PERIODS,
  BILLING_PERIOD_LABELS,
} from './subscription-plans.schema';
import logger from '../../config/logger';

// ============================================
// ERROR HANDLING
// ============================================

function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof Error) {
    // Check for specific error messages
    if (error.message.includes('not found')) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'PLAN_001',
          message: error.message,
        },
      });
    }

    if (error.message.includes('already exists')) {
      return reply.status(409).send({
        success: false,
        error: {
          code: 'PLAN_002',
          message: error.message,
        },
      });
    }

    if (error.message.includes('Cannot')) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'PLAN_003',
          message: error.message,
        },
      });
    }

    if (error.message.includes('already')) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'PLAN_004',
          message: error.message,
        },
      });
    }

    logger.error('Subscription Plans Error:', error.message);
    return reply.status(500).send({
      success: false,
      error: {
        code: 'PLAN_500',
        message: 'An unexpected error occurred',
      },
    });
  }

  logger.error('Subscription Plans Unknown Error:', error);
  return reply.status(500).send({
    success: false,
    error: {
      code: 'PLAN_500',
      message: 'An unexpected error occurred',
    },
  });
}

// ============================================
// ROUTE REGISTRATION
// ============================================

export async function subscriptionPlansRoutes(fastify: FastifyInstance) {
  // ============================================
  // PUBLIC ROUTES (No auth required)
  // ============================================

  /**
   * GET /plans/public - Get public subscription plans
   * For pricing page display
   */
  fastify.get('/plans/public', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const plans = await subscriptionPlansService.listPublicPlans();

      return reply.status(200).send({
        success: true,
        data: {
          plans,
          billing_periods: BILLING_PERIOD_LABELS,
        },
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  /**
   * GET /billing-periods - Get available billing periods
   */
  fastify.get('/billing-periods', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      success: true,
      data: {
        periods: BILLING_PERIODS,
        labels: BILLING_PERIOD_LABELS,
      },
    });
  });

  // ============================================
  // AUTHENTICATED ROUTES
  // ============================================

  /**
   * Middleware to verify authentication
   */
  const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
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
  };

  /**
   * Middleware to require SUPER_ADMIN role
   */
  const requireSuperAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(request, reply);
    const user = request.user as { role: string };
    
    if (user.role !== 'SUPER_ADMIN') {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'AUTH_002',
          message: 'Super admin access required',
        },
      });
    }
  };

  // ============================================
  // ADMIN PLAN MANAGEMENT ROUTES
  // ============================================

  /**
   * POST /plans - Create a new subscription plan (Admin only)
   */
  fastify.post(
    '/plans',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = createPlanSchema.safeParse(request.body);
        if (!validation.success) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid input',
              details: validation.error.errors,
            },
          });
        }

        const plan = await subscriptionPlansService.createPlan(validation.data);

        logger.info(`Plan created: ${plan.id} - ${plan.name}`);

        return reply.status(201).send({
          success: true,
          data: { plan },
          message: 'Subscription plan created successfully',
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * GET /plans - List all subscription plans (Admin only)
   */
  fastify.get(
    '/plans',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = listPlansQuerySchema.safeParse(request.query);
        if (!validation.success) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid query parameters',
              details: validation.error.errors,
            },
          });
        }

        const plans = await subscriptionPlansService.listPlans(validation.data);

        return reply.status(200).send({
          success: true,
          data: { plans },
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * GET /plans/stats - Get plan statistics (Admin only)
   */
  fastify.get(
    '/plans/stats',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const stats = await subscriptionPlansService.getPlanStats();

        return reply.status(200).send({
          success: true,
          data: stats,
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * GET /plans/:planId - Get a specific plan (Admin only)
   */
  fastify.get(
    '/plans/:planId',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { planId } = request.params as { planId: string };
        const plan = await subscriptionPlansService.getPlanById(planId);

        if (!plan) {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'PLAN_001',
              message: 'Plan not found',
            },
          });
        }

        return reply.status(200).send({
          success: true,
          data: { plan },
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * PUT /plans/:planId - Update a subscription plan (Admin only)
   */
  fastify.put(
    '/plans/:planId',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { planId } = request.params as { planId: string };
        const validation = updatePlanSchema.safeParse(request.body);

        if (!validation.success) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid input',
              details: validation.error.errors,
            },
          });
        }

        const plan = await subscriptionPlansService.updatePlan(planId, validation.data);

        logger.info(`Plan updated: ${plan.id}`);

        return reply.status(200).send({
          success: true,
          data: { plan },
          message: 'Subscription plan updated successfully',
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * DELETE /plans/:planId - Delete a subscription plan (Admin only)
   */
  fastify.delete(
    '/plans/:planId',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { planId } = request.params as { planId: string };
        await subscriptionPlansService.deletePlan(planId);

        logger.info(`Plan deleted: ${planId}`);

        return reply.status(200).send({
          success: true,
          message: 'Subscription plan deleted successfully',
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  // ============================================
  // USER SUBSCRIPTION ROUTES
  // ============================================

  /**
   * GET /subscription - Get current user's subscription
   */
  fastify.get(
    '/subscription',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user as { organizationId: string };
        const subscription = await subscriptionPlansService.getSubscription(user.organizationId);

        return reply.status(200).send({
          success: true,
          data: { subscription },
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * POST /subscription - Create a new subscription
   */
  fastify.post(
    '/subscription',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user as { organizationId: string; userId: string };
        const validation = createSubscriptionSchema.safeParse(request.body);

        if (!validation.success) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid input',
              details: validation.error.errors,
            },
          });
        }

        const subscription = await subscriptionPlansService.createSubscription(
          user.organizationId,
          validation.data
        );

        logger.info(`Subscription created: ${subscription.id} for org ${user.organizationId}`);

        return reply.status(201).send({
          success: true,
          data: { subscription },
          message: 'Subscription created successfully',
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * GET /subscription/history - Get subscription history
   */
  fastify.get(
    '/subscription/history',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user as { organizationId: string };
        const history = await subscriptionPlansService.getSubscriptionHistory(user.organizationId);

        return reply.status(200).send({
          success: true,
          data: { history },
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * GET /subscription/usage - Get subscription usage
   */
  fastify.get(
    '/subscription/usage',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user as { organizationId: string };
        const usage = await subscriptionPlansService.getSubscriptionUsage(user.organizationId);

        return reply.status(200).send({
          success: true,
          data: { usage },
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * POST /subscription/change-plan - Change subscription plan
   */
  fastify.post(
    '/subscription/change-plan',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user as { organizationId: string; userId: string };
        const validation = changePlanSchema.safeParse(request.body);

        if (!validation.success) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid input',
              details: validation.error.errors,
            },
          });
        }

        const result = await subscriptionPlansService.changePlan(
          user.organizationId,
          validation.data
        );

        logger.info(`Plan changed for org ${user.organizationId}`);

        return reply.status(200).send({
          success: true,
          data: result,
          message: 'Subscription plan changed successfully',
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * POST /subscription/cancel - Cancel subscription
   */
  fastify.post(
    '/subscription/cancel',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user as { organizationId: string };
        const body = request.body as { immediate?: boolean } | undefined;
        const { immediate = false } = body || {};

        // Get current subscription
        const currentSubscription = await subscriptionPlansService.getSubscription(
          user.organizationId
        );

        if (!currentSubscription) {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'PLAN_001',
              message: 'No active subscription found',
            },
          });
        }

        const subscription = await subscriptionPlansService.cancelSubscription(
          currentSubscription.id,
          user.organizationId,
          immediate
        );

        logger.info(
          `Subscription canceled: ${subscription.id} (immediate: ${immediate})`
        );

        return reply.status(200).send({
          success: true,
          data: { subscription },
          message: immediate
            ? 'Subscription canceled immediately'
            : 'Subscription will be canceled at the end of the billing period',
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * PUT /subscription/:subscriptionId - Update subscription
   */
  fastify.put(
    '/subscription/:subscriptionId',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user as { organizationId: string };
        const { subscriptionId } = request.params as { subscriptionId: string };
        const validation = updateSubscriptionSchema.safeParse(request.body);

        if (!validation.success) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid input',
              details: validation.error.errors,
            },
          });
        }

        const subscription = await subscriptionPlansService.updateSubscription(
          subscriptionId,
          user.organizationId,
          validation.data
        );

        return reply.status(200).send({
          success: true,
          data: { subscription },
          message: 'Subscription updated successfully',
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );
}

export default subscriptionPlansRoutes;
