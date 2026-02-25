/**
 * Audit Log Utility
 *
 * Fire-and-warn: audit log writes NEVER throw. If the insert fails the main
 * request still succeeds — failure is only logged as a warning so ops can
 * investigate without breaking user-facing flows.
 *
 * Usage:
 *   await createAuditLog({
 *     organization_id: org.id,
 *     user_id: request.user.userId,
 *     action: 'org.update',
 *     resource_type: 'organization',
 *     resource_id: org.id,
 *     old_values: { is_active: true },
 *     new_values: { is_active: false },
 *     ip_address: request.ip,
 *     user_agent: request.headers['user-agent'],
 *   });
 */

import prisma from '../config/database';
import logger from '../config/logger';

export interface AuditLogPayload {
  organization_id: string;
  user_id?: string | null;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

/**
 * Creates an audit log entry.
 * All errors are swallowed (logged as warnings) so the main request
 * is never affected by audit log failures.
 */
export async function createAuditLog(payload: AuditLogPayload): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organization_id: payload.organization_id,
        user_id: payload.user_id ?? null,
        action: payload.action,
        resource_type: payload.resource_type,
        resource_id: payload.resource_id ?? null,
        old_values: payload.old_values ? (payload.old_values as object) : undefined,
        new_values: payload.new_values ? (payload.new_values as object) : undefined,
        ip_address: payload.ip_address ?? null,
        user_agent: payload.user_agent ?? null,
      },
    });
  } catch (err) {
    logger.warn({ err, action: payload.action, resourceId: payload.resource_id }, 'Failed to write audit log — ignoring');
  }
}
