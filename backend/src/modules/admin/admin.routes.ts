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
import { createAuditLog } from '../../utils/audit';

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
        // Flat fields expected by frontend admin dashboard
        total_organizations: totalOrganizations,
        new_organizations_this_month: newOrgsThisMonth,
        total_users: totalUsers,
        active_users_today: activeUsersToday,
        total_instances: totalInstances,
        connected_instances: connectedInstances,
        revenue_this_month: revenueMTD,
        mrr: revenueMTD, // simplified MRR = current MTD revenue
        messages_today: messagesTodayResult,
        messages_this_month: messagesResult,
        message_success_rate: 100,
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
          users: {
            select: { id: true, role: true, full_name: true, email: true },
            where: { deleted_at: null },
          },
          whatsapp_instances: { select: { id: true, status: true }, where: { deleted_at: null } },
          subscription_plan: { select: { id: true, name: true, price: true } },
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.organization.count({ where }),
    ]);

    const data = organizations.map((org) => {
      const ownerUser = org.users.find((u) => u.role === UserRole.ORG_OWNER);
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        email: org.email,
        // Expose as both 'status' and 'subscription_status' for full compatibility
        status: org.subscription_status,
        subscription_status: org.subscription_status,
        is_active: org.is_active,
        plan: org.subscription_plan ? {
          id: org.subscription_plan.id,
          name: org.subscription_plan.name,
          // Return as number so formatCurrency() on FE works without coercion
          price: org.subscription_plan.price ? Number(org.subscription_plan.price) : 0,
        } : null,
        stats: {
          users_count: org.users.length,
          instances_count: org.whatsapp_instances.length,
          // users/instances aliases kept for backward compatibility
          users: org.users.length,
          instances: org.whatsapp_instances.length,
        },
        owner: {
          id: ownerUser?.id ?? null,
          name: ownerUser?.full_name ?? 'Unknown',
          email: ownerUser?.email ?? '',
        },
        created_at: org.created_at,
      };
    });

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

    const old_values = Object.fromEntries(Object.keys(updateData).map((k) => [k, (org as Record<string, unknown>)[k]]));

    const updated = await prisma.organization.update({ where: { id }, data: updateData });

    logger.info({ orgId: id, changes: updateData }, 'Admin updated organization');

    // Audit log — fire-and-warn, never blocks the main response
    const adminUser = (request as any).user;
    void createAuditLog({
      organization_id: id,
      user_id: adminUser?.userId ?? null,
      action: 'org.update',
      resource_type: 'organization',
      resource_id: id,
      old_values,
      new_values: updateData,
      ip_address: request.ip,
      user_agent: request.headers?.['user-agent'] as string | undefined,
    });

    return { success: true, data: updated };
  });

  /**
   * POST /admin/organizations/:id/assign-plan — Assign a subscription plan directly
   * Handles: subscription_plan_id sync, org limit fields, subscription_status = ACTIVE.
   * Creates/replaces the Subscription record so billing history is preserved.
   */
  fastify.post('/organizations/:id/assign-plan', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { plan_id: string };
  }>, reply) => {
    const { id } = request.params;
    const { plan_id } = request.body || {};

    if (!plan_id) {
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'plan_id is required' } });
    }

    const [org, plan] = await Promise.all([
      prisma.organization.findFirst({ where: { id, deleted_at: null } }),
      prisma.subscriptionPlan.findUnique({ where: { id: plan_id } }),
    ]);

    if (!org) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Organization not found' } });
    }
    if (!plan) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Subscription plan not found' } });
    }
    if (!plan.is_active) {
      return reply.status(400).send({ success: false, error: { code: 'PLAN_INACTIVE', message: 'Subscription plan is not active' } });
    }

    // Cancel any existing active subscriptions then create a new one
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()); // 1 month

    await prisma.$transaction(async (tx) => {
      // Mark any existing ACTIVE/TRIAL subscriptions as CANCELED
      await tx.subscription.updateMany({
        where: {
          organization_id: id,
          status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] },
        },
        data: { status: 'CANCELED', canceled_at: now },
      });

      // Create new Subscription record for billing history
      await tx.subscription.create({
        data: {
          organization_id: id,
          plan_id: plan.id,
          status: 'ACTIVE',
          current_period_start: now,
          current_period_end: periodEnd,
          price: plan.price,
          currency: plan.currency,
          billing_period: plan.billing_period,
        },
      });

      // Update organization with new plan and synced limits
      await tx.organization.update({
        where: { id },
        data: {
          subscription_plan_id: plan.id,
          subscription_status: 'ACTIVE',
          max_instances: plan.max_instances,
          max_contacts: plan.max_contacts,
          max_messages_per_day: plan.max_messages_per_day,
        },
      });
    });

    logger.info({ orgId: id, planId: plan_id, planName: plan.name }, 'Admin assigned plan to organization');

    // Audit log — fire-and-warn
    const adminUser = (request as any).user;
    void createAuditLog({
      organization_id: id,
      user_id: adminUser?.userId ?? null,
      action: 'org.assign_plan',
      resource_type: 'organization',
      resource_id: id,
      old_values: {
        subscription_plan_id: org.subscription_plan_id,
        subscription_status: org.subscription_status,
      },
      new_values: {
        subscription_plan_id: plan.id,
        plan_name: plan.name,
        subscription_status: 'ACTIVE',
      },
      ip_address: request.ip,
      user_agent: request.headers?.['user-agent'] as string | undefined,
    });

    return {
      success: true,
      data: { plan_id: plan.id, plan_name: plan.name },
      message: `Plan "${plan.name}" assigned successfully`,
    };
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
      // Map frontend role names to Prisma UserRole enum
      const roleMap: Record<string, string> = {
        SUPER_ADMIN: 'SUPER_ADMIN',
        OWNER: 'ORG_OWNER',
        ADMIN: 'ORG_ADMIN',
        MEMBER: 'ORG_MEMBER',
        // Also accept exact enum values
        ORG_OWNER: 'ORG_OWNER',
        ORG_ADMIN: 'ORG_ADMIN',
        ORG_MEMBER: 'ORG_MEMBER',
      };
      where.role = roleMap[role] || role;
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

    // Transform users to match frontend field expectations
    const transformedUsers = users.map((u) => ({
      ...u,
      name: u.full_name,
      status: u.is_active ? 'ACTIVE' : 'INACTIVE',
    }));

    return {
      success: true,
      data: {
        users: transformedUsers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / take),
        },
      },
    };
  });

  /**
   * PATCH /admin/users/:id — Update user (suspend/activate/change role)
   */
  fastify.patch('/users/:id', async (request: FastifyRequest<{
    Params: { id: string };
    Body: { is_active?: boolean; role?: string };
  }>, reply) => {
    const { id } = request.params;
    const body = request.body || {};

    const user = await prisma.user.findFirst({ where: { id, deleted_at: null } });
    if (!user) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const updateData: any = {};
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.role) {
      // Map frontend role names to Prisma enum
      const roleMap: Record<string, string> = {
        SUPER_ADMIN: 'SUPER_ADMIN',
        OWNER: 'ORG_OWNER',
        ADMIN: 'ORG_ADMIN',
        MEMBER: 'ORG_MEMBER',
        ORG_OWNER: 'ORG_OWNER',
        ORG_ADMIN: 'ORG_ADMIN',
        ORG_MEMBER: 'ORG_MEMBER',
      };
      updateData.role = roleMap[body.role] || body.role;
    }

    const updated = await prisma.user.update({ where: { id }, data: updateData });

    logger.info({ userId: id, changes: updateData }, 'Admin updated user');

    const adminUser = (request as any).user;
    void createAuditLog({
      organization_id: updated.organization_id,
      user_id: adminUser?.userId ?? null,
      action: 'user.update',
      resource_type: 'user',
      resource_id: id,
      old_values: { is_active: user.is_active, role: user.role },
      new_values: updateData,
      ip_address: request.ip,
      user_agent: request.headers?.['user-agent'] as string | undefined,
    });

    return {
      success: true,
      data: { ...updated, name: updated.full_name, status: updated.is_active ? 'ACTIVE' : 'INACTIVE' },
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
  // INVOICES — Handled by /api/invoices/admin/* (invoices.routes.ts)
  // No duplicate routes here. Frontend calls /api/invoices/admin/all
  // and /api/invoices/admin/:invoiceId/verify directly.
  // ============================================

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

    // System resources — flat fields expected by frontend
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memoryUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);
    health.resources = {
      cpu_usage: Math.round(os.loadavg()[0] * 100) / 100,
      memory_usage: memoryUsage,
      disk_usage: 0, // disk usage requires platform-specific call; placeholder
    };

    return { success: true, data: health };
  });

  // ============================================
  // AUDIT LOGS
  // ============================================

  /**
   * GET /admin/audit-logs — Real audit trail with pagination + filters
   */
  fastify.get('/audit-logs', async (request: FastifyRequest<{
    Querystring: {
      page?: string;
      limit?: string;
      organization_id?: string;
      action?: string;
      resource_type?: string;
    };
  }>, reply) => {
    const { page = '1', limit = '20', organization_id, action, resource_type } = request.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};
    if (organization_id) where.organization_id = organization_id;
    if (action) where.action = { contains: action };
    if (resource_type) where.resource_type = resource_type;

    const [logs, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limitNum,
        include: {
          user: { select: { id: true, full_name: true, email: true } },
          organization: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      success: true,
      data: { logs },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  });
}
