/**
 * API Keys Module - Service Layer
 * @module api-keys/service
 */

import { FastifyInstance } from 'fastify';
import prisma from '../../config/database';
import logger from '../../config/logger';
import { AppError } from '../../types';
import crypto from 'crypto';
import {
  CreateApiKeyInput,
  UpdateApiKeyInput,
  ListApiKeysQuery,
  ApiKeyResponse,
  ApiKeyCreatedResponse,
  ApiKeyValidationResult,
  ApiKeyPermission,
} from './api-keys.schema';

// ============================================
// CONSTANTS
// ============================================

const API_KEY_PREFIX = 'wa_';
const API_KEY_LENGTH = 32; // 32 bytes = 64 hex characters

// ============================================
// API KEY SERVICE
// ============================================

export class ApiKeyService {
  constructor(private readonly fastify: FastifyInstance) {}

  // ============================================
  // KEY GENERATION
  // ============================================

  /**
   * Generate a new API key
   */
  private generateApiKey(): { key: string; hash: string; prefix: string } {
    const randomBytes = crypto.randomBytes(API_KEY_LENGTH);
    const key = API_KEY_PREFIX + randomBytes.toString('hex');
    const hash = this.hashApiKey(key);
    const prefix = key.substring(0, 12); // First 12 chars for identification

    return { key, hash, prefix };
  }

  /**
   * Hash an API key using SHA-256
   */
  private hashApiKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  /**
   * Create a new API key
   */
  async createApiKey(
    organizationId: string,
    input: CreateApiKeyInput
  ): Promise<ApiKeyCreatedResponse> {
    // Generate API key
    const { key, hash, prefix } = this.generateApiKey();

    // Create in database
    const apiKey = await prisma.apiKey.create({
      data: {
        organization_id: organizationId,
        name: input.name,
        key_hash: hash,
        key_prefix: prefix,
        permissions: input.permissions,
        rate_limit: input.rate_limit,
        expires_at: input.expires_at ? new Date(input.expires_at) : null,
      },
    });

    logger.info(
      { apiKeyId: apiKey.id, organizationId },
      'API key created'
    );

    return {
      id: apiKey.id,
      name: apiKey.name,
      key_prefix: apiKey.key_prefix,
      permissions: apiKey.permissions as ApiKeyPermission[],
      rate_limit: apiKey.rate_limit,
      is_active: apiKey.is_active,
      last_used_at: apiKey.last_used_at,
      expires_at: apiKey.expires_at,
      created_at: apiKey.created_at,
      api_key: key, // Only returned on creation!
    };
  }

  /**
   * List API keys with pagination
   */
  async listApiKeys(
    organizationId: string,
    query: ListApiKeysQuery
  ): Promise<{
    data: ApiKeyResponse[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      total_pages: number;
    };
  }> {
    const { page, limit, is_active, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      organization_id: organizationId,
    };

    if (is_active !== undefined) {
      where.is_active = is_active;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { key_prefix: { contains: search } },
      ];
    }

    const [apiKeys, total] = await Promise.all([
      prisma.apiKey.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      prisma.apiKey.count({ where }),
    ]);

