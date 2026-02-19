/**
 * Webhooks Module - Service Layer
 * @module webhooks/service
 */

import { FastifyInstance } from 'fastify';
import prisma from '../../config/database';
import logger from '../../config/logger';
import { AppError } from '../../types';
import { WebhookStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import crypto from 'crypto';
import {
  ConfigureWebhookInput,
  ListWebhooksQuery,
  GetWebhookLogsQuery,
  SendWebhookInput,
  WebhookPayload,
  WEBHOOK_EVENTS,
  WebhookEventType,
} from './webhooks.schema';
import { WEBHOOK_CONFIG } from '../../config/constants';

// ============================================
// REDIS CONNECTION FOR BULLMQ
// ============================================

import redisConnectionOptions from '../../config/redis-connection';

// ============================================
// WEBHOOK QUEUE
// ============================================

let webhookQueue: Queue | null = null;

function getWebhookQueue(): Queue {
  if (!webhookQueue) {
    webhookQueue = new Queue('webhooks', {
      connection: redisConnectionOptions,
      defaultJobOptions: {
        attempts: WEBHOOK_CONFIG.MAX_ATTEMPTS,
        backoff: {
          type: WEBHOOK_CONFIG.BACKOFF_TYPE,
          delay: WEBHOOK_CONFIG.INITIAL_DELAY_MS,
        },
        removeOnComplete: {
          count: WEBHOOK_CONFIG.REMOVE_ON_COMPLETE_COUNT,
          age: WEBHOOK_CONFIG.REMOVE_ON_COMPLETE_AGE_S,
        },
        removeOnFail: {
          count: WEBHOOK_CONFIG.REMOVE_ON_FAIL_COUNT,
        },
      },
    });
  }
  return webhookQueue;
}

// ============================================
// WEBHOOK SERVICE
// ============================================

export class WebhookService {
  constructor(private readonly fastify?: FastifyInstance) {}

  // ============================================
  // WEBHOOK CONFIGURATION
  // ============================================

  /**
   * Configure webhook for an instance
   */
  async configureWebhook(
    organizationId: string,
    input: ConfigureWebhookInput
  ): Promise<{
    instance_id: string;
    webhook_url: string | null;
    webhook_events: string[] | null;
    webhook_secret_configured: boolean;
  }> {
    // Verify instance belongs to organization
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: input.instance_id,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (!instance) {
      throw new AppError('Instance not found', 404, 'INSTANCE_NOT_FOUND');
    }

    // Update webhook configuration
    const updated = await prisma.whatsAppInstance.update({
      where: { id: input.instance_id },
      data: {
        webhook_url: input.webhook_url,
        webhook_events: input.webhook_events || Prisma.JsonNull,
        webhook_secret: input.webhook_secret,
      },
      select: {
        id: true,
        webhook_url: true,
        webhook_events: true,
        webhook_secret: true,
      },
    });

    logger.info({ instanceId: input.instance_id }, 'Webhook configured');

    return {
      instance_id: updated.id,
      webhook_url: updated.webhook_url,
      webhook_events: updated.webhook_events as string[] | null,
      webhook_secret_configured: !!updated.webhook_secret,
    };
  }

  /**
   * Get webhook configuration for an instance
   */
  async getWebhookConfig(
    organizationId: string,
    instanceId: string
  ): Promise<{
    instance_id: string;
    webhook_url: string | null;
    webhook_events: string[] | null;
    webhook_secret_configured: boolean;
  }> {
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: instanceId,
        organization_id: organizationId,
        deleted_at: null,
      },
      select: {
        id: true,
        webhook_url: true,
        webhook_events: true,
        webhook_secret: true,
      },
    });

    if (!instance) {
      throw new AppError('Instance not found', 404, 'INSTANCE_NOT_FOUND');
    }

    return {
      instance_id: instance.id,
      webhook_url: instance.webhook_url,
      webhook_events: instance.webhook_events as string[] | null,
      webhook_secret_configured: !!instance.webhook_secret,
    };
  }

  /**
   * Test webhook endpoint
   */
  async testWebhook(
    organizationId: string,
    instanceId: string
  ): Promise<{ success: boolean; response_status?: number; error?: string }> {
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: instanceId,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (!instance) {
      throw new AppError('Instance not found', 404, 'INSTANCE_NOT_FOUND');
    }

    if (!instance.webhook_url) {
      throw new AppError('Webhook URL not configured', 400, 'WEBHOOK_NOT_CONFIGURED');
    }

    const testPayload: WebhookPayload = {
      event: 'connection.connected',
      timestamp: new Date().toISOString(),
      instance_id: instanceId,
      organization_id: organizationId,
      data: {
        status: 'test',
        message: 'This is a test webhook from WhatsApp SaaS',
      },
    };

    try {
      const result = await this.deliverWebhook(
        instance.webhook_url,
        testPayload,
        instance.webhook_secret
      );
      
      return {
        success: result.success,
        response_status: result.responseStatus,
        error: result.error,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ============================================
  // WEBHOOK DELIVERY
  // ============================================

  // ============================================
  // WEBHOOK CONFIG CRUD (for frontend Webhooks page)
  // ============================================

  /**
   * List all webhook configurations across instances
   * Returns instances that have webhook_url configured
   */
  async listWebhookConfigs(
    organizationId: string,
    params?: { instance_id?: string; page?: number; limit?: number }
  ): Promise<{
    data: any[];
    pagination: { total: number; page: number; limit: number; total_pages: number };
  }> {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      organization_id: organizationId,
      deleted_at: null,
      webhook_url: { not: null },
    };
    if (params?.instance_id) {
      where.id = params.instance_id;
    }

    const [instances, total] = await Promise.all([
      prisma.whatsAppInstance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updated_at: 'desc' },
        select: {
          id: true,
          name: true,
          webhook_url: true,
          webhook_events: true,
          webhook_secret: true,
          is_active: true,
          created_at: true,
          updated_at: true,
          webhooks: {
            orderBy: { created_at: 'desc' },
            take: 1,
            select: { created_at: true, status: true },
          },
        },
      }),
      prisma.whatsAppInstance.count({ where }),
    ]);

    const data = instances.map((inst) => ({
      id: inst.id, // Use instance_id as the webhook config ID
      instance_id: inst.id,
      instance_name: inst.name,
      url: inst.webhook_url,
      events: Array.isArray(inst.webhook_events)
        ? (inst.webhook_events as string[]).filter(e => typeof e === 'string' && e.length > 1)
        : [],
      is_active: inst.is_active && !!inst.webhook_url,
      secret: inst.webhook_secret ? '••••••••' : undefined,
      last_triggered_at: inst.webhooks[0]?.created_at?.toISOString() || null,
      created_at: inst.created_at.toISOString(),
    }));

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Create webhook config (set webhook on an instance)
   */
  async createWebhookConfig(
    organizationId: string,
    input: { instance_id: string; url: string; events: string[] }
  ): Promise<any> {
    const instance = await prisma.whatsAppInstance.findFirst({
      where: { id: input.instance_id, organization_id: organizationId, deleted_at: null },
    });
    if (!instance) {
      throw new AppError('Instance not found', 404, 'INSTANCE_NOT_FOUND');
    }
    if (instance.webhook_url) {
      throw new AppError('Webhook already configured for this instance. Use update instead.', 400, 'WEBHOOK_EXISTS');
    }

    const updated = await prisma.whatsAppInstance.update({
      where: { id: input.instance_id },
      data: {
        webhook_url: input.url,
        webhook_events: input.events,
      },
      select: { id: true, name: true, webhook_url: true, webhook_events: true, is_active: true, created_at: true },
    });

    logger.info({ instanceId: input.instance_id }, 'Webhook config created');

    return {
      id: updated.id,
      instance_id: updated.id,
      instance_name: updated.name,
      url: updated.webhook_url,
      events: updated.webhook_events as string[],
      is_active: updated.is_active && !!updated.webhook_url,
      created_at: updated.created_at.toISOString(),
    };
  }

  /**
   * Update webhook config
   */
  async updateWebhookConfig(
    organizationId: string,
    instanceId: string,
    input: { url?: string; events?: string[]; is_active?: boolean }
  ): Promise<any> {
    const instance = await prisma.whatsAppInstance.findFirst({
      where: { id: instanceId, organization_id: organizationId, deleted_at: null },
    });
    if (!instance) {
      throw new AppError('Instance not found', 404, 'INSTANCE_NOT_FOUND');
    }

    const data: any = {};
    if (input.url !== undefined) data.webhook_url = input.url;
    if (input.events !== undefined) data.webhook_events = input.events;
    if (input.is_active !== undefined) data.is_active = input.is_active;

    const updated = await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data,
      select: { id: true, name: true, webhook_url: true, webhook_events: true, is_active: true, created_at: true },
    });

    logger.info({ instanceId }, 'Webhook config updated');

    return {
      id: updated.id,
      instance_id: updated.id,
      instance_name: updated.name,
      url: updated.webhook_url,
      events: updated.webhook_events as string[],
      is_active: updated.is_active && !!updated.webhook_url,
      created_at: updated.created_at.toISOString(),
    };
  }

  /**
   * Delete webhook config (clear webhook from instance)
   */
  async deleteWebhookConfig(
    organizationId: string,
    instanceId: string
  ): Promise<void> {
    const instance = await prisma.whatsAppInstance.findFirst({
      where: { id: instanceId, organization_id: organizationId, deleted_at: null },
    });
    if (!instance) {
      throw new AppError('Instance not found', 404, 'INSTANCE_NOT_FOUND');
    }

    await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: {
        webhook_url: null,
        webhook_events: Prisma.JsonNull,
        webhook_secret: null,
      },
    });

    logger.info({ instanceId }, 'Webhook config deleted');
  }

  // ============================================
  // WEBHOOK DELIVERY
  // ============================================

  /**
   * Queue webhook for delivery
   */
  async queueWebhook(input: SendWebhookInput): Promise<string> {
    // Get instance with webhook config
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: input.instance_id,
        organization_id: input.organization_id,
        deleted_at: null,
      },
    });

    if (!instance || !instance.webhook_url) {
      logger.info(
        { instanceId: input.instance_id, eventType: input.event_type, hasUrl: !!instance?.webhook_url },
        '⚠️ Webhook skip: no URL configured'
      );
      return '';
    }

    // Filter webhook_events: only keep valid event strings (no single digit garbage)
    const rawEvents = instance.webhook_events as string[] | null;
    const subscribedEvents = rawEvents
      ? rawEvents.filter(e => typeof e === 'string' && e.length > 1)
      : null;

    if (subscribedEvents && subscribedEvents.length > 0) {
      // Match both exact (e.g. 'message.received') and prefix (e.g. 'message' matches 'message.received')
      const isSubscribed = subscribedEvents.some(evt => 
        input.event_type === evt || input.event_type.startsWith(evt + '.')
      );
      if (!isSubscribed) {
        logger.info(
          { instanceId: input.instance_id, eventType: input.event_type, subscribedEvents },
          '⚠️ Webhook skip: event not subscribed'
        );
        return '';
      }
    }

    logger.info(
      { instanceId: input.instance_id, eventType: input.event_type, webhookUrl: instance.webhook_url },
      '📤 Queuing webhook for delivery'
    );

    // Create webhook record
    const webhook = await prisma.webhook.create({
      data: {
        organization_id: input.organization_id,
        instance_id: input.instance_id,
        event_type: input.event_type,
        payload: input.payload,
        idempotency_key: input.idempotency_key,
        status: 'PENDING',
      },
    });

    // Queue for delivery
    const queue = getWebhookQueue();
    await queue.add(
      'deliver-webhook',
      {
        webhookId: webhook.id,
        webhookUrl: instance.webhook_url,
        webhookSecret: instance.webhook_secret,
        payload: {
          event: input.event_type,
          timestamp: new Date().toISOString(),
          instance_id: input.instance_id,
          organization_id: input.organization_id,
          data: input.payload,
        },
      },
      {
        jobId: webhook.id,
      }
    );

    logger.info(
      { webhookId: webhook.id, eventType: input.event_type },
      'Webhook queued for delivery'
    );

    return webhook.id;
  }

  /**
   * Deliver webhook immediately (used by worker)
   */
  async deliverWebhook(
    url: string,
    payload: WebhookPayload,
    secret?: string | null
  ): Promise<{
    success: boolean;
    responseStatus?: number;
    responseBody?: string;
    error?: string;
    durationMs: number;
  }> {
    const startTime = Date.now();
    const body = JSON.stringify(payload);

    // Generate signature
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'WhatsApp-SaaS-Webhook/1.0',
      'X-Webhook-Event': payload.event,
      'X-Webhook-Timestamp': payload.timestamp,
    };

    if (secret) {
      const signature = this.generateSignature(body, secret);
      headers['X-Webhook-Signature'] = signature;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WEBHOOK_CONFIG.TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const durationMs = Date.now() - startTime;
      const responseBody = await response.text();

      return {
        success: response.ok,
        responseStatus: response.status,
        responseBody: responseBody.substring(0, WEBHOOK_CONFIG.RESPONSE_TRUNCATE_LENGTH),
        durationMs,
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      
      return {
        success: false,
        error: error.name === 'AbortError' ? 'Request timeout' : error.message,
        durationMs,
      };
    }
  }

  /**
   * Generate HMAC signature for webhook
   */
  generateSignature(payload: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  /**
   * Update webhook status after delivery attempt
   */
  async updateWebhookStatus(
    webhookId: string,
    success: boolean,
    attemptNumber: number,
    result: {
      responseStatus?: number;
      responseBody?: string;
      error?: string;
      durationMs: number;
    }
  ): Promise<void> {
    const webhook = await prisma.webhook.findUnique({
      where: { id: webhookId },
    });

    if (!webhook) {
      return;
    }

    // Create log entry
    await prisma.webhookLog.create({
      data: {
        organization_id: webhook.organization_id,
        webhook_id: webhookId,
        attempt_number: attemptNumber,
        request_body: webhook.payload as Prisma.InputJsonValue,
        response_status: result.responseStatus,
        response_body: result.responseBody,
        duration_ms: result.durationMs,
        error_message: result.error,
      },
    });

    // Update webhook status
    const now = new Date();
    if (success) {
      await prisma.webhook.update({
        where: { id: webhookId },
        data: {
          status: 'DELIVERED',
          attempts: attemptNumber,
          last_attempt_at: now,
          delivered_at: now,
          response_status: result.responseStatus,
          response_body: result.responseBody,
        },
      });
    } else {
      const isMaxAttempts = attemptNumber >= webhook.max_attempts;
      
      await prisma.webhook.update({
        where: { id: webhookId },
        data: {
          status: isMaxAttempts ? 'FAILED' : 'PROCESSING',
          attempts: attemptNumber,
          last_attempt_at: now,
          failed_at: isMaxAttempts ? now : null,
          response_status: result.responseStatus,
          response_body: result.responseBody,
          error_message: result.error,
          // PATCH-101: Add jitter (±25%) to prevent thundering herd on mass webhook failure
          next_retry_at: isMaxAttempts ? null : new Date(now.getTime() + Math.pow(2, attemptNumber) * WEBHOOK_CONFIG.BACKOFF_BASE_MS * (0.75 + Math.random() * 0.5)),
        },
      });
    }
  }

  // ============================================
  // WEBHOOK HISTORY
  // ============================================

  /**
   * List webhooks with pagination
   */
  async listWebhooks(
    organizationId: string,
    query: ListWebhooksQuery
  ): Promise<{
    data: any[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      total_pages: number;
    };
  }> {
    const { instance_id, status, event_type, page, limit, start_date, end_date } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      organization_id: organizationId,
    };

    if (instance_id) {
      where.instance_id = instance_id;
    }

    if (status) {
      where.status = status;
    }

    if (event_type) {
      where.event_type = event_type;
    }

    if (start_date || end_date) {
      where.created_at = {};
      if (start_date) {
        where.created_at.gte = new Date(start_date);
      }
      if (end_date) {
        where.created_at.lte = new Date(end_date);
      }
    }

    const [webhooks, total] = await Promise.all([
      prisma.webhook.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          instance_id: true,
          event_type: true,
          status: true,
          attempts: true,
          max_attempts: true,
          response_status: true,
          error_message: true,
          created_at: true,
          delivered_at: true,
          failed_at: true,
        },
      }),
      prisma.webhook.count({ where }),
    ]);

    return {
      data: webhooks,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get webhook by ID with logs
   */
  async getWebhook(
    organizationId: string,
    webhookId: string
  ): Promise<any> {
    const webhook = await prisma.webhook.findFirst({
      where: {
        id: webhookId,
        organization_id: organizationId,
      },
      include: {
        webhook_logs: {
          orderBy: { created_at: 'desc' },
          take: 10,
        },
      },
    });

    if (!webhook) {
      throw new AppError('Webhook not found', 404, 'WEBHOOK_NOT_FOUND');
    }

    return webhook;
  }

  /**
   * Get webhook logs
   */
  async getWebhookLogs(
    organizationId: string,
    query: GetWebhookLogsQuery
  ): Promise<{
    data: any[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      total_pages: number;
    };
  }> {
    const { webhook_id, page, limit } = query;
    const skip = (page - 1) * limit;

    // Verify webhook belongs to organization
    const webhook = await prisma.webhook.findFirst({
      where: {
        id: webhook_id,
        organization_id: organizationId,
      },
    });

    if (!webhook) {
      throw new AppError('Webhook not found', 404, 'WEBHOOK_NOT_FOUND');
    }

    const [logs, total] = await Promise.all([
      prisma.webhookLog.findMany({
        where: { webhook_id },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      prisma.webhookLog.count({ where: { webhook_id } }),
    ]);

    return {
      data: logs,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retry failed webhook
   */
  async retryWebhook(
    organizationId: string,
    webhookId: string
  ): Promise<{ success: boolean; message: string }> {
    const webhook = await prisma.webhook.findFirst({
      where: {
        id: webhookId,
        organization_id: organizationId,
      },
      include: {
        instance: true,
      },
    });

    if (!webhook) {
      throw new AppError('Webhook not found', 404, 'WEBHOOK_NOT_FOUND');
    }

    if (webhook.status === 'DELIVERED') {
      throw new AppError('Webhook already delivered', 400, 'ALREADY_DELIVERED');
    }

    if (!webhook.instance.webhook_url) {
      throw new AppError('Instance webhook URL not configured', 400, 'WEBHOOK_NOT_CONFIGURED');
    }

    // Reset attempts and queue for delivery
    await prisma.webhook.update({
      where: { id: webhookId },
      data: {
        status: 'PENDING',
        attempts: 0,
        next_retry_at: null,
        failed_at: null,
        error_message: null,
      },
    });

    // Re-queue for delivery
    const queue = getWebhookQueue();
    await queue.add(
      'deliver-webhook',
      {
        webhookId: webhook.id,
        webhookUrl: webhook.instance.webhook_url,
        webhookSecret: webhook.instance.webhook_secret,
        payload: {
          event: webhook.event_type,
          timestamp: new Date().toISOString(),
          instance_id: webhook.instance_id,
          organization_id: webhook.organization_id,
          data: webhook.payload,
        },
      },
      {
        jobId: `${webhook.id}-retry-${Date.now()}`,
      }
    );

    logger.info({ webhookId }, 'Webhook retry queued');

    return {
      success: true,
      message: 'Webhook retry queued successfully',
    };
  }

  // ============================================
  // WEBHOOK STATISTICS
  // ============================================

  /**
   * Get webhook statistics
   */
  async getWebhookStats(
    organizationId: string,
    instanceId?: string
  ): Promise<{
    total: number;
    delivered: number;
    failed: number;
    pending: number;
    delivery_rate: number;
  }> {
    const where: any = { organization_id: organizationId };
    if (instanceId) {
      where.instance_id = instanceId;
    }

    const [total, delivered, failed, pending] = await Promise.all([
      prisma.webhook.count({ where }),
      prisma.webhook.count({ where: { ...where, status: 'DELIVERED' } }),
      prisma.webhook.count({ where: { ...where, status: 'FAILED' } }),
      prisma.webhook.count({ where: { ...where, status: { in: ['PENDING', 'PROCESSING'] } } }),
    ]);

    return {
      total,
      delivered,
      failed,
      pending,
      delivery_rate: total > 0 ? Math.round((delivered / total) * 100) : 0,
    };
  }

  // ============================================
  // HELPER: Emit webhook from anywhere
  // ============================================

  /**
   * Helper static method to emit webhook from any service
   */
  static async emit(
    instanceId: string,
    organizationId: string,
    eventType: WebhookEventType,
    data: Record<string, any>,
    idempotencyKey?: string
  ): Promise<void> {
    try {
      // Get instance with webhook config
      const instance = await prisma.whatsAppInstance.findFirst({
        where: {
          id: instanceId,
          organization_id: organizationId,
          deleted_at: null,
        },
      });

      if (!instance || !instance.webhook_url) {
        return;
      }

      // Check if event type is subscribed
      const rawSubscribedEvents = instance.webhook_events as string[] | null;
      const subscribedEvents = rawSubscribedEvents
        ? rawSubscribedEvents.filter(e => typeof e === 'string' && e.length > 1)
        : null;
      if (subscribedEvents && subscribedEvents.length > 0) {
        const isSubscribed = subscribedEvents.some(evt => 
          eventType === evt || eventType.startsWith(evt + '.')
        );
        if (!isSubscribed) {
          return;
        }
      }

      // Create webhook record and queue
      const webhook = await prisma.webhook.create({
        data: {
          organization_id: organizationId,
          instance_id: instanceId,
          event_type: eventType,
          payload: data,
          idempotency_key: idempotencyKey,
          status: 'PENDING',
        },
      });

      const queue = getWebhookQueue();
      await queue.add(
        'deliver-webhook',
        {
          webhookId: webhook.id,
          webhookUrl: instance.webhook_url,
          webhookSecret: instance.webhook_secret,
          payload: {
            event: eventType,
            timestamp: new Date().toISOString(),
            instance_id: instanceId,
            organization_id: organizationId,
            data,
          },
        },
        {
          jobId: webhook.id,
        }
      );

      logger.debug(
        { webhookId: webhook.id, eventType },
        'Webhook emitted'
      );
    } catch (error) {
      logger.error({ error, instanceId, eventType }, 'Failed to emit webhook');
    }
  }
}

// ============================================
// EXPORT
// ============================================

export function createWebhookService(fastify?: FastifyInstance): WebhookService {
  return new WebhookService(fastify);
}
