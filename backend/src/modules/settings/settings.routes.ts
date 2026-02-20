/**
 * System Settings Module - Routes
 * SUPER_ADMIN only endpoints for system configuration
 * @module settings/routes
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { requireRole } from '../../middleware/rbac';
import { UserRole } from '@prisma/client';
import {
  getAllSettings,
  getSetting,
  upsertSetting,
  bulkUpsertSettings,
  deleteSetting,
} from './settings.service';

export async function settingsRoutes(fastify: FastifyInstance) {
  // All settings routes require SUPER_ADMIN
  fastify.addHook('onRequest', fastify.authenticate);
  fastify.addHook('preHandler', requireRole(UserRole.SUPER_ADMIN));

  // ============================================
  // GET /admin/settings — Get all settings (optional prefix filter)
  // ============================================
  fastify.get('/', async (request: FastifyRequest<{
    Querystring: { prefix?: string };
  }>, reply) => {
    const { prefix } = request.query;
    const settings = await getAllSettings(prefix);
    return { success: true, data: { settings } };
  });

  // ============================================
  // GET /admin/settings/:key — Get single setting by key
  // ============================================
  fastify.get('/:key', async (request: FastifyRequest<{
    Params: { key: string };
  }>, reply) => {
    const setting = await getSetting(request.params.key);
    if (!setting) {
      return reply.status(404).send({
        success: false,
        error: { code: 'SETTINGS_001', message: 'Setting not found' },
      });
    }
    return { success: true, data: setting };
  });

  // ============================================
  // PUT /admin/settings/:key — Upsert a single setting
  // ============================================
  fastify.put('/:key', async (request: FastifyRequest<{
    Params: { key: string };
    Body: { value: unknown; description?: string | null; is_public?: boolean };
  }>, reply) => {
    const { key } = request.params;
    const { value, description, is_public } = request.body as {
      value: unknown;
      description?: string | null;
      is_public?: boolean;
    };

    if (value === undefined) {
      return reply.status(400).send({
        success: false,
        error: { code: 'SETTINGS_002', message: 'value is required' },
      });
    }

    const setting = await upsertSetting(key, value, description, is_public);
    return { success: true, data: setting };
  });

  // ============================================
  // PUT /admin/settings — Bulk upsert settings
  // ============================================
  fastify.put('/', async (request: FastifyRequest<{
    Body: { settings: Array<{ key: string; value: unknown; description?: string | null }> };
  }>, reply) => {
    const { settings } = request.body as {
      settings: Array<{ key: string; value: unknown; description?: string | null }>;
    };

    if (!settings || !Array.isArray(settings) || settings.length === 0) {
      return reply.status(400).send({
        success: false,
        error: { code: 'SETTINGS_003', message: 'settings array is required' },
      });
    }

    // Validate each setting has key and value
    for (const s of settings) {
      if (!s.key || s.value === undefined) {
        return reply.status(400).send({
          success: false,
          error: { code: 'SETTINGS_004', message: `Each setting must have key and value. Invalid: ${s.key}` },
        });
      }
    }

    const results = await bulkUpsertSettings(settings);
    return { success: true, data: { settings: results } };
  });

  // ============================================
  // DELETE /admin/settings/:key — Delete a setting
  // ============================================
  fastify.delete('/:key', async (request: FastifyRequest<{
    Params: { key: string };
  }>, reply) => {
    const deleted = await deleteSetting(request.params.key);
    if (!deleted) {
      return reply.status(404).send({
        success: false,
        error: { code: 'SETTINGS_001', message: 'Setting not found' },
      });
    }
    return { success: true, message: 'Setting deleted' };
  });
}
