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
import { AppError } from '../../types';
import { requireRole } from '../../middleware/rbac';
import { UserRole } from '@prisma/client';

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
        const query = listInvoicesQuerySchema.parse(request.query);

        const result = await invoicesService.listInvoices(
          user.organizationId,
          query
        );

        return reply.status(200).send({
          success: true,
          data: result,
        });
      } catch (error) {
        throw error;
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
        throw error;
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
          throw new AppError('Invoice not found', 404, 'INVOICE_001');
        }

        return reply.status(200).send({
          success: true,
          data: { invoice },
        });
      } catch (error) {
        throw error;
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
        const body = submitPaymentProofSchema.parse(request.body);

        const invoice = await invoicesService.submitPaymentProof(
          invoiceId,
          user.organizationId,
          body
        );

        logger.info(`Payment proof submitted for invoice ${invoiceId}`);

        return reply.status(200).send({
          success: true,
          data: { invoice },
          message: 'Payment proof submitted successfully. Awaiting verification.',
        });
      } catch (error) {
        throw error;
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
        throw error;
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
    { preHandler: [requireAuth, requireRole(UserRole.SUPER_ADMIN)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = adminListInvoicesQuerySchema.parse(request.query);

        const result = await invoicesService.adminListInvoices(query);

        return reply.status(200).send({
          success: true,
          data: result,
        });
      } catch (error) {
        throw error;
      }
    }
  );

  /**
   * GET /admin/stats - Get all invoice statistics (Admin only)
   */
  fastify.get(
    '/admin/stats',
    { preHandler: [requireAuth, requireRole(UserRole.SUPER_ADMIN)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const stats = await invoicesService.getInvoiceStats();

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
   * GET /admin/pending-verification - Get invoices pending verification
   */
  fastify.get(
    '/admin/pending-verification',
    { preHandler: [requireAuth, requireRole(UserRole.SUPER_ADMIN)] },
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
        throw error;
      }
    }
  );

  /**
   * GET /admin/overdue - Get overdue invoices
   */
  fastify.get(
    '/admin/overdue',
    { preHandler: [requireAuth, requireRole(UserRole.SUPER_ADMIN)] },
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
        throw error;
      }
    }
  );

  /**
   * POST /admin/create - Create invoice (Admin only)
   */
  fastify.post(
    '/admin/create',
    { preHandler: [requireAuth, requireRole(UserRole.SUPER_ADMIN)] },
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

        const parsedData = createInvoiceSchema.parse(invoiceData);

        const invoice = await invoicesService.createInvoice(organization_id, parsedData);

        logger.info(`Invoice created by admin: ${invoice.id}`);

        return reply.status(201).send({
          success: true,
          data: { invoice },
          message: 'Invoice created successfully',
        });
      } catch (error) {
        throw error;
      }
    }
  );

  /**
   * GET /admin/:invoiceId - Get any invoice (Admin only)
   */
  fastify.get(
    '/admin/:invoiceId',
    { preHandler: [requireAuth, requireRole(UserRole.SUPER_ADMIN)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { invoiceId } = request.params as { invoiceId: string };
        const invoice = await invoicesService.getInvoiceById(invoiceId);

        if (!invoice) {
          throw new AppError('Invoice not found', 404, 'INVOICE_001');
        }

        return reply.status(200).send({
          success: true,
          data: { invoice },
        });
      } catch (error) {
        throw error;
      }
    }
  );

  /**
   * PUT /admin/:invoiceId - Update invoice (Admin only)
   */
  fastify.put(
    '/admin/:invoiceId',
    { preHandler: [requireAuth, requireRole(UserRole.SUPER_ADMIN)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { invoiceId } = request.params as { invoiceId: string };
        const body = updateInvoiceSchema.parse(request.body);

        const invoice = await invoicesService.updateInvoice(invoiceId, null, body);

        logger.info(`Invoice updated by admin: ${invoiceId}`);

        return reply.status(200).send({
          success: true,
          data: { invoice },
          message: 'Invoice updated successfully',
        });
      } catch (error) {
        throw error;
      }
    }
  );

  /**
   * POST /admin/:invoiceId/verify - Verify payment (Admin only)
   */
  fastify.post(
    '/admin/:invoiceId/verify',
    { preHandler: [requireAuth, requireRole(UserRole.SUPER_ADMIN)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { invoiceId } = request.params as { invoiceId: string };
        const body = verifyPaymentSchema.parse(request.body);

        const invoice = await invoicesService.verifyPayment(invoiceId, body);

        logger.info(`Payment verified for invoice ${invoiceId}: ${body.status}`);

        return reply.status(200).send({
          success: true,
          data: { invoice },
          message:
            body.status === 'PAID'
              ? 'Payment verified successfully'
              : 'Payment marked as failed',
        });
      } catch (error) {
        throw error;
      }
    }
  );

  /**
   * POST /admin/:invoiceId/cancel - Cancel invoice (Admin only)
   */
  fastify.post(
    '/admin/:invoiceId/cancel',
    { preHandler: [requireAuth, requireRole(UserRole.SUPER_ADMIN)] },
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
        throw error;
      }
    }
  );
}

export default invoicesRoutes;
