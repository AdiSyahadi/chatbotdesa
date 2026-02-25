/**
 * Workers Module - Main Entry Point
 * @module workers
 * 
 * Can be run as a separate process:
 * npx tsx src/workers/index.ts
 */

import { createBroadcastWorker } from './broadcast.worker';
import { createWebhookWorker, stopWebhookWorker } from './webhook.worker';
import { startMediaCleanupWorker, stopMediaCleanupWorker } from './media-cleanup.worker';
import { startDailyResetWorker, stopDailyResetWorker } from './daily-reset.worker';
import { startSubscriptionExpiryWorker, stopSubscriptionExpiryWorker } from './subscription-expiry.worker';
import logger from '../config/logger';

// Track active workers
let broadcastWorker: ReturnType<typeof createBroadcastWorker> | null = null;
let webhookWorker: ReturnType<typeof createWebhookWorker> | null = null;

/**
 * Initialize all workers
 */
export async function initializeWorkers(): Promise<void> {
  logger.info('Initializing workers...');

  try {
    // Start broadcast worker
    broadcastWorker = createBroadcastWorker();
    
    // Start webhook worker
    webhookWorker = createWebhookWorker();

    // Start media cleanup worker
    startMediaCleanupWorker();

    // Start daily reset worker (resets message counts & updates warming phases at midnight)
    await startDailyResetWorker();

    // Start subscription expiry worker (expires TRIAL/ACTIVE subscriptions past their end date at 01:00 UTC)
    await startSubscriptionExpiryWorker();
    
    logger.info('All workers initialized');
  } catch (error) {
    logger.warn({ error }, 'Failed to initialize workers - Redis may not be available');
  }
}

/**
 * Shutdown all workers gracefully
 */
export async function shutdownWorkers(): Promise<void> {
  logger.info('Shutting down workers...');

  if (broadcastWorker) {
    await broadcastWorker.close();
  }

  if (webhookWorker) {
    await stopWebhookWorker();
  }

  stopMediaCleanupWorker();
  await stopDailyResetWorker();
  await stopSubscriptionExpiryWorker();

  logger.info('All workers stopped');
}

// If run directly (standalone worker process)
if (require.main === module) {
  logger.info('Starting workers in standalone mode...');
  
  initializeWorkers().catch(err => logger.error({ err }, 'Worker init failed'));

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...');
    await shutdownWorkers();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await shutdownWorkers();
    process.exit(0);
  });
}

export { createBroadcastWorker };
export { createWebhookWorker, stopWebhookWorker } from './webhook.worker';
