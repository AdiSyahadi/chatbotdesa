/**
 * Templates Module - Validation Schemas
 * @module templates/schemas
 */

import { z } from 'zod';

// ============================================
// ENUMS & CONSTANTS
// ============================================

export const MESSAGE_TYPES = ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT'] as const;
export type MessageTypeValue = (typeof MESSAGE_TYPES)[number];

export const TEMPLATE_CATEGORIES = [
  'GREETING',
  'NOTIFICATION',
  'PROMOTION',
  'REMINDER',
  'CONFIRMATION',
  'SUPPORT',
  'OTHER',
] as const;
export type TemplateCategoryValue = (typeof TEMPLATE_CATEGORIES)[number];

// Variable pattern: {{variable_name}}
const VARIABLE_PATTERN = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

// ============================================
// TEMPLATE SCHEMAS
// ============================================

/**
 * Create template schema
 */
export const createTemplateSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name must not exceed 255 characters')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Name can only contain letters, numbers, spaces, hyphens, and underscores'),
  category: z.enum(TEMPLATE_CATEGORIES).optional().default('OTHER'),
  message_type: z.enum(MESSAGE_TYPES).default('TEXT'),
  content: z
    .string()
    .min(1, 'Content is required')
    .max(4096, 'Content must not exceed 4096 characters'),
  media_url: z.string().url('Invalid media URL').max(2048).optional().nullable(),
  caption: z.string().max(1024, 'Caption must not exceed 1024 characters').optional().nullable(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

/**
 * Update template schema
 */
export const updateTemplateSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Name can only contain letters, numbers, spaces, hyphens, and underscores')
    .optional(),
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
  message_type: z.enum(MESSAGE_TYPES).optional(),
  content: z.string().min(1).max(4096).optional(),
  media_url: z.string().url().max(2048).optional().nullable(),
  caption: z.string().max(1024).optional().nullable(),
  is_active: z.boolean().optional(),
});

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

/**
 * List templates query schema
 */
export const listTemplatesQuerySchema = z.object({
  search: z.string().max(100).optional(),
  category: z.enum(TEMPLATE_CATEGORIES).optional(),
  message_type: z.enum(MESSAGE_TYPES).optional(),
  is_active: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort_by: z.enum(['name', 'category', 'usage_count', 'created_at', 'updated_at']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;

/**
 * Template ID param schema
 */
export const templateIdParamSchema = z.object({
  id: z.string().uuid('Invalid template ID'),
});

export type TemplateIdParam = z.infer<typeof templateIdParamSchema>;

/**
 * Preview template schema (with variable substitution)
 */
export const previewTemplateSchema = z.object({
  variables: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

export type PreviewTemplateInput = z.infer<typeof previewTemplateSchema>;

/**
 * Use template schema (for sending messages)
 */
export const useTemplateSchema = z.object({
  phone_number: z
    .string()
    .min(10, 'Phone number must be at least 10 digits')
    .max(20, 'Phone number must be at most 20 characters')
    .regex(/^\+?[0-9]+$/, 'Phone number must contain only digits'),
  variables: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

export type UseTemplateInput = z.infer<typeof useTemplateSchema>;

// ============================================
// RESPONSE TYPES
// ============================================

export interface TemplateResponse {
  id: string;
  organization_id: string;
  name: string;
  category: string | null;
  message_type: string;
  content: string;
  media_url: string | null;
  caption: string | null;
  variables: string[];
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateListResponse {
  items: TemplateResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface TemplateStats {
  total_templates: number;
  active_templates: number;
  inactive_templates: number;
  by_category: Record<string, number>;
  by_message_type: Record<string, number>;
  total_usage: number;
  most_used: {
    id: string;
    name: string;
    usage_count: number;
  }[];
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Extract variables from template content
 * Pattern: {{variable_name}}
 */
export function extractVariables(content: string): string[] {
  const matches = content.match(VARIABLE_PATTERN);
  if (!matches) return [];
  
  // Extract variable names and deduplicate
  const variables = matches.map((match) => match.replace(/\{\{|\}\}/g, ''));
  return [...new Set(variables)];
}

/**
 * Substitute variables in template content
 */
export function substituteVariables(
  content: string,
  variables: Record<string, string | number>
): string {
  return content.replace(VARIABLE_PATTERN, (match, varName) => {
    if (varName in variables) {
      return String(variables[varName]);
    }
    return match; // Keep original if variable not provided
  });
}

/**
 * Validate that all required variables are provided
 */
export function validateVariables(
  requiredVars: string[],
  providedVars: Record<string, string | number>
): { valid: boolean; missing: string[] } {
  const missing = requiredVars.filter((v) => !(v in providedVars));
  return {
    valid: missing.length === 0,
    missing,
  };
}
