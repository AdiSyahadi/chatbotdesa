/**
 * Admin Module - Routes
 * SUPER_ADMIN only endpoints for SaaS management
 * @module admin/routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../../config/database';
import { requireRole } from '../../middleware/rbac';
import { UserRole, InvoiceStatus } from '@prisma/client';
import logger from '../../config/logger';
import os from 'os';
import redis, { isRedisAvailable } from '../../config/redis';
import config from '../../config';

export async function adminRoutes(fastify: FastifyInstance) {
  // All admin routes require SUPER_ADMIN
  fastify.addHook('onRequest', fastify.authenticate);
  fastify.addHook('preHandler', requireRole(UserRole.SUPER_ADMIN));

  // ============================================
  // DASHBOARD STATS
  // ============================================

  /**
   * GET /admin/stats — Aggregated dashboard statistics
   */
  fastify.get('/stats', async (request, reply) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalOrganizations,
      newOrgsThisMonth,
      totalUsers,
      activeUsersToday,
      totalInstances,
      connectedInstances,
      revenueResult,
      messagesResult,
      messagesTodayResult,
    ] = await Promise.all([
      prisma.organization.count({ where: { deleted_at: null } }),
      prisma.organization.count({ where: { deleted_at: null, created_at: { gte: startOfMonth } } }),
      prisma.user.count({ where: { deleted_at: null } }),
      prisma.user.count({ where: { deleted_at: null, last_login_at: { gte: startOfDay } } }),
      prisma.whatsAppInstance.count({ where: { deleted_at: null } }),
      prisma.whatsAppInstance.count({ where: { deleted_at: null, status: 'CONNECTED' } }),
      prisma.invoice.aggregate({
        _sum: { total_amount: true },
        where: { status: InvoiceStatus.PAID, paid_at: { gte: startOfMonth } },
      }),
      prisma.message.count({ where: { created_at: { gte: startOfMonth } } }),
      prisma.message.count({ where: { created_at: { gte: startOfDay } } }),
    ]);

    const revenueMTD = revenueResult._sum.total_amount?.toNumber() || 0;

    return {
      success: true,
      data: {
        organizations: { total: totalOrganizations, newThisMonth: newOrgsThisMonth },
        users: { total: totalUsers, activeToday: activeUsersToday },
        instances: { total: totalInstances, connected: connectedInstances },
        revenue: { mtd: revenueMTD, currency: 'IDR' },
        messages: { today: messagesTodayResult, thisMonth: messagesResult, successRate: 100 },
      },
    };
  });

  // ============================================
  // ORGANIZATIONS
  // ============================================

  /**
   * GET /admin/organizations — List all organizations
   */
  fastify.get('/organizations', async (request: FastifyRequest<{
    Querystring: { page?: string; limit?: string; search?: string; status?: string };
  }>, reply) => {
    const { page = '1', limit = '20', search, status } = request.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: any = { deleted_at: null };
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { slug: { contains: search } },
        { email: { contains: search } },
      ];
    }
    if (status) {
      where.subscription_status = status;
    }

    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        skip,
        take,
        include: {
          users: { select: { id: true, role: true }, where: { deleted_at: null } },
          whatsapp_instances: { select: { id: true, status: true }, where: { deleted_at: null } },
          subscription_plan: { select: { id: true, name: true, price: true } },
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.organization.count({ where }),
    ]);

    const data = organizations.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      email: org.email,
      subscription_status: org.subscription_status,
      is_active: org.is_active,
      plan: org.subscription_plan ? {
        name: org.subscription_plan.name,
        price: org.subscription_plan.price?.toString(),
      } : null,
      stats: {
        users: org.users.length,
        instances: org.whatsapp_instances.length,
      },
      owner: org.users.find((u) => u.role === UserRole.ORG_OWNER),
      created_at: org.created_at,
    }));

    return {
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  });

  /**
   * GET /admin/organizations/:id — Get organization details
   */
  fastify.get('/organizations/:id', async (request: FastifyRequest<{
    Params: { id: string };
  }>, reply) => {
    const { id } = request.params;

    const org = await prisma.organization.findFirst({
      where: { id, deleted_at: null },
      include: {
        users: {
          where: { deleted_at: null },
          select: { id: true, email: true, full_name: true, role: true, is_active: true, last_login_at: true, created_at: true },
        },
        whatsapp_instances: {
          where: { deleted_at: null },
          select: { id: true, name: true, status: true, phone_number: true, created_at: true },
        },
        subscription_plan: true,
        subscriptions: { orderBy: { created_at: 'desc' }, take: 5 },
        invoices: { orderBy: { created_at: 'desc' }, take: 10 },
      },
    });

    if (!org) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } });
    }

    return { success: true, data: org };
  });

  /**
   * PATCH /admin/organizations/:id — Update organization (suspend/activate)
   */
  fastify.patch('/organizations/:id', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { is_active?: boolean; subscription_status?: string; max_instances?: number; max_contacts?: number; max_messages_per_day?: number };
  }>, reply) => {
    const { id } = request.params;
    const body = request.body || {};

    const org = await prisma.organization.findFirst({ where: { id, deleted_at: null } });
    if (!org) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } });
    }

    const updateData: any = {};
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.subscription_status) updateData.subscription_status = body.subscription_status;
    if (body.max_instances !== undefined) updateData.max_instances = body.max_instances;
    if (body.max_contacts !== undefined) updateData.max_contacts = body.max_contacts;
    if (body.max_messages_per_day !== undefined) updateData.max_messages_per_day = body.max_messages_per_day;

    const updated = await prisma.organization.update({ where: { id }, data: updateData });

    logger.info({ orgId: id, changes: updateData }, 'Admin updated organization');
    return { success: true, data: updated };
  });

  // ============================================
  // USERS
  // ============================================

  /**
   * GET /admin/users — List all users
   */
  fastify.get('/users', async (request: FastifyRequest<{
    Querystring: { page?: string; limit?: string; search?: string; role?: string; status?: string };
  }>, reply) => {
    const { page = '1', limit = '20', search, role, status } = request.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: any = { deleted_at: null };
    if (search) {
      where.OR = [
        { full_name: { contains: search } },
        { email: { contains: search } },
      ];
    }
    if (role) {
      where.role = role;
    }
    if (status === 'ACTIVE') {
      where.is_active = true;
    } else if (status === 'INACTIVE' || status === 'SUSPENDED') {
      where.is_active = false;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          email: true,
          full_name: true,
          phone: true,
          role: true,
          is_active: true,
          is_email_verified: true,
          last_login_at: true,
          created_at: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  });

  // ============================================
  // INSTANCES
  // ============================================

  /**
   * GET /admin/instances — List all WhatsApp instances across all orgs
   */
  fastify.get('/instances', async (request: FastifyRequest<{
    Querystring: { page?: string; limit?: string; status?: string };
  }>, reply) => {
    const { page = '1', limit = '20', status } = request.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: any = { deleted_at: null };
    if (status) {
      where.status = status;
    }

    const [instances, total] = await Promise.all([
      prisma.whatsAppInstance.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          name: true,
          phone_number: true,
          status: true,
          is_active: true,
          created_at: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.whatsAppInstance.count({ where }),
    ]);

    return {
      success: true,
      data: instances,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  });

  // ============================================
  // INVOICES (proxy to existing admin endpoints)
  // ============================================

  /**
   * GET /admin/invoices — List all invoices
   */
  fastify.get('/invoices', async (request: FastifyRequest<{
    Querystring: { page?: string; limit?: string; status?: string };
  }>, reply) => {
    const { page = '1', limit = '20', status } = request.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take,
        include: {
          organization: { select: { id: true, name: true, slug: true } },
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.invoice.count({ where }),
    ]);

    return {
      success: true,
      data: invoices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  });

  /**
   * POST /admin/invoices/:id/verify — Verify/approve manual payment
   */
  fastify.post('/invoices/:id/verify', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { status: string; notes?: string };
  }>, reply) => {
    const { id } = request.params;
    const { status: newStatus, notes } = request.body || {} as any;

    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
    }

    if (invoice.status !== InvoiceStatus.PENDING) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_STATUS', message: `Cannot verify invoice with status ${invoice.status}` } });
    }

    const validStatuses = ['PAID', 'FAILED', 'CANCELED'];
    if (!validStatuses.includes(newStatus)) {
      return reply.status(400).send({ success: false, error: { code: 'INVALID_STATUS', message: `Status must be one of: ${validStatuses.join(', ')}` } });
    }

    const updateData: any = {
      status: newStatus as InvoiceStatus,
      payment_notes: notes || null,
    };

    if (newStatus === 'PAID') {
      updateData.paid_at = new Date();

      // Activate subscription if invoice is paid
      if (invoice.organization_id) {
        await prisma.organization.update({
          where: { id: invoice.organization_id },
          data: { subscription_status: 'ACTIVE' },
        });
      }
    }

    const updated = await prisma.invoice.update({ where: { id }, data: updateData });

    logger.info({ invoiceId: id, newStatus, notes }, 'Admin verified invoice');
    return { success: true, data: updated };
  });

  // ============================================
  // SYSTEM HEALTH
  // ============================================

  /**
   * GET /admin/health — System health check
   */
  fastify.get('/health', async (request, reply) => {
    const health: any = {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services: {},
    };

    // Database check
    try {
      await prisma.$queryRaw`SELECT 1`;
      health.services.database = { status: 'healthy', latency: 0 };
    } catch (err) {
      health.services.database = { status: 'down', error: 'Connection failed' };
      health.status = 'degraded';
    }

    // Redis check
    try {
      if (isRedisAvailable() && redis) {
        const start = Date.now();
        await redis.ping();
        const latency = Date.now() - start;
        health.services.redis = { status: 'healthy', latency };
      } else {
        health.services.redis = { status: 'down', error: 'Not connected' };
        health.status = 'degraded';
      }
    } catch (err) {
      health.services.redis = { status: 'down', error: 'Connection failed' };
      health.status = 'degraded';
    }

    // System resources
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    health.resources = {
      cpu: os.loadavg()[0],
      memory: { total: totalMem, free: freeMem, usedPercent: Math.round(((totalMem - freeMem) / totalMem) * 100) },
    };

    return { success: true, data: health };
  });

  // ============================================
  // AUDIT LOGS (placeholder — returns empty for now)
  // ============================================

  /**
   * GET /admin/audit-logs — Placeholder for future audit trail
   */
  fastify.get('/audit-logs', async (request: FastifyRequest<{
    Querystring: { page?: string; limit?: string };
  }>, reply) => {
    return {
      success: true,
      data: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    };
  });
}
