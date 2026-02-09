/**
 * Invoices Module - API Routes
 * @module invoices/routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as invoicesService from './invoices.service';
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  submitPaymentProofSchema,
  verifyPaymentSchema,
  listInvoicesQuerySchema,
  adminListInvoicesQuerySchema,
  CreateInvoiceInput,
  UpdateInvoiceInput,
  SubmitPaymentProofInput,
  VerifyPaymentInput,
  ListInvoicesQuery,
  AdminListInvoicesQuery,
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  INVOICE_STATUS_LABELS,
} from './invoices.schema';
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
          code: 'INVOICE_001',
          message: error.message,
        },
      });
    }

    if (error.message.includes('only')) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVOICE_002',
          message: error.message,
        },
      });
    }

    logger.error('Invoice Error:', error.message);
    return reply.status(500).send({
      success: false,
      error: {
        code: 'INVOICE_500',
        message: 'An unexpected error occurred',
      },
    });
  }

  logger.error('Invoice Unknown Error:', error);
  return reply.status(500).send({
    success: false,
    error: {
      code: 'INVOICE_500',
      message: 'An unexpected error occurred',
    },
  });
}

// ============================================
// ROUTE REGISTRATION
// ============================================

export async function invoicesRoutes(fastify: FastifyInstance) {
  // ============================================
  // PUBLIC ROUTES
  // ============================================

  /**
   * GET /statuses - Get invoice statuses
   */
  fastify.get('/statuses', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      success: true,
      data: {
        statuses: INVOICE_STATUSES,
        labels: INVOICE_STATUS_LABELS,
      },
    });
  });

  /**
   * GET /payment-methods - Get payment methods
   */
  fastify.get('/payment-methods', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      success: true,
      data: {
        methods: PAYMENT_METHODS,
        labels: PAYMENT_METHOD_LABELS,
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
  // USER INVOICE ROUTES
  // ============================================

  /**
   * GET / - List user's invoices
   */
  fastify.get(
    '/',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user as { organizationId: string };
        const validation = listInvoicesQuerySchema.safeParse(request.query);

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

        const result = await invoicesService.listInvoices(
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
   * GET /stats - Get invoice statistics
   */
  fastify.get(
    '/stats',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user as { organizationId: string };
        const stats = await invoicesService.getInvoiceStats(user.organizationId);

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
   * GET /:invoiceId - Get a specific invoice
   */
  fastify.get(
    '/:invoiceId',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user as { organizationId: string };
        const { invoiceId } = request.params as { invoiceId: string };

        const invoice = await invoicesService.getInvoiceById(invoiceId, user.organizationId);

        if (!invoice) {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'INVOICE_001',
              message: 'Invoice not found',
            },
          });
        }

        return reply.status(200).send({
          success: true,
          data: { invoice },
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * POST /:invoiceId/payment-proof - Submit payment proof
   */
  fastify.post(
    '/:invoiceId/payment-proof',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user as { organizationId: string };
        const { invoiceId } = request.params as { invoiceId: string };
        const validation = submitPaymentProofSchema.safeParse(request.body);

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

        const invoice = await invoicesService.submitPaymentProof(
          invoiceId,
          user.organizationId,
          validation.data
        );

        logger.info(`Payment proof submitted for invoice ${invoiceId}`);

        return reply.status(200).send({
          success: true,
          data: { invoice },
          message: 'Payment proof submitted successfully. Awaiting verification.',
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * POST /:invoiceId/cancel - Cancel invoice (user)
   */
  fastify.post(
    '/:invoiceId/cancel',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user as { organizationId: string };
        const { invoiceId } = request.params as { invoiceId: string };

        const invoice = await invoicesService.cancelInvoice(invoiceId, user.organizationId);

        logger.info(`Invoice canceled: ${invoiceId}`);

        return reply.status(200).send({
          success: true,
          data: { invoice },
          message: 'Invoice canceled successfully',
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
   * GET /admin/all - List all invoices (Admin only)
   */
  fastify.get(
    '/admin/all',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = adminListInvoicesQuerySchema.safeParse(request.query);

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

        const result = await invoicesService.adminListInvoices(validation.data);

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
   * GET /admin/stats - Get all invoice statistics (Admin only)
   */
  fastify.get(
    '/admin/stats',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const stats = await invoicesService.getInvoiceStats();

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
   * GET /admin/pending-verification - Get invoices pending verification
   */
  fastify.get(
    '/admin/pending-verification',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const invoices = await invoicesService.getPendingVerification();

        return reply.status(200).send({
          success: true,
          data: {
            invoices,
            count: invoices.length,
          },
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * GET /admin/overdue - Get overdue invoices
   */
  fastify.get(
    '/admin/overdue',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const invoices = await invoicesService.getOverdueInvoices();

        return reply.status(200).send({
          success: true,
          data: {
            invoices,
            count: invoices.length,
          },
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * POST /admin/create - Create invoice (Admin only)
   */
  fastify.post(
    '/admin/create',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as CreateInvoiceInput & { organization_id: string };
        const { organization_id, ...invoiceData } = body;

        if (!organization_id) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'organization_id is required',
            },
          });
        }

        const validation = createInvoiceSchema.safeParse(invoiceData);

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

        const invoice = await invoicesService.createInvoice(organization_id, validation.data);

        logger.info(`Invoice created by admin: ${invoice.id}`);

        return reply.status(201).send({
          success: true,
          data: { invoice },
          message: 'Invoice created successfully',
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * GET /admin/:invoiceId - Get any invoice (Admin only)
   */
  fastify.get(
    '/admin/:invoiceId',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { invoiceId } = request.params as { invoiceId: string };
        const invoice = await invoicesService.getInvoiceById(invoiceId);

        if (!invoice) {
          return reply.status(404).send({
            success: false,
            error: {
              code: 'INVOICE_001',
              message: 'Invoice not found',
            },
          });
        }

        return reply.status(200).send({
          success: true,
          data: { invoice },
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * PUT /admin/:invoiceId - Update invoice (Admin only)
   */
  fastify.put(
    '/admin/:invoiceId',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { invoiceId } = request.params as { invoiceId: string };
        const validation = updateInvoiceSchema.safeParse(request.body);

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

        const invoice = await invoicesService.updateInvoice(invoiceId, null, validation.data);

        logger.info(`Invoice updated by admin: ${invoiceId}`);

        return reply.status(200).send({
          success: true,
          data: { invoice },
          message: 'Invoice updated successfully',
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * POST /admin/:invoiceId/verify - Verify payment (Admin only)
   */
  fastify.post(
    '/admin/:invoiceId/verify',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { invoiceId } = request.params as { invoiceId: string };
        const validation = verifyPaymentSchema.safeParse(request.body);

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

        const invoice = await invoicesService.verifyPayment(invoiceId, validation.data);

        logger.info(`Payment verified for invoice ${invoiceId}: ${validation.data.status}`);

        return reply.status(200).send({
          success: true,
          data: { invoice },
          message:
            validation.data.status === 'PAID'
              ? 'Payment verified successfully'
              : 'Payment marked as failed',
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );

  /**
   * POST /admin/:invoiceId/cancel - Cancel invoice (Admin only)
   */
  fastify.post(
    '/admin/:invoiceId/cancel',
    { preHandler: [requireSuperAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { invoiceId } = request.params as { invoiceId: string };
        const invoice = await invoicesService.cancelInvoice(invoiceId, null);

        logger.info(`Invoice canceled by admin: ${invoiceId}`);

        return reply.status(200).send({
          success: true,
          data: { invoice },
          message: 'Invoice canceled successfully',
        });
      } catch (error) {
        return handleError(error, reply);
      }
    }
  );
}

export default invoicesRoutes;
