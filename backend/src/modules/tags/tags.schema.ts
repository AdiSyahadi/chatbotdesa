/**
 * Tags Module - Validation Schemas
 * @module tags/schemas
 */

import { z } from 'zod';

// ============================================
// CONSTANTS
// ============================================

// Predefined colors for tags (Tailwind-compatible)
export const TAG_COLORS = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#EAB308', // Yellow
  '#84CC16', // Lime
  '#22C55E', // Green
  '#10B981', // Emerald
  '#14B8A6', // Teal
  '#06B6D4', // Cyan
  '#0EA5E9', // Sky
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#A855F7', // Purple
  '#D946EF', // Fuchsia
  '#EC4899', // Pink
  '#F43F5E', // Rose
  '#6B7280', // Gray (default)
] as const;

// ============================================
// TAG SCHEMAS
// ============================================

/**
 * Create tag schema
 */
export const createTagSchema = z.object({
  name: z
    .string()
    .min(1, 'Tag name is required')
    .max(100, 'Tag name must not exceed 100 characters')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Tag name can only contain letters, numbers, spaces, hyphens, and underscores'),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format (use hex like #FF5733)')
    .default('#6B7280'),
  description: z.string().max(255).optional().nullable(),
});

export type CreateTagInput = z.infer<typeof createTagSchema>;

/**
 * Update tag schema
 */
export const updateTagSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Tag name can only contain letters, numbers, spaces, hyphens, and underscores')
    .optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format')
    .optional(),
  description: z.string().max(255).optional().nullable(),
});

export type UpdateTagInput = z.infer<typeof updateTagSchema>;

/**
 * List tags query schema
 */
export const listTagsQuerySchema = z.object({
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sort_by: z.enum(['name', 'contact_count', 'created_at', 'updated_at']).default('name'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
});

export type ListTagsQuery = z.infer<typeof listTagsQuerySchema>;

/**
 * Tag ID param schema
 */
export const tagIdParamSchema = z.object({
  id: z.string().uuid('Invalid tag ID'),
});

export type TagIdParam = z.infer<typeof tagIdParamSchema>;

/**
 * Assign tag to contact(s) schema
 */
export const assignTagSchema = z.object({
  contact_ids: z
    .array(z.string().uuid('Invalid contact ID'))
    .min(1, 'At least one contact is required')
    .max(1000, 'Maximum 1000 contacts per request'),
});

export type AssignTagInput = z.infer<typeof assignTagSchema>;

/**
 * Remove tag from contact(s) schema
 */
export const removeTagSchema = z.object({
  contact_ids: z
    .array(z.string().uuid('Invalid contact ID'))
    .min(1, 'At least one contact is required')
    .max(1000, 'Maximum 1000 contacts per request'),
});

export type RemoveTagInput = z.infer<typeof removeTagSchema>;

/**
 * Bulk tag operation schema
 */
export const bulkTagOperationSchema = z.object({
  tag_ids: z
    .array(z.string().uuid('Invalid tag ID'))
    .min(1, 'At least one tag is required')
    .max(50, 'Maximum 50 tags per request'),
  contact_ids: z
    .array(z.string().uuid('Invalid contact ID'))
    .min(1, 'At least one contact is required')
    .max(1000, 'Maximum 1000 contacts per request'),
  operation: z.enum(['add', 'remove']),
});

export type BulkTagOperationInput = z.infer<typeof bulkTagOperationSchema>;

/**
 * Merge tags schema
 */
export const mergeTagsSchema = z.object({
  source_tag_ids: z
    .array(z.string().uuid('Invalid tag ID'))
    .min(1, 'At least one source tag is required')
    .max(10, 'Maximum 10 source tags'),
  target_tag_id: z.string().uuid('Invalid target tag ID'),
  delete_source: z.boolean().default(true),
});

export type MergeTagsInput = z.infer<typeof mergeTagsSchema>;

// ============================================
// RESPONSE TYPES
// ============================================

export interface TagResponse {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  description: string | null;
  contact_count: number;
  created_at: string;
  updated_at: string;
}

export interface TagListResponse {
  items: TagResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface ContactWithTags {
  id: string;
  phone_number: string | null;
  name: string | null;
  tags: TagResponse[];
}

export interface TagStats {
  total_tags: number;
  total_tagged_contacts: number;
  untagged_contacts: number;
  most_used_tags: {
    id: string;
    name: string;
    color: string;
    contact_count: number;
  }[];
  color_distribution: Record<string, number>;
}

export interface TagOperationResult {
  success: boolean;
  affected_contacts: number;
  message: string;
}