    return {
      data: apiKeys.map(key => ({
        id: key.id,
        name: key.name,
        key_prefix: key.key_prefix,
        permissions: key.permissions as ApiKeyPermission[],
        rate_limit: key.rate_limit,
        is_active: key.is_active,
        last_used_at: key.last_used_at,
        expires_at: key.expires_at,
        created_at: key.created_at,
      })),
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get API key by ID
   */
  async getApiKey(
    organizationId: string,
    keyId: string
  ): Promise<ApiKeyResponse> {
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        organization_id: organizationId,
      },
    });

    if (!apiKey) {
      throw new AppError('API key not found', 404, 'API_KEY_NOT_FOUND');
    }

    return {
      id: apiKey.id,
      name: apiKey.name,
      key_prefix: apiKey.key_prefix,
      permissions: apiKey.permissions as ApiKeyPermission[],
      rate_limit: apiKey.rate_limit,
      is_active: apiKey.is_active,
      last_used_at: apiKey.last_used_at,
      expires_at: apiKey.expires_at,
      created_at: apiKey.created_at,
    };
  }

  /**
   * Update API key
   */
  async updateApiKey(
    organizationId: string,
    keyId: string,
    input: UpdateApiKeyInput
  ): Promise<ApiKeyResponse> {
    // Verify key exists and belongs to organization
    const existing = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        organization_id: organizationId,
      },
    });

    if (!existing) {
      throw new AppError('API key not found', 404, 'API_KEY_NOT_FOUND');
    }

    // Update
    const apiKey = await prisma.apiKey.update({
      where: { id: keyId },
      data: {
        name: input.name,
        permissions: input.permissions,
        rate_limit: input.rate_limit,
        is_active: input.is_active,
        expires_at: input.expires_at === null ? null : input.expires_at ? new Date(input.expires_at) : undefined,
      },
    });

    logger.info({ apiKeyId: keyId, organizationId }, 'API key updated');

    return {
      id: apiKey.id,
      name: apiKey.name,
      key_prefix: apiKey.key_prefix,
      permissions: apiKey.permissions as ApiKeyPermission[],
      rate_limit: apiKey.rate_limit,
      is_active: apiKey.is_active,
      last_used_at: apiKey.last_used_at,
      expires_at: apiKey.expires_at,
      created_at: apiKey.created_at,
    };
  }

  /**
   * Delete (revoke) API key
   */
  async deleteApiKey(
    organizationId: string,
    keyId: string
  ): Promise<void> {
    // Verify key exists and belongs to organization
    const existing = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        organization_id: organizationId,
      },
    });

    if (!existing) {
      throw new AppError('API key not found', 404, 'API_KEY_NOT_FOUND');
    }

    // Hard delete
    await prisma.apiKey.delete({
      where: { id: keyId },
    });

    logger.info({ apiKeyId: keyId, organizationId }, 'API key deleted');
  }

  /**
   * Regenerate API key
   */
  async regenerateApiKey(
    organizationId: string,
    keyId: string
  ): Promise<ApiKeyCreatedResponse> {
    // Verify key exists and belongs to organization
    const existing = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        organization_id: organizationId,
      },
    });

    if (!existing) {
      throw new AppError('API key not found', 404, 'API_KEY_NOT_FOUND');
    }

    // Generate new key
    const { key, hash, prefix } = this.generateApiKey();

    // Update with new key
    const apiKey = await prisma.apiKey.update({
      where: { id: keyId },
      data: {
        key_hash: hash,
        key_prefix: prefix,
        last_used_at: null, // Reset usage
      },
    });

    logger.info({ apiKeyId: keyId, organizationId }, 'API key regenerated');

    return {
      id: apiKey.id,
      name: apiKey.name,
      key_prefix: apiKey.key_prefix,
      permissions: apiKey.permissions as ApiKeyPermission[],
      rate_limit: apiKey.rate_limit,
      is_active: apiKey.is_active,
      last_used_at: apiKey.last_used_at,
      expires_at: apiKey.expires_at,
      created_at: apiKey.created_at,
      api_key: key, // Only returned on regeneration!
    };
  }

  // ============================================
  // VALIDATION
  // ============================================

  /**
   * Validate an API key and return its details
   */
  async validateApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
    try {
      // Validate format
      if (!apiKey.startsWith(API_KEY_PREFIX)) {
        return { valid: false, error: 'Invalid API key format' };
      }

      // Hash the key
      const hash = this.hashApiKey(apiKey);

      // Find in database
      const key = await prisma.apiKey.findUnique({
        where: { key_hash: hash },
        include: {
          organization: {
            select: {
              is_active: true,
              subscription_status: true,
            },
          },
        },
      });

      if (!key) {
        return { valid: false, error: 'API key not found' };
      }

      // Check if active
      if (!key.is_active) {
        return { valid: false, error: 'API key is disabled' };
      }

      // Check if expired
      if (key.expires_at && key.expires_at < new Date()) {
        return { valid: false, error: 'API key has expired' };
      }

      // Check organization status
      if (!key.organization.is_active) {
        return { valid: false, error: 'Organization is disabled' };
      }

      // Check subscription status
      const subStatus = key.organization.subscription_status;
      const BLOCKED_STATUSES = ['EXPIRED', 'CANCELED', 'SUSPENDED'];
      if (subStatus && BLOCKED_STATUSES.includes(subStatus)) {
        return {
          valid: false,
          error: `Subscription is ${subStatus.toLowerCase()}. Please renew your subscription to continue using the API.`,
        };
      }

      // Update last used timestamp (fire and forget)
      prisma.apiKey.update({
        where: { id: key.id },
        data: { last_used_at: new Date() },
      }).catch(err => {
        logger.error({ apiKeyId: key.id, error: err }, 'Failed to update API key last_used_at');
      });

      return {
        valid: true,
        organization_id: key.organization_id,
        key_id: key.id,
        permissions: key.permissions as ApiKeyPermission[],
        rate_limit: key.rate_limit,
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'API key validation error');
      return { valid: false, error: 'Validation error' };
    }
  }

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Get API key usage statistics
   */
  async getApiKeyStats(
    organizationId: string
  ): Promise<{
    total: number;
    active: number;
    inactive: number;
    expired: number;
  }> {
    const now = new Date();

    const [total, active, expired] = await Promise.all([
      prisma.apiKey.count({
        where: { organization_id: organizationId },
      }),
      prisma.apiKey.count({
        where: {
          organization_id: organizationId,
          is_active: true,
          OR: [
            { expires_at: null },
            { expires_at: { gt: now } },
          ],
        },
      }),
      prisma.apiKey.count({
        where: {
          organization_id: organizationId,
          expires_at: { lt: now },
        },
      }),
    ]);

    return {
      total,
      active,
      inactive: total - active,
      expired,
    };
  }
}

// ============================================
// EXPORT
// ============================================

export function createApiKeyService(fastify: FastifyInstance): ApiKeyService {
  return new ApiKeyService(fastify);
}
