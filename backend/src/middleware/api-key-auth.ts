/**
 * API Key Authentication Middleware
 * @module middleware/api-key-auth
 * 
 * Supports authentication via API key in header:
 * X-API-Key: wa_xxxxxxxx...
 * 
 * Can be used standalone or as fallback for JWT auth
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../types';
import { ApiKeyService } from '../modules/api-keys/api-keys.service';
import { hasPermission, ApiKeyPermission } from '../modules/api-keys/api-keys.schema';
import logger from '../config/logger';

// ============================================
// API KEY REQUEST TYPE
// ============================================

export interface ApiKeyAuthenticatedRequest extends FastifyRequest {
  apiKey: {
    id: string;
    organization_id: string;
    permissions: ApiKeyPermission[];
    rate_limit: number;
  };
  user: {
    id: string;
    organization_id: string;
    role: string;
  };
}

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Authenticate request using API key
 * 
 * Use this for external API access
 */
export const authenticateApiKey = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const apiKey = request.headers['x-api-key'] as string;

  if (!apiKey) {
    throw new AppError('API key required', 401, 'API_KEY_REQUIRED');
  }

  const apiKeyService = new ApiKeyService(request.server);
  const result = await apiKeyService.validateApiKey(apiKey);

  if (!result.valid) {
    throw new AppError(result.error || 'Invalid API key', 401, 'INVALID_API_KEY');
  }

  // Attach API key info to request
  (request as ApiKeyAuthenticatedRequest).apiKey = {
    id: result.key_id!,
    organization_id: result.organization_id!,
    permissions: result.permissions!,
    rate_limit: result.rate_limit!,
  };

  // Also set user for compatibility with existing routes
  (request as ApiKeyAuthenticatedRequest).user = {
    id: result.key_id!, // Use key ID as user ID for API key auth
    organization_id: result.organization_id!,
    role: 'API_KEY', // Special role for API key auth
  };
};

/**
 * Authenticate request using either JWT or API key
 * 
 * Tries JWT first, then falls back to API key
 */
export const authenticateJwtOrApiKey = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  // Check for JWT first
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const decoded = await request.jwtVerify();
      (request as any).user = decoded;
      return;
    } catch (error) {
      // JWT failed, try API key
    }
  }

  // Try API key
  const apiKey = request.headers['x-api-key'] as string;
  if (apiKey) {
    await authenticateApiKey(request, reply);
    return;
  }

  throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
};

/**
 * Check if request has required API key permission
 * 
 * Usage:
 * preHandler: [authenticateApiKey, requireApiKeyPermission('message:send')]
 */
export function requireApiKeyPermission(permission: ApiKeyPermission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    
    if (!req.apiKey) {
      throw new AppError('API key authentication required', 401, 'API_KEY_REQUIRED');
    }

    if (!hasPermission(req.apiKey.permissions, permission)) {
      throw new AppError(
        `Permission '${permission}' required`,
        403,
        'INSUFFICIENT_PERMISSION'
      );
    }
  };
}

/**
 * Check if request has any of the required permissions
 */
export function requireAnyApiKeyPermission(permissions: ApiKeyPermission[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const req = request as ApiKeyAuthenticatedRequest;
    
    if (!req.apiKey) {
      throw new AppError('API key authentication required', 401, 'API_KEY_REQUIRED');
    }

    const hasAny = permissions.some(p => hasPermission(req.apiKey.permissions, p));
    if (!hasAny) {
      throw new AppError(
        `One of these permissions required: ${permissions.join(', ')}`,
        403,
        'INSUFFICIENT_PERMISSION'
      );
    }
  };
}

// ============================================
// RATE LIMITING HELPER
// ============================================

/**
 * Get rate limit for current API key
 */
export function getApiKeyRateLimit(request: FastifyRequest): number | null {
  const req = request as ApiKeyAuthenticatedRequest;
  return req.apiKey?.rate_limit ?? null;
}
