/**
 * Subscription Expiry Worker
 *
 * Runs daily at 01:00 UTC (one hour after daily-reset to avoid contention).
 * Responsible for the subscription lifecycle transitions:
 *
 *   TRIAL   → EXPIRED  when trial_ends_at < now
 *   ACTIVE  → EXPIRED  when Subscription.current_period_end < now
 *   PAST_DUE→ EXPIRED  when Subscription.current_period_end < now (grace period elapsed)
 *
 * Without this worker, a trial that ends is never expired — users get free access forever.
 *
 * @module workers/subscription-expiry
 */

import { Queue, Worker } from 'bullmq';
import prisma from '../config/database';
import logger from '../config/logger';
import redisConnectionOptions from '../config/redis-connection';

const QUEUE_NAME = 'subscription-expiry';

let subscriptionExpiryQueue: Queue | null = null;
let subscriptionExpiryWorker: Worker | null = null;

// ============================================
// CORE EXPIRY LOGIC
// ============================================

/**
 * Process subscription expiries.
 *
 * Two independent checks run in sequence:
 *  1. Trial expiry — orgs where trial_ends_at has passed but status is still TRIAL
 *  2. Paid subscription expiry — Subscription records past current_period_end
 *
 * Each check is wrapped individually so a failure in one does not block the other.
 */
export async function processSubscriptionExpiries(): Promise<{
  trialsExpired: number;
  subscriptionsExpired: number;
}> {
  const now = new Date();
  let trialsExpired = 0;
  let subscriptionsExpired = 0;

  // ------------------------------------------
  // 1. TRIAL EXPIRY
  // ------------------------------------------
  // Find all Organizations still in TRIAL status whose trial period has ended.
  // These were either never converted (no Subscription record) or are free-trial orgs.
  try {
    const expiredTrialOrgs = await prisma.organization.findMany({
      where: {
        subscription_status: 'TRIAL',
        trial_ends_at: { lt: now },
        deleted_at: null,
      },
      select: { id: true, name: true, trial_ends_at: true },
    });

    if (expiredTrialOrgs.length > 0) {
      // Bulk update all expired trial orgs to EXPIRED
      const result = await prisma.organization.updateMany({
        where: {
          id: { in: expiredTrialOrgs.map((o) => o.id) },
          subscription_status: 'TRIAL', // re-check status to avoid race conditions
        },
        data: {
          subscription_status: 'EXPIRED',
        },
      });

      trialsExpired = result.count;
      logger.info(
        {
          count: result.count,
          orgIds: expiredTrialOrgs.map((o) => o.id),
        },
        `⏰ [EXPIRY] ${result.count} trial subscription(s) expired`
      );
    } else {
      logger.info('✅ [EXPIRY] No expired trials found');
    }
  } catch (error) {
    // Non-fatal: log and continue to paid subscription check
    logger.error({ error }, '❌ [EXPIRY] Failed to process trial expiries');
  }

  // ------------------------------------------
  // 2. PAID SUBSCRIPTION EXPIRY
  // ------------------------------------------
  // Find Subscription records where current_period_end has passed.
  // This covers ACTIVE and PAST_DUE subscriptions that were never renewed.
  try {
    const expiredSubscriptions = await prisma.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'PAST_DUE'] },
        current_period_end: { lt: now },
      },
      select: {
        id: true,
        organization_id: true,
        status: true,
        current_period_end: true,
        organization: {
          select: { name: true },
        },
      },
    });

    if (expiredSubscriptions.length > 0) {
      // Process each expired subscription in a transaction:
      // mark Subscription as EXPIRED + update Org.subscription_status to EXPIRED
      for (const sub of expiredSubscriptions) {
        try {
          await prisma.$transaction([
            prisma.subscription.update({
              where: { id: sub.id },
              data: { status: 'EXPIRED' },
            }),
            prisma.organization.update({
              where: { id: sub.organization_id },
              data: { subscription_status: 'EXPIRED' },
            }),
          ]);

          subscriptionsExpired++;
          logger.info(
            {
              subscriptionId: sub.id,
              organizationId: sub.organization_id,
              orgName: sub.organization.name,
              expiredAt: sub.current_period_end,
            },
            '⏰ [EXPIRY] Paid subscription expired'
          );
        } catch (subError) {
          // Log individual failure without aborting the loop
          logger.error(
            { error: subError, subscriptionId: sub.id },
            '❌ [EXPIRY] Failed to expire individual subscription'
          );
        }
      }
    } else {
      logger.info('✅ [EXPIRY] No expired paid subscriptions found');
    }
  } catch (error) {
    logger.error({ error }, '❌ [EXPIRY] Failed to process paid subscription expiries');
  }

  logger.info(
    { trialsExpired, subscriptionsExpired },
    `✅ [EXPIRY] Subscription expiry run complete`
  );

  return { trialsExpired, subscriptionsExpired };
}

