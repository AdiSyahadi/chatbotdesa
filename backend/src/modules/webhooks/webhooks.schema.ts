/**
 * Webhooks Module - Validation Schemas
 * @module webhooks/schemas
 */

import { z } from 'zod';

// ============================================
// WEBHOOK EVENT TYPES
// ============================================

/**
 * Supported webhook event types
 */
export const WEBHOOK_EVENTS = [
  'message.received',
  'message.sent',
  'message.delivered',
  'message.read',
  'message.failed',
  'connection.connected',
  'connection.disconnected',
  'connection.qr_update',
  'contact.created',
  'contact.updated',
  'broadcast.started',
  'broadcast.completed',
  'broadcast.failed',
] as const;

export type WebhookEventType = typeof WEBHOOK_EVENTS[number];

// ============================================
// WEBHOOK CONFIG SCHEMAS
// ============================================

/**
 * Configure webhook for instance
 */
export const configureWebhookSchema = z.object({
  instance_id: z.string().uuid('Invalid instance ID'),
  webhook_url: z.string().url('Invalid webhook URL').max(2000).optional().nullable(),
  webhook_events: z.array(z.string()).optional(),
  webhook_secret: z.string().max(255).optional().nullable(),
});

export type ConfigureWebhookInput = z.infer<typeof configureWebhookSchema>;

/**
 * Get webhook config query
 */
export const getWebhookConfigSchema = z.object({
  instance_id: z.string().uuid('Invalid instance ID'),
});

export type GetWebhookConfigInput = z.infer<typeof getWebhookConfigSchema>;

// ============================================
// WEBHOOK DELIVERY SCHEMAS
// ============================================

/**
 * Webhook status enum - matches Prisma
 */
export const WebhookStatusEnum = z.enum(['PENDING', 'PROCESSING', 'DELIVERED', 'FAILED']);
export type WebhookStatus = z.infer<typeof WebhookStatusEnum>;

/**
 * Send webhook request schema (internal use)
 */
export const sendWebhookSchema = z.object({
  instance_id: z.string().uuid('Invalid instance ID'),
  organization_id: z.string().uuid('Invalid organization ID'),
  event_type: z.string(),
  payload: z.record(z.any()),
  idempotency_key: z.string().max(255).optional(),
});

export type SendWebhookInput = z.infer<typeof sendWebhookSchema>;

/**
 * List webhooks query schema
 */
export const listWebhooksQuerySchema = z.object({
  instance_id: z.string().uuid('Invalid instance ID').optional(),
  status: WebhookStatusEnum.optional(),
  event_type: z.enum(WEBHOOK_EVENTS).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
});

export type ListWebhooksQuery = z.infer<typeof listWebhooksQuerySchema>;

/**
 * Get webhook logs query schema
 */
export const getWebhookLogsQuerySchema = z.object({
  webhook_id: z.string().uuid('Invalid webhook ID'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type GetWebhookLogsQuery = z.infer<typeof getWebhookLogsQuerySchema>;

/**
 * Retry webhook schema
 */
export const retryWebhookSchema = z.object({
  webhook_id: z.string().uuid('Invalid webhook ID'),
});

export type RetryWebhookInput = z.infer<typeof retryWebhookSchema>;

// ============================================
// WEBHOOK PAYLOAD TEMPLATES
// ============================================

/**
 * Base webhook payload structure
 */
export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  instance_id: string;
  organization_id: string;
  data: Record<string, any>;
}

/**
 * Message webhook payload
 */
export interface MessageWebhookPayload extends WebhookPayload {
  event: 'message.received' | 'message.sent' | 'message.delivered' | 'message.read' | 'message.failed';
  data: {
    message_id: string;
    wa_message_id?: string;
    chat_jid: string;
    sender_jid?: string;
    message_type: string;
    content?: string;
    media_url?: string;
    mime_type?: string;
    file_size?: number;
    file_name?: string;
    status: string;
    timestamp: string;
  };
}

/**
 * Connection webhook payload
 */
export interface ConnectionWebhookPayload extends WebhookPayload {
  event: 'connection.connected' | 'connection.disconnected' | 'connection.qr_update';
  data: {
    status: string;
    phone_number?: string;
    qr_code?: string;
    reason?: string;
  };
}

/**
 * Response schemas
 */
export const webhookConfigResponseSchema = z.object({
  instance_id: z.string(),
  webhook_url: z.string().nullable(),
  webhook_events: z.array(z.string()).nullable(),
  webhook_secret_configured: z.boolean(),
});

export type WebhookConfigResponse = z.infer<typeof webhookConfigResponseSchema>;

export const webhookResponseSchema = z.object({
  id: z.string(),
  instance_id: z.string(),
  event_type: z.string(),
  status: z.string(),
  attempts: z.number(),
  created_at: z.date(),
  delivered_at: z.date().nullable(),
  failed_at: z.date().nullable(),
});

export type WebhookResponse = z.infer<typeof webhookResponseSchema>;
