/**
 * Daily Reset Worker
 * Resets daily message counts and updates warming phases
 * Uses BullMQ repeatable job (cron) for drift-free scheduling
 */

import { Queue, Worker } from 'bullmq';
import prisma from '../config/database';
import logger from '../config/logger';
import config from '../config';

const WARMING_PHASE_LIMITS = {
  DAY_1_3: { daily_limit: 20, min_delay_ms: 5000, max_messages_per_hour: 5 },
  DAY_4_7: { daily_limit: 50, min_delay_ms: 3000, max_messages_per_hour: 15 },
  DAY_8_14: { daily_limit: 100, min_delay_ms: 2000, max_messages_per_hour: 30 },
  DAY_15_PLUS: { daily_limit: 200, min_delay_ms: 1000, max_messages_per_hour: 60 },
} as const;

type WarmingPhase = keyof typeof WARMING_PHASE_LIMITS;

const QUEUE_NAME = 'daily-reset';

const redisConnectionOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
};

let dailyResetQueue: Queue | null = null;
let dailyResetWorker: Worker | null = null;

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
 * Start the daily reset worker using BullMQ repeatable job
 * Drift-free, restart-resilient, automatically deduplicated
 */
export async function startDailyResetWorker(): Promise<void> {
  try {
    dailyResetQueue = new Queue(QUEUE_NAME, {
      connection: redisConnectionOptions,
    });

    // Remove existing repeatable jobs to prevent duplicates on restart
    const existingJobs = await dailyResetQueue.getRepeatableJobs();
    for (const job of existingJobs) {
      await dailyResetQueue.removeRepeatableByKey(job.key);
    }

    // Add repeatable job — runs at midnight every day
    await dailyResetQueue.add('reset-counts', {}, {
      repeat: { pattern: '0 0 * * *' }, // Cron: midnight every day
      removeOnComplete: { count: 7 },    // Keep last 7 results
      removeOnFail: { count: 30 },       // Keep last 30 failures
    });

    dailyResetWorker = new Worker(
      QUEUE_NAME,
      async (job) => {
        logger.info(`[DAILY-RESET] Job started: ${job.id}`);
        await resetDailyCounts();
        return { success: true, timestamp: new Date().toISOString() };
      },
      { connection: redisConnectionOptions, concurrency: 1 }
    );

    dailyResetWorker.on('completed', (job) => {
      logger.info(`[DAILY-RESET] Job completed: ${job?.id}`);
    });

    dailyResetWorker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, error: err.message }, '[DAILY-RESET] Job failed');
    });

    logger.info('🔄 Daily reset worker started (BullMQ cron: 0 0 * * *)');
  } catch (error) {
    logger.warn({ error }, 'Failed to start daily reset worker — Redis may not be available');
  }
}

/**
 * Stop the daily reset worker
 */
export async function stopDailyResetWorker(): Promise<void> {
  try {
    await dailyResetWorker?.close();
    await dailyResetQueue?.close();
    dailyResetWorker = null;
    dailyResetQueue = null;
    logger.info('🔄 Daily reset worker stopped');
  } catch (error) {
    logger.error({ error }, 'Error stopping daily reset worker');
  }
}
