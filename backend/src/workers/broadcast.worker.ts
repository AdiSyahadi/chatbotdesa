/**
 * Broadcast Worker - Processes broadcast messages via BullMQ
 * @module workers/broadcast.worker
 */

import { Worker, Job } from 'bullmq';
import prisma from '../config/database';
import logger from '../config/logger';
import {
  BroadcastJobData,
  BroadcastMessageJobData,
  replaceVariables,
  getRandomDelay,
  MessageTypeValue,
} from '../modules/broadcasts/broadcasts.schema';
import {
  sendTextMessage,
  sendMediaMessage,
  isConnected,
} from '../modules/whatsapp/baileys.service';

// Redis connection options for BullMQ (requires separate connection)
const redisConnectionOptions = {
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: null,
};

// ============================================
// BROADCAST WORKER
// ============================================

/**
 * Process a single broadcast
 */
async function processBroadcast(job: Job<BroadcastJobData>): Promise<void> {
  const { broadcast_id, organization_id, instance_id } = job.data;

  logger.info({ broadcastId: broadcast_id }, 'Starting broadcast processing');

  try {
    // Get broadcast details
    const broadcast = await prisma.broadcast.findUnique({
      where: { id: broadcast_id },
    });

    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    // Check if paused or cancelled
    if (broadcast.status === 'PAUSED' || broadcast.status === 'FAILED') {
      logger.info({ broadcastId: broadcast_id, status: broadcast.status }, 'Broadcast stopped');
      return;
    }

    // Check instance connection
    if (!isConnected(instance_id)) {
      logger.error({ broadcastId: broadcast_id, instanceId: instance_id }, 'Instance not connected');
      await prisma.broadcast.update({
        where: { id: broadcast_id },
        data: { status: 'FAILED' },
      });
      return;
    }

    // Get pending recipients
    const pendingRecipients = await prisma.broadcastRecipient.findMany({
      where: {
        broadcast_id,
        status: 'PENDING',
      },
      take: 100, // Process in batches of 100
    });

    if (pendingRecipients.length === 0) {
      // All done, mark as completed
      await prisma.broadcast.update({
        where: { id: broadcast_id },
        data: {
          status: 'COMPLETED',
          completed_at: new Date(),
        },
      });
      logger.info({ broadcastId: broadcast_id }, 'Broadcast completed');
      return;
    }

    // Process each recipient
    for (const recipient of pendingRecipients) {
      // Re-check broadcast status
      const currentBroadcast = await prisma.broadcast.findUnique({
        where: { id: broadcast_id },
        select: { status: true },
      });

      if (currentBroadcast?.status === 'PAUSED' || currentBroadcast?.status === 'FAILED') {
        logger.info({ broadcastId: broadcast_id }, 'Broadcast paused/cancelled during processing');
        return;
      }

      try {
        // Format phone number to JID
        const jid = `${recipient.phone_number}@s.whatsapp.net`;

        // Replace variables in content
        const content = broadcast.content
          ? replaceVariables(broadcast.content, recipient.variables as Record<string, any> | null)
          : null;
        const caption = broadcast.caption
          ? replaceVariables(broadcast.caption, recipient.variables as Record<string, any> | null)
          : null;

        // Send message based on type
        let success = false;
        let errorMessage: string | null = null;

        try {
          if (broadcast.message_type === 'TEXT') {
            if (content) {
              await sendTextMessage(instance_id, jid, content);
              success = true;
            }
          } else if (['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT'].includes(broadcast.message_type)) {
            if (broadcast.media_url) {
              await sendMediaMessage(
                instance_id,
                jid,
                broadcast.media_url,
                broadcast.message_type.toLowerCase() as 'image' | 'video' | 'audio' | 'document',
                caption || undefined
              );
              success = true;
            }
          }
        } catch (sendError) {
          errorMessage = sendError instanceof Error ? sendError.message : 'Send failed';
          logger.error(
            { broadcastId: broadcast_id, recipientId: recipient.id, error: errorMessage },
            'Failed to send message'
          );
        }

        // Update recipient status
        if (success) {
          await prisma.broadcastRecipient.update({
            where: { id: recipient.id },
            data: {
              status: 'SENT',
              sent_at: new Date(),
            },
          });

          // Update broadcast sent count
          await prisma.broadcast.update({
            where: { id: broadcast_id },
            data: { sent_count: { increment: 1 } },
          });
        } else {
          await prisma.broadcastRecipient.update({
            where: { id: recipient.id },
            data: {
              status: 'FAILED',
              failed_at: new Date(),
              error_message: errorMessage,
            },
          });

          // Update broadcast failed count
          await prisma.broadcast.update({
            where: { id: broadcast_id },
            data: { failed_count: { increment: 1 } },
          });
        }

        // Update job progress
        const totalProcessed = await prisma.broadcastRecipient.count({
          where: {
            broadcast_id,
            status: { in: ['SENT', 'DELIVERED', 'READ', 'FAILED'] },
          },
        });

        await job.updateProgress(
          Math.round((totalProcessed / broadcast.recipient_count) * 100)
        );

        // Add delay between messages (anti-ban)
        const delay = getRandomDelay(broadcast.delay_min_ms, broadcast.delay_max_ms);
        await sleep(delay);

      } catch (recipientError) {
        logger.error(
          { broadcastId: broadcast_id, recipientId: recipient.id, error: recipientError },
          'Error processing recipient'
        );

        await prisma.broadcastRecipient.update({
          where: { id: recipient.id },
          data: {
            status: 'FAILED',
            failed_at: new Date(),
            error_message: recipientError instanceof Error ? recipientError.message : 'Unknown error',
          },
        });

        await prisma.broadcast.update({
          where: { id: broadcast_id },
          data: { failed_count: { increment: 1 } },
        });
      }
    }

    // Check if more recipients remain
    const remainingCount = await prisma.broadcastRecipient.count({
      where: {
        broadcast_id,
        status: 'PENDING',
      },
    });

    if (remainingCount > 0) {
      // Re-queue for next batch
      // The job will be re-triggered by the main queue
      logger.info(
        { broadcastId: broadcast_id, remaining: remainingCount },
        'Continuing broadcast with remaining recipients'
      );

      // Add a small delay before next batch
      await sleep(2000);
      
      // Re-process (will be called again by the worker)
      await processBroadcast(job);
    } else {
      // All done
      await prisma.broadcast.update({
        where: { id: broadcast_id },
        data: {
          status: 'COMPLETED',
          completed_at: new Date(),
        },
      });
      logger.info({ broadcastId: broadcast_id }, 'Broadcast completed');
    }

  } catch (error) {
    logger.error({ broadcastId: broadcast_id, error }, 'Broadcast processing error');

    await prisma.broadcast.update({
      where: { id: broadcast_id },
      data: { status: 'FAILED' },
    });

    throw error;
  }
}

// ============================================
// WORKER CREATION
// ============================================

/**
 * Create and start the broadcast worker
 * Returns null if Redis is not available
 */
export function createBroadcastWorker(): Worker<BroadcastJobData> | null {
  try {
    const worker = new Worker<BroadcastJobData>(
      'broadcast-queue',
      processBroadcast,
      {
        connection: redisConnectionOptions,
        concurrency: 1, // Process one broadcast at a time
        limiter: {
          max: 1,
          duration: 1000,
        },
      }
    );

    worker.on('completed', (job) => {
      logger.info({ jobId: job.id, broadcastId: job.data.broadcast_id }, 'Broadcast job completed');
    });

    worker.on('failed', (job, err) => {
      logger.error(
        { jobId: job?.id, broadcastId: job?.data.broadcast_id, error: err.message },
      'Broadcast job failed'
    );
  });

  worker.on('progress', (job, progress) => {
    logger.info(
      { jobId: job.id, broadcastId: job.data.broadcast_id, progress },
      'Broadcast job progress'
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, 'Broadcast worker error');
  });

  logger.info('Broadcast worker started');
  return worker;
  } catch (error) {
    logger.warn('Failed to create broadcast worker - Redis may not be available');
    return null;
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export for testing
export { processBroadcast };
