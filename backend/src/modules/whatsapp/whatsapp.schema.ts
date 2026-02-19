import { z } from 'zod';

// ============================================
// WHATSAPP INSTANCE SCHEMAS
// ============================================

/**
 * Schema for creating a new WhatsApp instance
 */
export const createInstanceSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must not exceed 100 characters')
    .trim(),
  webhook_url: z
    .string()
    .url('Invalid webhook URL format')
    .optional()
    .nullable(),
  webhook_events: z
    .array(z.enum(['message', 'status', 'connection', 'qr']))
    .optional()
    .default(['message', 'status', 'connection']),
  webhook_secret: z
    .string()
    .min(16, 'Webhook secret must be at least 16 characters')
    .optional()
    .nullable(),
});

/**
 * Schema for updating an instance
 */
export const updateInstanceSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must not exceed 100 characters')
    .trim()
    .optional(),
  webhook_url: z
    .union([z.string().url('Invalid webhook URL format'), z.literal('')])
    .nullable()
    .optional()
    .transform(v => v === '' ? null : v),
  webhook_events: z
    .array(z.string())
    .optional(),
  webhook_secret: z
    .string()
    .min(16, 'Webhook secret must be at least 16 characters')
    .nullable()
    .optional(),
  is_active: z.boolean().optional(),
  auto_reconnect: z.boolean().optional(),
  read_receipts: z.boolean().optional(),
});

/**
 * Schema for instance ID parameter
 */
export const instanceIdSchema = z.object({
  id: z
    .string()
    .uuid('Invalid instance ID format'),
});

/**
 * Schema for listing instances with pagination
 */
export const listInstancesQuerySchema = z.object({
  status: z
    .enum(['DISCONNECTED', 'CONNECTING', 'CONNECTED', 'QR_READY', 'ERROR', 'BANNED'])
    .optional(),
  page: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().min(1).default(1))
    .optional()
    .default('1'),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().min(1).max(100).default(20))
    .optional()
    .default('20'),
  search: z
    .string()
    .optional(),
});

// ============================================
// MESSAGE SCHEMAS
// ============================================

/**
 * Schema for sending a text message
 */
export const sendTextMessageSchema = z.object({
  to: z
    .string()
    .min(10, 'Phone number too short')
    .max(20, 'Phone number too long')
    .regex(/^[0-9]+$/, 'Phone number must contain only digits'),
  message: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(4096, 'Message too long (max 4096 characters)'),
  // Optional: typing simulation delay (anti-ban)
  delay: z
    .number()
    .min(0)
    .max(10000)
    .optional()
    .default(0),
});

/**
 * Schema for sending media message
 */
export const sendMediaMessageSchema = z.object({
  to: z
    .string()
    .min(10, 'Phone number too short')
    .max(20, 'Phone number too long')
    .regex(/^[0-9]+$/, 'Phone number must contain only digits'),
  media_url: z
    .string()
    .url('Invalid media URL'),
  media_type: z
    .enum(['image', 'video', 'audio', 'document']),
  caption: z
    .string()
    .max(1024, 'Caption too long')
    .optional(),
  filename: z
    .string()
    .optional(),
});

/**
 * Schema for sending location
 */
export const sendLocationSchema = z.object({
  to: z
    .string()
    .min(10)
    .max(20)
    .regex(/^[0-9]+$/),
  latitude: z
    .number()
    .min(-90)
    .max(90),
  longitude: z
    .number()
    .min(-180)
    .max(180),
  name: z
    .string()
    .optional(),
  address: z
    .string()
    .optional(),
});

/**
 * Schema for sending contact card
 */
export const sendContactSchema = z.object({
  to: z
    .string()
    .min(10)
    .max(20)
    .regex(/^[0-9]+$/),
  contact: z.object({
    name: z.string(),
    phone: z.string(),
    organization: z.string().optional(),
  }),
});

/**
 * Schema for message query params
 */
export const messagesQuerySchema = z.object({
  chat_jid: z.string().optional(),
  direction: z.enum(['INCOMING', 'OUTGOING']).optional(),
  status: z.enum(['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED']).optional(),
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
  page: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().min(1).default(1))
    .optional()
    .default('1'),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().min(1).max(100).default(50))
    .optional()
    .default('50'),
});

// ============================================
// TYPE EXPORTS
// ============================================

export type CreateInstanceInput = z.infer<typeof createInstanceSchema>;
export type UpdateInstanceInput = z.infer<typeof updateInstanceSchema>;
export type InstanceIdParams = z.infer<typeof instanceIdSchema>;
export type ListInstancesQuery = z.infer<typeof listInstancesQuerySchema>;
export type SendTextMessageInput = z.infer<typeof sendTextMessageSchema>;
export type SendMediaMessageInput = z.infer<typeof sendMediaMessageSchema>;
export type SendLocationInput = z.infer<typeof sendLocationSchema>;
export type SendContactInput = z.infer<typeof sendContactSchema>;
export type MessagesQuery = z.infer<typeof messagesQuerySchema>;

// ============================================
// WEBHOOK EVENT TYPES
// ============================================

export const WEBHOOK_EVENTS = ['message', 'status', 'connection', 'qr'] as const;
export type WebhookEvent = typeof WEBHOOK_EVENTS[number];

// ============================================
// INSTANCE STATUS TYPES
// ============================================

export const INSTANCE_STATUSES = [
  'DISCONNECTED',
  'CONNECTING',
  'CONNECTED',
  'QR_READY',
  'ERROR',
  'BANNED',
] as const;
export type InstanceStatusType = typeof INSTANCE_STATUSES[number];

// ============================================
// WARMING PHASE CONFIG (PATCH-108: moved to constants.ts, re-exported here for backward compat)
// ============================================

export { WARMING_PHASE_LIMITS, WarmingPhaseType } from '../../config/constants';
