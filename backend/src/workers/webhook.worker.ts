/**
 * Webhook Worker - Processes webhook deliveries via BullMQ
 * @module workers/webhook.worker
 */

import { Worker, Job } from 'bullmq';
import prisma from '../config/database';
import logger from '../config/logger';
import { WebhookService } from '../modules/webhooks/webhooks.service';
import { WebhookPayload } from '../modules/webhooks/webhooks.schema';
import { getSocket, extractPhoneFromJid, canSendMessage } from '../modules/whatsapp/baileys.service';
import { WEBHOOK_CONFIG } from '../config/constants';

import redisConnectionOptions from '../config/redis-connection';

// ============================================
// WEBHOOK JOB DATA TYPE
// ============================================

interface WebhookJobData {
  webhookId: string;
  webhookUrl: string;
  webhookSecret?: string | null;
  payload: WebhookPayload;
}

// ============================================
// WEBHOOK WORKER
// ============================================

/**
 * Process webhook delivery
 */
async function processWebhook(job: Job<WebhookJobData>): Promise<void> {
  const { webhookId, webhookUrl, webhookSecret, payload } = job.data;
  const attemptNumber = job.attemptsMade + 1;

  logger.info(
    { webhookId, attemptNumber, eventType: payload.event },
    'Processing webhook delivery'
  );

  try {
    // Use the service to deliver webhook
    const webhookService = new WebhookService();
    const result = await webhookService.deliverWebhook(webhookUrl, payload, webhookSecret);

    // Update webhook status
    await webhookService.updateWebhookStatus(webhookId, result.success, attemptNumber, result);

    if (result.success) {
      logger.info(
        { webhookId, responseStatus: result.responseStatus, durationMs: result.durationMs },
        'Webhook delivered successfully'
      );

      // ============================================
      // AUTO-REPLY: Send webhook response back to WhatsApp
      // Only if auto_reply_enabled is true for this instance (opt-in)
      // ============================================
      if (payload.event === 'message.received' && result.responseBody) {
        // Check if auto-reply is enabled for this instance
        const instance = await prisma.whatsAppInstance.findUnique({
          where: { id: payload.instance_id },
          select: { auto_reply_enabled: true, auto_reply_max_per_hour: true },
        });

        if (instance?.auto_reply_enabled) {
          // Check hourly rate limit for auto-replies
          const hourAgo = new Date(Date.now() - 3600000);
          const recentAutoReplies = await prisma.message.count({
            where: {
              instance_id: payload.instance_id,
              direction: 'OUTGOING',
              created_at: { gte: hourAgo },
            },
          });

          const maxPerHour = instance.auto_reply_max_per_hour || 30;
          if (recentAutoReplies < maxPerHour) {
            await handleAutoReply(payload, result.responseBody, webhookId);
          } else {
            logger.warn(
              { instanceId: payload.instance_id, recentAutoReplies, maxPerHour },
              'Auto-reply rate limit reached — skipping'
            );
          }
        }
      }
    } else {
      const maxAttempts = WEBHOOK_CONFIG.MAX_ATTEMPTS;
      const isLastAttempt = job.attemptsMade >= maxAttempts - 1;

      logger.warn(
        {
          webhookId,
          responseStatus: result.responseStatus,
          error: result.error,
          attemptNumber,
          maxAttempts,
          isLastAttempt,
        },
        `Webhook delivery failed (attempt ${attemptNumber}/${maxAttempts})`
      );

      // Throw error to trigger retry if not last attempt
      if (!isLastAttempt) {
        throw new Error(result.error || `HTTP ${result.responseStatus}`);
      }
    }
  } catch (error: any) {
    logger.error(
      { webhookId, error: error.message, attemptNumber },
      'Webhook delivery error'
    );

    // Update status on error
    const webhookService = new WebhookService();
    await webhookService.updateWebhookStatus(webhookId, false, attemptNumber, {
      error: error.message,
      durationMs: 0,
    });

    throw error; // Re-throw to trigger retry
  }
}

/**
 * Handle auto-reply from webhook response
 * Parses the webhook response body and sends it back as a WhatsApp message
 * 
 * Supported response formats:
 *   { "message": "Hello!" }
 *   { "text": "Hello!" }
 *   { "reply": "Hello!" }
 *   { "output": "Hello!" }
 *   Plain text string
 */
