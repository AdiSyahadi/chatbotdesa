/**
 * Broadcasts Module - Validation Schemas
 * @module broadcasts/schemas
 */

import { z } from 'zod';
import { DEFAULT_COUNTRY_CODE } from '../../config/constants';
import logger from '../../config/logger';

// ============================================
// ENUMS
// ============================================

export const BROADCAST_STATUS = ['DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED'] as const;
export type BroadcastStatusType = typeof BROADCAST_STATUS[number];

export const RECIPIENT_TYPE = ['ALL_CONTACTS', 'SELECTED_TAGS', 'SELECTED_CONTACTS', 'CSV_UPLOAD', 'MANUAL_INPUT'] as const;
export type RecipientTypeValue = typeof RECIPIENT_TYPE[number];

export const MESSAGE_TYPE = ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'LOCATION'] as const;
export type MessageTypeValue = typeof MESSAGE_TYPE[number];

// ============================================
// BROADCAST SCHEMAS
// ============================================

/**
 * Create broadcast schema
 */
export const createBroadcastSchema = z.object({
  instance_id: z.string().uuid('Invalid instance ID'),
  name: z.string().min(1, 'Name is required').max(255),
  
  // Message content
  message_type: z.enum(MESSAGE_TYPE).default('TEXT'),
  content: z.string().max(4096).optional(),
  media_url: z.string().url().max(2048).optional(),
  caption: z.string().max(1024).optional(),
  
  // Recipients
  recipient_type: z.enum(RECIPIENT_TYPE).default('ALL_CONTACTS'),
  recipient_filter: z.object({
    tags: z.array(z.string()).optional(),
    contact_ids: z.array(z.string().uuid()).optional(),
    phone_numbers: z.array(z.string().regex(/^\+?[0-9]+$/, 'Phone number must contain only digits')).optional(),
  }).optional(),
  
  // Scheduling
  scheduled_at: z.string().datetime().optional(),
  
  // Anti-ban settings
  delay_min_ms: z.number().int().min(1000).max(30000).default(3000),
  delay_max_ms: z.number().int().min(1000).max(60000).default(5000),
}).refine(
  (data) => {
    // Require content or media_url
    if (!data.content && !data.media_url) {
      return false;
    }
    return true;
  },
  { message: 'Either content or media_url is required' }
).refine(
  (data) => data.delay_max_ms >= data.delay_min_ms,
  { message: 'delay_max_ms must be greater than or equal to delay_min_ms' }
);

export type CreateBroadcastInput = z.infer<typeof createBroadcastSchema>;

/**
 * Update broadcast schema
 */
export const updateBroadcastSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  content: z.string().max(4096).optional(),
  media_url: z.string().url().max(2048).optional().nullable(),
  caption: z.string().max(1024).optional().nullable(),
  scheduled_at: z.string().datetime().optional().nullable(),
  delay_min_ms: z.number().int().min(1000).max(30000).optional(),
  delay_max_ms: z.number().int().min(1000).max(60000).optional(),
});

export type UpdateBroadcastInput = z.infer<typeof updateBroadcastSchema>;

/**
 * Add recipients schema
 */
export const addRecipientsSchema = z.object({
  recipients: z.array(z.object({
    phone_number: z.string().min(10).max(20).regex(/^\+?[0-9]+$/, 'Phone number must contain only digits'),
    contact_name: z.string().max(255).optional(),
    variables: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  })).min(1, 'At least one recipient is required').max(10000, 'Maximum 10000 recipients per request'),
});

export type AddRecipientsInput = z.infer<typeof addRecipientsSchema>;

/**
 * Add recipients from contacts schema
 */
export const addRecipientsFromContactsSchema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1).max(10000),
});

export type AddRecipientsFromContactsInput = z.infer<typeof addRecipientsFromContactsSchema>;

/**
 * Add recipients from tags schema
 */
export const addRecipientsFromTagsSchema = z.object({
  tags: z.array(z.string()).min(1).max(20),
  instance_id: z.string().uuid().optional(), // Filter by instance
});

