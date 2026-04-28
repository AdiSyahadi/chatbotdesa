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
  canSendMessage,
} from '../modules/whatsapp/baileys.service';

import redisConnectionOptions from '../config/redis-connection';

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

    // Iterative batch processing (avoids stack overflow from recursion)
    while (true) {
      // Get pending recipients in batches of 100
      const pendingRecipients = await prisma.broadcastRecipient.findMany({
        where: {
          broadcast_id,
          status: 'PENDING',
        },
        take: 100,
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

      // Process each recipient in current batch
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

        // Enforce daily outgoing message limit before each send
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const [org, messagesSentToday] = await Promise.all([
          prisma.organization.findUnique({
            where: { id: organization_id },
            select: { max_messages_per_day: true },
          }),
          prisma.message.count({
            where: {
              organization_id,
              direction: 'OUTGOING',
              sent_at: { gte: startOfDay },
            },
          }),
        ]);
        if (org && messagesSentToday >= org.max_messages_per_day) {
          logger.warn(
            { broadcastId: broadcast_id, sentToday: messagesSentToday, limit: org.max_messages_per_day },
            'Daily message limit reached — pausing broadcast'
          );
          await prisma.broadcast.update({
            where: { id: broadcast_id },
            data: { status: 'PAUSED', paused_reason: `Batas harian organisasi tercapai (${messagesSentToday}/${org.max_messages_per_day} pesan). Broadcast akan otomatis lanjut besok atau bisa di-resume manual.` },
          });
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

          // PATCH-181: Enforce health_score and min_delay_ms before each send
          const canSend = await canSendMessage(instance_id);
          if (!canSend.allowed) {
            if (canSend.wait_ms && canSend.wait_ms > 0) {
              // min_delay not elapsed — wait the required time then continue
              await sleep(canSend.wait_ms);
            } else {
              // health_score too low or daily limit exceeded — pause broadcast (anti-ban)
              logger.warn(
                { broadcastId: broadcast_id, reason: canSend.reason },
                'Broadcast paused: canSendMessage check failed'
              );
              await prisma.broadcast.update({
                where: { id: broadcast_id },
                data: { status: 'PAUSED', paused_reason: canSend.reason || 'Anti-ban protection aktif. Coba resume setelah beberapa saat.' },
              });
              return;
            }
          }

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

          // Add delay between messages (anti-ban) — fallback to safe defaults if null
          const delayMs = getRandomDelay(broadcast.delay_min_ms ?? 1000, broadcast.delay_max_ms ?? 3000);
          await sleep(delayMs);

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

      // Delay between batches
      await sleep(2000);

      logger.info(
        { broadcastId: broadcast_id },
        'Continuing broadcast with next batch'
      );
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
