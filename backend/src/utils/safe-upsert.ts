/**
 * PATCH-093: Shared safe message upsert utility
 * Extracted from duplicate implementations in whatsapp.service.ts and baileys.service.ts
 *
 * Race-safe message upsert: Prisma upsert does SELECT then INSERT/UPDATE,
 * so two concurrent upserts for the same key can both SELECT "not found"
 * and then both try INSERT, causing P2002 unique constraint violation.
 * This wrapper catches P2002 and retries as a plain update.
 */

import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import logger from '../config/logger';

export async function safeMessageUpsert(args: Prisma.MessageUpsertArgs): Promise<void> {
  try {
    await prisma.message.upsert(args);
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      logger.debug({ where: args.where }, '🔄 [MSG] Upsert race detected (P2002), retrying as update');
      try {
        await prisma.message.update({ where: args.where, data: args.update });
      } catch (updateErr: any) {
        // PATCH-081: Re-throw instead of silently dropping the message
        logger.error({ where: args.where, err: updateErr.message }, '❌ [MSG] Update after P2002 also failed — re-throwing');
        throw updateErr;
      }
    } else {
      throw err;
    }
  }
}