async function handleAutoReply(
  payload: WebhookPayload,
  responseBody: string,
  webhookId: string
): Promise<void> {
  try {
    const senderJid = payload.data?.from;
    const instanceId = payload.instance_id;

    if (!senderJid || !instanceId) {
      return;
    }

    // Skip auto-reply for status broadcasts
    if (senderJid === 'status@broadcast') return;

    // Parse response body to extract reply message
    let replyText: string | null = null;

    try {
      const responseData = JSON.parse(responseBody);

      // Support multiple response formats
      if (typeof responseData === 'string') {
        replyText = responseData;
      } else if (typeof responseData === 'object' && responseData !== null) {
        replyText = responseData.message
          || responseData.text
          || responseData.reply
          || responseData.output
          || null;
      }
    } catch {
      // Response is not JSON — check if it's plain text
      const trimmed = responseBody.trim();
      if (trimmed && !trimmed.startsWith('<') && !trimmed.startsWith('{')) {
        // Looks like plain text (not HTML or malformed JSON)
        replyText = trimmed;
      }
    }

    if (!replyText || replyText.trim().length === 0) {
      return; // No reply content found
    }

    // Clean up the reply text
    replyText = replyText.trim();

    // Check daily sending limit before auto-replying
    const canSend = await canSendMessage(instanceId);
    if (!canSend.allowed) {
      logger.warn({ instanceId, webhookId, reason: canSend.reason }, 'Auto-reply blocked by daily limit');
      return;
    }

    logger.info({ senderJid, replyPreview: replyText.substring(0, 50) }, '🤖 [AUTO-REPLY] Sending reply');

    // Get the active socket for this instance
    const socket = getSocket(instanceId);
    if (!socket?.user) {
      logger.warn({ instanceId, webhookId }, 'Cannot auto-reply: socket not connected');
      return;
    }

    // Send the reply directly via socket (supports both DM and group JIDs)
    await socket.sendMessage(senderJid, { text: replyText });

    // Update message count in database
    try {
      await prisma.whatsAppInstance.update({
        where: { id: instanceId },
        data: {
          daily_message_count: { increment: 1 },
          last_message_at: new Date(),
        },
      });
    } catch (e) {
      // Non-critical, don't fail the whole flow
    }

    // Save the outgoing message to database
    try {
      const organizationId = payload.organization_id;
      await prisma.message.create({
        data: {
          organization_id: organizationId,
          instance_id: instanceId,
          chat_jid: senderJid,
          sender_jid: socket.user.id || '',
          message_type: 'TEXT',
          content: replyText,
          direction: 'OUTGOING',
          status: 'SENT',
        },
      });
    } catch (e) {
      // Non-critical
    }

    logger.info(
      { webhookId, instanceId, to: senderJid, replyLength: replyText.length },
      '🤖 Auto-reply sent from webhook response'
    );
  } catch (error: any) {
    logger.error(
      { webhookId, error: error.message },
      'Error sending auto-reply from webhook response'
    );
    // Don't throw — auto-reply failure shouldn't affect webhook delivery status
  }
}

// ============================================
// WORKER INSTANCE
// ============================================

let webhookWorker: Worker | null = null;

/**
 * Create and start webhook worker
 */
export function createWebhookWorker(): Worker {
  if (webhookWorker) {
    return webhookWorker;
  }

  webhookWorker = new Worker(
    'webhooks',
    async (job: Job) => {
      if (job.name === 'deliver-webhook') {
        await processWebhook(job as Job<WebhookJobData>);
      } else {
        logger.warn({ jobName: job.name }, 'Unknown webhook job type');
      }
    },
    {
      connection: redisConnectionOptions,
      concurrency: 10, // Process up to 10 webhooks concurrently
      limiter: {
        max: 100, // Max 100 webhooks per second
        duration: 1000,
      },
    }
  );

  // Event handlers
  webhookWorker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Webhook job completed');
  });

  webhookWorker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message },
      'Webhook job failed'
    );
  });

  webhookWorker.on('error', (err) => {
    logger.error({ error: err.message }, 'Webhook worker error');
  });

  logger.info('Webhook worker started');

  return webhookWorker;
}

/**
 * Stop webhook worker
 */
export async function stopWebhookWorker(): Promise<void> {
  if (webhookWorker) {
    await webhookWorker.close();
    webhookWorker = null;
    logger.info('Webhook worker stopped');
  }
}

/**
 * Get webhook worker instance
 */
export function getWebhookWorker(): Worker | null {
  return webhookWorker;
}

export default { createWebhookWorker, stopWebhookWorker, getWebhookWorker };
