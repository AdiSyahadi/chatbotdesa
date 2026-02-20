/**
 * System Settings Module - Service Layer
 * CRUD for SystemSetting key-value store
 * @module settings/service
 */

import prisma from '../../config/database';
import logger from '../../config/logger';

export interface SystemSettingResponse {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  is_public: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Get all system settings (optionally filtered by key prefix)
 */
export async function getAllSettings(prefix?: string): Promise<SystemSettingResponse[]> {
  const where = prefix
    ? { key: { startsWith: prefix } }
    : {};

  const settings = await prisma.systemSetting.findMany({
    where,
    orderBy: { key: 'asc' },
  });

  return settings.map((s) => ({
    id: s.id,
    key: s.key,
    value: s.value,
    description: s.description,
    is_public: s.is_public,
    created_at: s.created_at,
    updated_at: s.updated_at,
  }));
}

/**
 * Get a single setting by key
 */
export async function getSetting(key: string): Promise<SystemSettingResponse | null> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key },
  });

  if (!setting) return null;

  return {
    id: setting.id,
    key: setting.key,
    value: setting.value,
    description: setting.description,
    is_public: setting.is_public,
    created_at: setting.created_at,
    updated_at: setting.updated_at,
  };
}

/**
 * Upsert a system setting (create or update by key)
 */
export async function upsertSetting(
  key: string,
  value: unknown,
  description?: string | null,
  isPublic?: boolean
): Promise<SystemSettingResponse> {
  const setting = await prisma.systemSetting.upsert({
    where: { key },
    create: {
      key,
      value: value as any,
      description: description ?? null,
      is_public: isPublic ?? false,
    },
    update: {
      value: value as any,
      ...(description !== undefined ? { description } : {}),
      ...(isPublic !== undefined ? { is_public: isPublic } : {}),
    },
  });

  logger.info({ key }, 'System setting upserted');

  return {
    id: setting.id,
    key: setting.key,
    value: setting.value,
    description: setting.description,
    is_public: setting.is_public,
    created_at: setting.created_at,
    updated_at: setting.updated_at,
  };
}

/**
 * Bulk upsert multiple settings at once
 */
export async function bulkUpsertSettings(
  settings: Array<{ key: string; value: unknown; description?: string | null }>
): Promise<SystemSettingResponse[]> {
  const results: SystemSettingResponse[] = [];

  for (const s of settings) {
    const result = await upsertSetting(s.key, s.value, s.description);
    results.push(result);
  }

  logger.info({ count: settings.length }, 'Bulk system settings upserted');
  return results;
}

/**
 * Delete a system setting by key
 */
export async function deleteSetting(key: string): Promise<boolean> {
  const existing = await prisma.systemSetting.findUnique({ where: { key } });
  if (!existing) return false;

  await prisma.systemSetting.delete({ where: { key } });
  logger.info({ key }, 'System setting deleted');
  return true;
}

/**
 * Get settings as a flat key-value map (useful for getting a group of settings)
 */
export async function getSettingsMap(prefix: string): Promise<Record<string, unknown>> {
  const settings = await getAllSettings(prefix);
  const map: Record<string, unknown> = {};
  for (const s of settings) {
    // Strip prefix from key for convenience: "midtrans.server_key" -> "server_key"
    const shortKey = s.key.startsWith(prefix) ? s.key.slice(prefix.length) : s.key;
    map[shortKey] = s.value;
  }
  return map;
}