export type AddRecipientsFromTagsInput = z.infer<typeof addRecipientsFromTagsSchema>;

/**
 * List broadcasts query schema
 */
export const listBroadcastsQuerySchema = z.object({
  instance_id: z.string().uuid().optional(),
  status: z.enum(BROADCAST_STATUS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort_by: z.enum(['name', 'status', 'scheduled_at', 'created_at', 'sent_count']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type ListBroadcastsQuery = z.infer<typeof listBroadcastsQuerySchema>;

/**
 * Broadcast ID param schema
 */
export const broadcastIdParamSchema = z.object({
  id: z.string().uuid('Invalid broadcast ID'),
});

export type BroadcastIdParam = z.infer<typeof broadcastIdParamSchema>;

/**
 * List recipients query schema
 */
export const listRecipientsQuerySchema = z.object({
  status: z.enum(['PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListRecipientsQuery = z.infer<typeof listRecipientsQuerySchema>;

// ============================================
// RESPONSE TYPES
// ============================================

export interface BroadcastResponse {
  id: string;
  instance_id: string;
  name: string;
  message_type: MessageTypeValue;
  content: string | null;
  media_url: string | null;
  caption: string | null;
  recipient_type: RecipientTypeValue;
  recipient_filter: Record<string, any> | null;
  recipient_count: number;
  status: BroadcastStatusType;
  scheduled_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  sent_count: number;
  failed_count: number;
  delay_min_ms: number;
  delay_max_ms: number;
  created_at: Date;
  updated_at: Date;
  progress_percentage: number;
}

export interface BroadcastRecipientResponse {
  id: string;
  broadcast_id: string;
  phone_number: string;
  contact_name: string | null;
  variables: Record<string, any> | null;
  status: string;
  sent_at: Date | null;
  delivered_at: Date | null;
  read_at: Date | null;
  failed_at: Date | null;
  error_message: string | null;
  created_at: Date;
}

export interface BroadcastListResponse {
  broadcasts: BroadcastResponse[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export interface BroadcastRecipientListResponse {
  recipients: BroadcastRecipientResponse[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export interface BroadcastStats {
  total_recipients: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

// ============================================
// QUEUE JOB TYPES
// ============================================

export interface BroadcastJobData {
  broadcast_id: string;
  organization_id: string;
  instance_id: string;
}

export interface BroadcastMessageJobData {
  broadcast_id: string;
  recipient_id: string;
  organization_id: string;
  instance_id: string;
  phone_number: string;
  message_type: MessageTypeValue;
  content: string | null;
  media_url: string | null;
  caption: string | null;
  variables: Record<string, any> | null;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Replace variables in message content
 * Supports {{variable_name}} syntax
 * PATCH-103: Warns on unresolved placeholders
 */
export function replaceVariables(
  content: string,
  variables: Record<string, any> | null
): string {
  if (!variables) return content;

  let hasUnresolved = false;
  const result = content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (variables[key] !== undefined) return String(variables[key]);
    hasUnresolved = true;
    return match;
  });

  if (hasUnresolved) {
    // Extract expected vs provided keys for debugging
    const expected = (content.match(/\{\{(\w+)\}\}/g) || []).map(m => m.slice(2, -2));
    const provided = Object.keys(variables);
    const missing = expected.filter(k => variables[k] === undefined);
    // Log at warn level — callers can decide whether to reject
    logger.warn({ missing, provided }, '[replaceVariables] Unresolved placeholders');
  }

  return result;
}

/**
 * Calculate random delay within range
 */
export function getRandomDelay(minMs: number, maxMs: number): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Format phone number for WhatsApp
 */
export function formatPhoneNumber(phone: string): string {
  // Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Remove leading 0 and add country code if needed
  if (cleaned.startsWith('0')) {
    cleaned = DEFAULT_COUNTRY_CODE + cleaned.substring(1);
  }
  
  return cleaned;
}
