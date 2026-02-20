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
import { AppError } from '../../types';
import { requireRole } from '../../middleware/rbac';
import { UserRole } from '@prisma/client';

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
      throw error;
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



  // ============================================
  // ADMIN PLAN MANAGEMENT ROUTES
  // ============================================

  /**
   * POST /plans - Create a new subscription plan (Admin only)
   */
  fastify.post(
    '/plans',
    { preHandler: [requireAuth, requireRole(UserRole.SUPER_ADMIN)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = createPlanSchema.parse(request.body);

        const plan = await subscriptionPlansService.createPlan(body);

        logger.info(`Plan created: ${plan.id} - ${plan.name}`);

        return reply.status(201).send({
          success: true,
          data: { plan },
          message: 'Subscription plan created successfully',
        });
      } catch (error) {
        throw error;
      }
    }
  );

  /**
   * GET /plans - List all subscription plans (Admin only)
   */
  fastify.get(
    '/plans',
    { preHandler: [requireAuth, requireRole(UserRole.SUPER_ADMIN)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = listPlansQuerySchema.parse(request.query);

        const plans = await subscriptionPlansService.listPlans(query);

        return reply.status(200).send({
          success: true,
          data: { plans },
        });
      } catch (error) {
        throw error;
      }
    }
  );

  /**
   * GET /plans/stats - Get plan statistics (Admin only)
   */
  fastify.get(
    '/plans/stats',
    { preHandler: [requireAuth, requireRole(UserRole.SUPER_ADMIN)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const stats = await subscriptionPlansService.getPlanStats();

        return reply.status(200).send({
          success: true,
          data: stats,
        });
      } catch (error) {
        throw error;
      }
    }
  );

  /**
   * GET /plans/:planId - Get a specific plan (Admin only)
   */
  fastify.get(
    '/plans/:planId',
    { preHandler: [requireAuth, requireRole(UserRole.SUPER_ADMIN)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { planId } = request.params as { planId: string };
        const plan = await subscriptionPlansService.getPlanById(planId);

        if (!plan) {
          throw new AppError('Plan not found', 404, 'PLAN_001');
        }

        return reply.status(200).send({
          success: true,
          data: { plan },
        });
      } catch (error) {
        throw error;
      }
    }
  );

  /**
   * PUT /plans/:planId - Update a subscription plan (Admin only)
   */
  fastify.put(
    '/plans/:planId',
    { preHandler: [requireAuth, requireRole(UserRole.SUPER_ADMIN)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { planId } = request.params as { planId: string };
        const body = updatePlanSchema.parse(request.body);

        const plan = await subscriptionPlansService.updatePlan(planId, body);

        logger.info(`Plan updated: ${plan.id}`);

        return reply.status(200).send({
          success: true,
          data: { plan },
          message: 'Subscription plan updated successfully',
        });
      } catch (error) {
        throw error;
      }
    }
  );

  /**
   * DELETE /plans/:planId - Delete a subscription plan (Admin only)
   */
  fastify.delete(
    '/plans/:planId',
    { preHandler: [requireAuth, requireRole(UserRole.SUPER_ADMIN)] },
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
        throw error;
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
        throw error;
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
        const body = createSubscriptionSchema.parse(request.body);

        const subscription = await subscriptionPlansService.createSubscription(
          user.organizationId,
          body
        );

        logger.info(`Subscription created: ${subscription.id} for org ${user.organizationId}`);

        return reply.status(201).send({
          success: true,
          data: { subscription },
          message: 'Subscription created successfully',
        });
      } catch (error) {
        throw error;
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
        throw error;
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
        throw error;
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
        const body = changePlanSchema.parse(request.body);

        const result = await subscriptionPlansService.changePlan(
          user.organizationId,
          body
        );

        logger.info(`Plan changed for org ${user.organizationId}`);

        return reply.status(200).send({
          success: true,
          data: result,
          message: 'Subscription plan changed successfully',
        });
      } catch (error) {
        throw error;
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
          throw new AppError('No active subscription found', 404, 'PLAN_001');
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
        throw error;
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
        const body = updateSubscriptionSchema.parse(request.body);

        const subscription = await subscriptionPlansService.updateSubscription(
          subscriptionId,
          user.organizationId,
          body
        );

        return reply.status(200).send({
          success: true,
          data: { subscription },
          message: 'Subscription updated successfully',
        });
      } catch (error) {
        throw error;
      }
    }
  );
}

export default subscriptionPlansRoutes;
