/**
 * Daily Reset Worker
 * Resets daily message counts and updates warming phases
 * Runs every day at midnight (00:00)
 */

import { PrismaClient } from '@prisma/client';
import logger from '../config/logger';

const prisma = new PrismaClient();

const WARMING_PHASE_LIMITS = {
  DAY_1_3: { daily_limit: 20, min_delay_ms: 5000, max_messages_per_hour: 5 },
  DAY_4_7: { daily_limit: 50, min_delay_ms: 3000, max_messages_per_hour: 15 },
  DAY_8_14: { daily_limit: 100, min_delay_ms: 2000, max_messages_per_hour: 30 },
  DAY_15_PLUS: { daily_limit: 200, min_delay_ms: 1000, max_messages_per_hour: 60 },
} as const;

type WarmingPhase = keyof typeof WARMING_PHASE_LIMITS;

let resetInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Calculate milliseconds until next midnight
 */
function msUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

/**
 * Determine the correct warming phase based on account age
 */
function getWarmingPhase(accountAgeDays: number): WarmingPhase {
  if (accountAgeDays >= 15) return 'DAY_15_PLUS';
  if (accountAgeDays >= 8) return 'DAY_8_14';
  if (accountAgeDays >= 4) return 'DAY_4_7';
  return 'DAY_1_3';
}

/**
 * Reset daily message counts and update warming phases
 */
export async function resetDailyCounts(): Promise<void> {
  try {
    logger.info('🔄 Running daily reset: message counts + warming phases...');

    // 1. Reset daily_message_count to 0 and increment account_age_days
    const resetResult = await prisma.whatsAppInstance.updateMany({
      where: { deleted_at: null },
      data: {
        daily_message_count: 0,
        account_age_days: { increment: 1 },
      },
    });

    logger.info(`📊 Reset daily counts for ${resetResult.count} instances`);

    // 2. Update warming phases based on new account_age_days
    const instances = await prisma.whatsAppInstance.findMany({
      where: { deleted_at: null },
      select: { id: true, account_age_days: true, warming_phase: true, daily_limit: true },
    });

    let updated = 0;
    for (const instance of instances) {
      const correctPhase = getWarmingPhase(instance.account_age_days);
      const correctLimit = WARMING_PHASE_LIMITS[correctPhase].daily_limit;

      if (instance.warming_phase !== correctPhase || instance.daily_limit !== correctLimit) {
        await prisma.whatsAppInstance.update({
          where: { id: instance.id },
          data: {
            warming_phase: correctPhase,
            daily_limit: correctLimit,
          },
        });
        logger.info({
          instanceId: instance.id,
          oldPhase: instance.warming_phase,
          newPhase: correctPhase,
          oldLimit: instance.daily_limit,
          newLimit: correctLimit,
          ageDays: instance.account_age_days,
        }, '📈 Warming phase updated');
        updated++;
      }
    }

    logger.info(`✅ Daily reset complete. ${resetResult.count} instances reset, ${updated} phases updated`);
  } catch (error) {
    logger.error({ error }, '❌ Error during daily reset');
  }
}

/**
 * Start the daily reset worker
 * Runs at midnight, then every 24 hours
 */
export function startDailyResetWorker(): void {
  const msToMidnight = msUntilMidnight();
  const hoursToMidnight = (msToMidnight / 1000 / 60 / 60).toFixed(1);

  logger.info({
    nextResetIn: `${hoursToMidnight} hours`,
  }, '🔄 Daily reset worker started');

  // Schedule first run at midnight
  setTimeout(() => {
    resetDailyCounts();

    // Then run every 24 hours
    resetInterval = setInterval(() => {
      resetDailyCounts();
    }, 24 * 60 * 60 * 1000);
  }, msToMidnight);
}

/**
 * Stop the daily reset worker
 */
export function stopDailyResetWorker(): void {
  if (resetInterval) {
    clearInterval(resetInterval);
    resetInterval = null;
    logger.info('🔄 Daily reset worker stopped');
  }
}
