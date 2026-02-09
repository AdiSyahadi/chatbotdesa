/**
 * API Keys Module - Validation Schemas
 * @module api-keys/schemas
 */

import { z } from 'zod';

// ============================================
// API KEY PERMISSIONS
// ============================================

/**
 * Available API key permissions
 */
export const API_KEY_PERMISSIONS = [
  // Instance permissions
  'instance:read',
  'instance:write',
  'instance:delete',
  
  // Messaging permissions
  'message:send',
  'message:read',
  
  // Contact permissions
  'contact:read',
  'contact:write',
  'contact:delete',
  
  // Broadcast permissions
  'broadcast:read',
  'broadcast:write',
  'broadcast:delete',
  
  // Webhook permissions
  'webhook:read',
  'webhook:write',
  
  // Full access
  'full_access',
] as const;

export type ApiKeyPermission = typeof API_KEY_PERMISSIONS[number];

// ============================================
// CREATE API KEY
// ============================================

/**
 * Create API key schema
 */
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(255, 'Name must be at most 255 characters'),
  permissions: z.array(z.enum(API_KEY_PERMISSIONS)).min(1, 'At least one permission required'),
  rate_limit: z.number().int().min(10).max(10000).default(1000),
  expires_at: z.string().datetime().optional(),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

// ============================================
// UPDATE API KEY
// ============================================

/**
 * Update API key schema
 */
export const updateApiKeySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  permissions: z.array(z.enum(API_KEY_PERMISSIONS)).min(1).optional(),
  rate_limit: z.number().int().min(10).max(10000).optional(),
  is_active: z.boolean().optional(),
  expires_at: z.string().datetime().optional().nullable(),
});

export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;

// ============================================
// LIST API KEYS
// ============================================

/**
 * List API keys query schema
 */
export const listApiKeysQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  is_active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  search: z.string().max(100).optional(),
});

export type ListApiKeysQuery = z.infer<typeof listApiKeysQuerySchema>;

// ============================================
// API KEY RESPONSE TYPES
// ============================================

/**
 * API key response (without secret)
 */
export interface ApiKeyResponse {
  id: string;
  name: string;
  key_prefix: string;
  permissions: ApiKeyPermission[];
  rate_limit: number;
  is_active: boolean;
  last_used_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
}

/**
 * API key created response (includes full key - only shown once)
 */
export interface ApiKeyCreatedResponse extends ApiKeyResponse {
  api_key: string; // Full key - only returned on creation
}

/**
 * API key validation result
 */
export interface ApiKeyValidationResult {
  valid: boolean;
  organization_id?: string;
  key_id?: string;
  permissions?: ApiKeyPermission[];
  rate_limit?: number;
  error?: string;
}

// ============================================
// API KEY HEADER SCHEMA
// ============================================

/**
 * API key header schema
 */
export const apiKeyHeaderSchema = z.object({
  'x-api-key': z.string().min(1, 'API key is required'),
});

// ============================================
// PERMISSION CHECK HELPERS
// ============================================

/**
 * Check if permissions include required permission
 */
export function hasPermission(
  permissions: ApiKeyPermission[] | null,
  required: ApiKeyPermission
): boolean {
  if (!permissions) return false;
  if (permissions.includes('full_access')) return true;
  return permissions.includes(required);
}

/**
 * Check if permissions include any of the required permissions
 */
export function hasAnyPermission(
  permissions: ApiKeyPermission[] | null,
  required: ApiKeyPermission[]
): boolean {
  if (!permissions) return false;
  if (permissions.includes('full_access')) return true;
  return required.some(p => permissions.includes(p));
}

/**
 * Check if permissions include all required permissions
 */
export function hasAllPermissions(
  permissions: ApiKeyPermission[] | null,
  required: ApiKeyPermission[]
): boolean {
  if (!permissions) return false;
  if (permissions.includes('full_access')) return true;
  return required.every(p => permissions.includes(p));
}
