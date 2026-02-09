/**
 * Payments Module - API Routes
 * @module payments/routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as paymentsService from './payments.service';
import {
  updatePaymentMethodConfigSchema,
  createMidtransTransactionSchema,
  midtransNotificationSchema,
  UpdatePaymentMethodConfigInput,
  CreateMidtransTransactionInput,
  MidtransNotification,
  PaymentMethodValue,
  PAYMENT_METHODS,
  BANK_OPTIONS,
  getMidtransSnapUrl,
} from './payments.schema';
import logger from '../../config/logger';

// ============================================
// ERROR HANDLING
// ============================================

function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof Error) {
    if (error.message.includes('not found')) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'PAYMENT_001',
          message: error.message,
        },
      });
    }

    if (error.message.includes('not configured')) {
      return reply.status(503).send({
        success: false,
        error: {
          code: 'PAYMENT_002',
          message: error.message,
        },
      });
    }

    if (error.message.includes('Invalid signature')) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'PAYMENT_003',
          message: 'Invalid webhook signature',
        },
      });
    }

    logger.error('Payment Error:', error.message);
    return reply.status(500).send({
      success: false,
      error: {
        code: 'PAYMENT_500',
        message: 'An unexpected error occurred',
      },
    });
  }

  logger.error('Payment Unknown Error:', error);
  return reply.status(500).send({
    success: false,
    error: {
      code: 'PAYMENT_500',
      message: 'An unexpected error occurred',
    },
  });
}

// ============================================
// ROUTE REGISTRATION
// ============================================

export async function paymentsRoutes(fastify: FastifyInstance) {
  // ============================================
  // PUBLIC ROUTES
  // ============================================

  /**
   * GET /methods - Get enabled payment methods
   */
  fastify.get('/methods', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const methods = await paymentsService.getEnabledPaymentMethods();

      return reply.status(200).send({
        success: true,
        data: {
          methods,
          bank_options: BANK_OPTIONS,
        },
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  /**
   * GET /manual-transfer/details - Get manual transfer bank details
   */
  fastify.get('/manual-transfer/details', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const details = await paymentsService.getManualTransferDetails();

      if (!details) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'PAYMENT_001',
            message: 'Manual transfer is not configured',
          },
        });
      }

      return reply.status(200).send({
        success: true,
        data: details,
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  /**
   * POST /midtrans/webhook - Midtrans webhook endpoint
   * This endpoint receives notifications from Midtrans
   */
  fastify.post(
    '/midtrans/webhook',
    async (
      request: FastifyRequest<{ Body: MidtransNotification }>,
      reply: FastifyReply
    ) => {
      try {
        const validation = midtransNotificationSchema.safeParse(request.body);

        if (!validation.success) {
          logger.warn('Invalid Midtrans webhook payload:', validation.error.errors);
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid webhook payload',
            },
          });
        }

        await paymentsService.handleMidtransNotification(validation.data);

        // Return OK to Midtrans
        return reply.status(200).send({ success: true });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

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
  // USER PAYMENT ROUTES
  // ============================================

  /**
   * POST /midtrans/snap-token - Create Midtrans Snap token
   */
  fastify.post(
    '/midtrans/snap-token',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user as { organizationId: string };
        const { invoice_id } = request.body as { invoice_id: string };

        if (!invoice_id) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'invoice_id is required',
            },
          });
        }

        const result = await paymentsService.createMidtransSnapToken(
          invoice_id,
          user.organizationId
        );

        // Get Midtrans config for Snap URL
        const midtransConfig = await paymentsService.getMidtransConfig();
        const snapUrl = midtransConfig
          ? getMidtransSnapUrl(midtransConfig.is_production)
          : getMidtransSnapUrl(false);

        return reply.status(200).send({
          success: true,
          data: {
            ...result,
            snap_url: snapUrl,
          },
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * POST /midtrans/transaction - Create Midtrans direct transaction
   */
  fastify.post(
    '/midtrans/transaction',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user as { organizationId: string };
        const validation = createMidtransTransactionSchema.safeParse(request.body);

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

        const result = await paymentsService.createMidtransTransaction(
          validation.data.invoice_id,
          user.organizationId,
          validation.data
        );

        return reply.status(200).send({
          success: true,
          data: result,
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * GET /status/:invoiceId - Get payment status
   */
  fastify.get(
    '/status/:invoiceId',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user as { organizationId: string };
        const { invoiceId } = request.params as { invoiceId: string };

        const status = await paymentsService.getPaymentStatus(invoiceId, user.organizationId);

        return reply.status(200).send({
          success: true,
          data: status,
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  // ============================================
  // ADMIN ROUTES
  // ============================================

  /**
   * GET /admin/methods/all - Get all payment method configs (Admin only)
   */
  fastify.get(
    '/admin/methods/all',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const methods = await paymentsService.getAllPaymentMethodConfigs();

        return reply.status(200).send({
          success: true,
          data: {
            methods,
            available_methods: PAYMENT_METHODS,
          },
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * GET /admin/methods/:method - Get payment method config (Admin only)
   */
  fastify.get(
    '/admin/methods/:method',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { method } = request.params as { method: string };

        if (!PAYMENT_METHODS.includes(method as PaymentMethodValue)) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid payment method',
            },
          });
        }

        const config = await paymentsService.getPaymentMethodConfig(method as PaymentMethodValue);

        return reply.status(200).send({
          success: true,
          data: { config },
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * PUT /admin/methods/:method - Update payment method config (Admin only)
   */
  fastify.put(
    '/admin/methods/:method',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { method } = request.params as { method: string };

        if (!PAYMENT_METHODS.includes(method as PaymentMethodValue)) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid payment method',
            },
          });
        }

        const validation = updatePaymentMethodConfigSchema.safeParse(request.body);

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

        const config = await paymentsService.updatePaymentMethodConfig(
          method as PaymentMethodValue,
          validation.data
        );

        logger.info(`Payment method config updated: ${method}`);

        return reply.status(200).send({
          success: true,
          data: { config },
          message: 'Payment method configuration updated successfully',
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * POST /admin/methods/initialize - Initialize default payment method configs (Admin only)
   */
  fastify.post(
    '/admin/methods/initialize',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await paymentsService.initializePaymentMethodConfigs();

        return reply.status(200).send({
          success: true,
          message: 'Payment method configurations initialized',
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * GET /admin/midtrans/config - Get Midtrans config (Admin only)
   */
  fastify.get(
    '/admin/midtrans/config',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const config = await paymentsService.getMidtransConfig();

        if (!config) {
          return reply.status(200).send({
            success: true,
            data: {
              configured: false,
              config: null,
            },
          });
        }

        // Mask sensitive data
        return reply.status(200).send({
          success: true,
          data: {
            configured: true,
            config: {
              is_production: config.is_production,
              merchant_id: config.merchant_id,
              server_key: `${config.server_key.substring(0, 10)}...`,
              client_key: config.client_key,
              enabled_payment_types: config.enabled_payment_types,
            },
          },
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * GET /admin/midtrans/status/:orderId - Check Midtrans transaction status (Admin only)
   */
  fastify.get(
    '/admin/midtrans/status/:orderId',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orderId } = request.params as { orderId: string };
        const status = await paymentsService.checkMidtransStatus(orderId);

        return reply.status(200).send({
          success: true,
          data: status,
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * GET /admin/status/:invoiceId - Get any payment status (Admin only)
   */
  fastify.get(
    '/admin/status/:invoiceId',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { invoiceId } = request.params as { invoiceId: string };
        const status = await paymentsService.getPaymentStatus(invoiceId);

        return reply.status(200).send({
          success: true,
          data: status,
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );
}

export default paymentsRoutes;
