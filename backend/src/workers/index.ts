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
import logger from '../config/logger';

// Track active workers
let broadcastWorker: ReturnType<typeof createBroadcastWorker> | null = null;
let webhookWorker: ReturnType<typeof createWebhookWorker> | null = null;

/**
 * Initialize all workers
 */
export function initializeWorkers(): void {
  logger.info('Initializing workers...');

  try {
    // Start broadcast worker
    broadcastWorker = createBroadcastWorker();
    
    // Start webhook worker
    webhookWorker = createWebhookWorker();

    // Start media cleanup worker
    startMediaCleanupWorker();

    // Start daily reset worker (resets message counts & updates warming phases at midnight)
    startDailyResetWorker();
    
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
  stopDailyResetWorker();

  logger.info('All workers stopped');
}

// If run directly (standalone worker process)
if (require.main === module) {
  console.log('Starting workers in standalone mode...');
  
  initializeWorkers();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down...');
    await shutdownWorkers();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down...');
    await shutdownWorkers();
    process.exit(0);
  });
}

export { createBroadcastWorker };
export { createWebhookWorker, stopWebhookWorker } from './webhook.worker';