// ============================================
// WORKER LIFECYCLE
// ============================================

/**
 * Start the subscription expiry worker.
 * Cron: 0 1 * * * — runs at 01:00 UTC daily.
 * Offset by 1 hour from daily-reset (00:00) to avoid Redis contention.
 */
export async function startSubscriptionExpiryWorker(): Promise<void> {
  try {
    subscriptionExpiryQueue = new Queue(QUEUE_NAME, {
      connection: redisConnectionOptions,
    });

    // Remove existing repeatable jobs to prevent duplicates on restart
    const existingJobs = await subscriptionExpiryQueue.getRepeatableJobs();
    for (const job of existingJobs) {
      await subscriptionExpiryQueue.removeRepeatableByKey(job.key);
    }

    // Add repeatable job — runs at 01:00 UTC every day
    await subscriptionExpiryQueue.add(
      'process-expiries',
      {},
      {
        repeat: { pattern: '0 1 * * *' }, // Cron: 01:00 UTC daily
        removeOnComplete: { count: 7 },    // Keep last 7 results
        removeOnFail: { count: 30 },       // Keep last 30 failures
      }
    );

    subscriptionExpiryWorker = new Worker(
      QUEUE_NAME,
      async (job) => {
        logger.info(`[SUBSCRIPTION-EXPIRY] Job started: ${job.id}`);
        const result = await processSubscriptionExpiries();
        return { success: true, ...result, timestamp: new Date().toISOString() };
      },
      { connection: redisConnectionOptions, concurrency: 1 }
    );

    // Startup catch-up: if last run was before today's 01:00 UTC, run now.
    // Covers the case where Docker was offline at 01:00.
    try {
      const today1amUtc = new Date();
      today1amUtc.setUTCHours(1, 0, 0, 0);

      const completedJobs = await subscriptionExpiryQueue!.getJobs(['completed'], 0, 1, true);
      const lastRunMs = completedJobs[0]?.finishedOn ?? 0;

      if (lastRunMs < today1amUtc.getTime()) {
        logger.warn(
          {
            lastRunAt: lastRunMs ? new Date(lastRunMs).toISOString() : 'never',
            today1am: today1amUtc.toISOString(),
          },
          '⚠️ [STARTUP-EXPIRY] Missed daily expiry run — running catch-up now'
        );
        await processSubscriptionExpiries();
      } else {
        logger.info(
          { lastRunAt: new Date(lastRunMs).toISOString() },
          '✅ [STARTUP-EXPIRY] Expiry already ran today, no catch-up needed'
        );
      }
    } catch (catchUpErr) {
      // Non-fatal — worst case: expired orgs remain active until next scheduled run
      logger.error({ error: catchUpErr }, '⚠️ [STARTUP-EXPIRY] Could not check for missed expiry run');
    }

    subscriptionExpiryWorker.on('completed', (job) => {
      logger.info(`[SUBSCRIPTION-EXPIRY] Job completed: ${job?.id}`);
    });

    subscriptionExpiryWorker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, error: err.message }, '[SUBSCRIPTION-EXPIRY] Job failed');
    });

    logger.info('⏰ Subscription expiry worker started (BullMQ cron: 0 1 * * *)');
  } catch (error) {
    logger.warn({ error }, 'Failed to start subscription expiry worker — Redis may not be available');
  }
}

/**
 * Stop the subscription expiry worker
 */
export async function stopSubscriptionExpiryWorker(): Promise<void> {
  try {
    await subscriptionExpiryWorker?.close();
    await subscriptionExpiryQueue?.close();
    subscriptionExpiryWorker = null;
    subscriptionExpiryQueue = null;
    logger.info('⏰ Subscription expiry worker stopped');
  } catch (error) {
    logger.error({ error }, 'Error stopping subscription expiry worker');
  }
}
