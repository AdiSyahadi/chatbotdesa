/**
 * Contacts Module - Validation Schemas
 * @module contacts/schemas
 */

import { z } from 'zod';
import { DEFAULT_COUNTRY_CODE } from '../../config/constants';

// ============================================
// CONTACT SCHEMAS
// ============================================

/**
 * Phone number validation with international format
 */
const phoneNumberSchema = z.string()
  .min(10, 'Phone number must be at least 10 digits')
  .max(20, 'Phone number must be at most 20 characters')
  .regex(/^\+?[0-9]+$/, 'Phone number must contain only digits and optional + prefix');

/**
 * Create contact schema
 */
export const createContactSchema = z.object({
  instance_id: z.string().uuid('Invalid instance ID'),
  phone_number: phoneNumberSchema,
  name: z.string().max(255).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  custom_fields: z.record(z.string(), z.any()).optional(),
  notes: z.string().max(5000).optional(),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;

/**
 * Update contact schema
 */
export const updateContactSchema = z.object({
  name: z.string().max(255, 'Name must not exceed 255 characters').optional(),
  tags: z.array(z.string().max(50, 'Tag must not exceed 50 characters')).max(20, 'Maximum 20 tags allowed').optional(),
  custom_fields: z.record(z.string(), z.any()).optional(),
  notes: z.string().max(5000, 'Notes must not exceed 5000 characters').optional(),
});

export type UpdateContactInput = z.infer<typeof updateContactSchema>;

/**
 * Bulk create contacts schema
 */
export const bulkCreateContactsSchema = z.object({
  instance_id: z.string().uuid('Invalid instance ID'),
  contacts: z.array(z.object({
    phone_number: phoneNumberSchema,
    name: z.string().max(255).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    custom_fields: z.record(z.string(), z.any()).optional(),
    notes: z.string().max(5000).optional(),
  })).min(1, 'At least one contact is required').max(1000, 'Maximum 1000 contacts per request'),
  skip_duplicates: z.boolean().optional().default(true),
});

export type BulkCreateContactsInput = z.infer<typeof bulkCreateContactsSchema>;

/**
 * Import contacts from CSV schema
 */
export const importContactsSchema = z.object({
  instance_id: z.string().uuid('Invalid instance ID'),
  skip_duplicates: z.boolean().optional().default(true),
  default_tags: z.array(z.string().max(50)).max(20).optional(),
});

export type ImportContactsInput = z.infer<typeof importContactsSchema>;

/**
 * List contacts query schema
 */
export const listContactsQuerySchema = z.object({
  instance_id: z.string().uuid('Invalid instance ID').optional(),
  search: z.string().max(100).optional(),
  tags: z.string().optional(), // comma-separated tags
  is_business: z.enum(['true', 'false']).optional(),
  is_group: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort_by: z.enum(['name', 'phone_number', 'created_at', 'last_seen_at']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;

/**
 * Contact ID param schema
 */
export const contactIdParamSchema = z.object({
  id: z.string().uuid('Invalid contact ID'),
});

export type ContactIdParam = z.infer<typeof contactIdParamSchema>;

/**
 * Tag operations schema
 */
export const tagOperationSchema = z.object({
  tags: z.array(z.string().max(50)).min(1, 'At least one tag is required').max(20),
});

export type TagOperationInput = z.infer<typeof tagOperationSchema>;

/**
 * Bulk tag operation schema (for multiple contacts)
 */
export const bulkTagOperationSchema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1).max(100),
  tags: z.array(z.string().max(50)).min(1).max(20),
  operation: z.enum(['add', 'remove', 'set']),
});

export type BulkTagOperationInput = z.infer<typeof bulkTagOperationSchema>;

/**
 * Bulk delete contacts schema
 */
export const bulkDeleteContactsSchema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1, 'At least one contact ID is required').max(100, 'Maximum 100 contacts per request'),
});

export type BulkDeleteContactsInput = z.infer<typeof bulkDeleteContactsSchema>;

/**
 * Export contacts query schema
 */
export const exportContactsQuerySchema = z.object({
  instance_id: z.string().uuid('Invalid instance ID').optional(),
  tags: z.string().optional(),
  format: z.enum(['csv', 'json']).default('csv'),
});

export type ExportContactsQuery = z.infer<typeof exportContactsQuerySchema>;

// ============================================
// CONTACT RESPONSE TYPES
// ============================================

export interface ContactResponse {
  id: string;
  instance_id: string;
  jid: string;
  phone_number: string | null;
  name: string | null;
  push_name: string | null;
  is_business: boolean;
  is_enterprise: boolean;
  is_group: boolean;
  profile_pic_url: string | null;
  status_text: string | null;
  tags: string[];
  custom_fields: Record<string, any> | null;
  notes: string | null;
  last_seen_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ContactListResponse {
  contacts: ContactResponse[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export interface BulkCreateResult {
  created: number;
  skipped: number;
  failed: number;
  errors: Array<{
    phone_number: string;
    error: string;
  }>;
}

export interface ImportContactsResult {
  total_rows: number;
  created: number;
  skipped: number;
  failed: number;
  errors: Array<{
    row: number;
    phone_number?: string;
    error: string;
  }>;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format phone number to WhatsApp JID format
 */
export function formatPhoneToJid(phone: string): string {
  // Remove all non-numeric characters except leading +
  let cleaned = phone.replace(/(?!^\+)[^\d]/g, '');
  
  // Remove leading +
  cleaned = cleaned.replace(/^\+/, '');
  
  // Remove leading 0 and add country code if needed
  if (cleaned.startsWith('0')) {
    cleaned = DEFAULT_COUNTRY_CODE + cleaned.substring(1);
  }
  
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Extract phone number from JID
 */
export function extractPhoneFromJid(jid: string): string {
  return jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
}

/**
 * Parse CSV row for contact import
 */
export function parseContactCsvRow(row: Record<string, string>): {
  phone_number: string;
  name?: string;
  tags?: string[];
} | null {
  // Support various column names for phone number
  const phoneKeys = ['phone', 'phone_number', 'phonenumber', 'hp', 'nomor', 'no_hp', 'no hp', 'mobile'];
  let phone = '';
  
  for (const key of phoneKeys) {
    if (row[key] || row[key.toLowerCase()]) {
      phone = row[key] || row[key.toLowerCase()];
      break;
    }
  }
  
  if (!phone) return null;
  
  // Clean phone number
  phone = phone.trim().replace(/\s+/g, '');
  
  // Support various column names for name
  const nameKeys = ['name', 'nama', 'full_name', 'fullname', 'contact_name'];
  let name = '';
  
  for (const key of nameKeys) {
    if (row[key] || row[key.toLowerCase()]) {
      name = row[key] || row[key.toLowerCase()];
      break;
    }
  }
  
  // Support tags column (comma-separated)
  const tagsKeys = ['tags', 'tag', 'labels', 'label'];
  let tags: string[] | undefined;
  
  for (const key of tagsKeys) {
    if (row[key] || row[key.toLowerCase()]) {
      const tagStr = row[key] || row[key.toLowerCase()];
      tags = tagStr.split(',').map(t => t.trim()).filter(t => t);
      break;
    }
  }
  
  return {
    phone_number: phone,
    name: name || undefined,
    tags,
  };
}
