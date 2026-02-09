/**
 * Broadcasts Module - Business Logic Service
 * @module broadcasts/service
 */

import { Prisma, MessageStatus } from '@prisma/client';
import prisma from '../../config/database';
import logger from '../../config/logger';
import { Queue } from 'bullmq';
import redis, { isRedisAvailable } from '../../config/redis';
import {
  CreateBroadcastInput,
  UpdateBroadcastInput,
  AddRecipientsInput,
  AddRecipientsFromContactsInput,
  AddRecipientsFromTagsInput,
  ListBroadcastsQuery,
  ListRecipientsQuery,
  BroadcastResponse,
  BroadcastRecipientResponse,
  BroadcastListResponse,
  BroadcastRecipientListResponse,
  BroadcastStats,
  BroadcastJobData,
  BroadcastStatusType,
  formatPhoneNumber,
} from './broadcasts.schema';

// ============================================
// QUEUE SETUP
// ============================================

import config from '../../config';

// Redis connection options for BullMQ (requires separate connection)
const redisConnectionOptions = {
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: null,
};

// Create broadcast queue (optional - depends on Redis availability)
let broadcastQueue: Queue<BroadcastJobData> | null = null;

// Initialize queue after a short delay to allow Redis connection
setTimeout(() => {
  try {
    broadcastQueue = new Queue<BroadcastJobData>('broadcast-queue', {
      connection: redisConnectionOptions,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
    logger.info('Broadcast queue initialized');
  } catch (error) {
    logger.warn('Failed to initialize broadcast queue - Redis may not be available');
  }
}, 2000);

export { broadcastQueue };

// ============================================
// BROADCAST SERVICE CLASS
// ============================================

export class BroadcastService {
  /**
   * List broadcasts with filtering and pagination
   */
  async listBroadcasts(
    organizationId: string,
    query: ListBroadcastsQuery
  ): Promise<BroadcastListResponse> {
    const { instance_id, status, page, limit, sort_by, sort_order } = query;

    const where: Prisma.BroadcastWhereInput = {
      organization_id: organizationId,
    };

    if (instance_id) {
      where.instance_id = instance_id;
    }

    if (status) {
      where.status = status;
    }

    const total = await prisma.broadcast.count({ where });

    const broadcasts = await prisma.broadcast.findMany({
      where,
      orderBy: { [sort_by]: sort_order },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      broadcasts: broadcasts.map(this.formatBroadcastResponse),
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single broadcast by ID
   */
  async getBroadcastById(
    broadcastId: string,
    organizationId: string
  ): Promise<BroadcastResponse | null> {
    const broadcast = await prisma.broadcast.findFirst({
      where: {
        id: broadcastId,
        organization_id: organizationId,
      },
    });

    if (!broadcast) return null;
    return this.formatBroadcastResponse(broadcast);
  }

  /**
   * Create a new broadcast
   */
  async createBroadcast(
    organizationId: string,
    input: CreateBroadcastInput
  ): Promise<BroadcastResponse> {
    const {
      instance_id,
      name,
      message_type,
      content,
      media_url,
      caption,
      recipient_type,
      recipient_filter,
      scheduled_at,
      delay_min_ms,
      delay_max_ms,
    } = input;

    // Verify instance belongs to organization
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: instance_id,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (!instance) {
      throw new Error('INSTANCE_NOT_FOUND');
    }

    // Create broadcast
    const broadcast = await prisma.broadcast.create({
      data: {
        organization_id: organizationId,
        instance_id,
        name,
        message_type,
        content,
        media_url,
        caption,
        recipient_type,
        recipient_filter: recipient_filter ?? Prisma.JsonNull,
        scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
        delay_min_ms,
        delay_max_ms,
        status: scheduled_at ? 'SCHEDULED' : 'DRAFT',
      },
    });

    // If recipient_type is ALL_CONTACTS or SELECTED_TAGS, auto-add recipients
    if (recipient_type === 'ALL_CONTACTS') {
      await this.addRecipientsFromAllContacts(broadcast.id, organizationId, instance_id);
    } else if (recipient_type === 'SELECTED_TAGS' && recipient_filter?.tags) {
      await this.addRecipientsFromTags(
        broadcast.id,
        organizationId,
        recipient_filter.tags,
        instance_id
      );
    } else if (recipient_type === 'SELECTED_CONTACTS' && recipient_filter?.contact_ids) {
      await this.addRecipientsFromContactIds(
        broadcast.id,
        organizationId,
        recipient_filter.contact_ids
      );
    }

    // Refresh to get updated recipient_count
    const updated = await prisma.broadcast.findUnique({
      where: { id: broadcast.id },
    });

    logger.info({ broadcastId: broadcast.id, name }, 'Broadcast created');
    return this.formatBroadcastResponse(updated!);
  }

  /**
   * Update broadcast (only if DRAFT or SCHEDULED)
   */
  async updateBroadcast(
    broadcastId: string,
    organizationId: string,
    input: UpdateBroadcastInput
  ): Promise<BroadcastResponse> {
    const broadcast = await prisma.broadcast.findFirst({
      where: {
        id: broadcastId,
        organization_id: organizationId,
      },
    });

    if (!broadcast) {
      throw new Error('BROADCAST_NOT_FOUND');
    }

    if (!['DRAFT', 'SCHEDULED'].includes(broadcast.status)) {
      throw new Error('BROADCAST_NOT_EDITABLE');
    }

    const updated = await prisma.broadcast.update({
      where: { id: broadcastId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.content !== undefined && { content: input.content }),
        ...(input.media_url !== undefined && { media_url: input.media_url }),
        ...(input.caption !== undefined && { caption: input.caption }),
        ...(input.scheduled_at !== undefined && {
          scheduled_at: input.scheduled_at ? new Date(input.scheduled_at) : null,
          status: input.scheduled_at ? 'SCHEDULED' : 'DRAFT',
        }),
        ...(input.delay_min_ms !== undefined && { delay_min_ms: input.delay_min_ms }),
        ...(input.delay_max_ms !== undefined && { delay_max_ms: input.delay_max_ms }),
      },
    });

    logger.info({ broadcastId }, 'Broadcast updated');
    return this.formatBroadcastResponse(updated);
  }

  /**
   * Delete broadcast (only if DRAFT or SCHEDULED)
   */
  async deleteBroadcast(
    broadcastId: string,
    organizationId: string
  ): Promise<void> {
    const broadcast = await prisma.broadcast.findFirst({
      where: {
        id: broadcastId,
        organization_id: organizationId,
      },
    });

    if (!broadcast) {
      throw new Error('BROADCAST_NOT_FOUND');
    }

    if (!['DRAFT', 'SCHEDULED', 'COMPLETED', 'FAILED'].includes(broadcast.status)) {
      throw new Error('BROADCAST_CANNOT_DELETE');
    }

    // Delete recipients first (cascade)
    await prisma.broadcastRecipient.deleteMany({
      where: { broadcast_id: broadcastId },
    });

    await prisma.broadcast.delete({
      where: { id: broadcastId },
    });

    logger.info({ broadcastId }, 'Broadcast deleted');
  }

  /**
   * Add recipients manually
   */
  async addRecipients(
    broadcastId: string,
    organizationId: string,
    input: AddRecipientsInput
  ): Promise<{ added: number; skipped: number }> {
    const broadcast = await prisma.broadcast.findFirst({
      where: {
        id: broadcastId,
        organization_id: organizationId,
      },
    });

    if (!broadcast) {
      throw new Error('BROADCAST_NOT_FOUND');
    }

    if (!['DRAFT', 'SCHEDULED'].includes(broadcast.status)) {
      throw new Error('BROADCAST_NOT_EDITABLE');
    }

    // Get existing phone numbers
    const existing = await prisma.broadcastRecipient.findMany({
      where: { broadcast_id: broadcastId },
      select: { phone_number: true },
    });
    const existingPhones = new Set(existing.map(r => formatPhoneNumber(r.phone_number)));

    const toCreate: Prisma.BroadcastRecipientCreateManyInput[] = [];
    let skipped = 0;

    for (const recipient of input.recipients) {
      const phone = formatPhoneNumber(recipient.phone_number);
      
      if (existingPhones.has(phone)) {
        skipped++;
        continue;
      }

      toCreate.push({
        broadcast_id: broadcastId,
        phone_number: phone,
        contact_name: recipient.contact_name,
        variables: recipient.variables ?? Prisma.JsonNull,
        status: 'PENDING',
      });

      existingPhones.add(phone);
    }

    if (toCreate.length > 0) {
      await prisma.broadcastRecipient.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
    }

    // Update recipient count
    const count = await prisma.broadcastRecipient.count({
      where: { broadcast_id: broadcastId },
    });

    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { recipient_count: count },
    });

    return { added: toCreate.length, skipped };
  }

  /**
   * Add recipients from contact IDs
   */
  async addRecipientsFromContactIds(
    broadcastId: string,
    organizationId: string,
    contactIds: string[]
  ): Promise<{ added: number; skipped: number }> {
    const contacts = await prisma.contact.findMany({
      where: {
        id: { in: contactIds },
        organization_id: organizationId,
        phone_number: { not: null },
      },
      select: {
        phone_number: true,
        name: true,
        push_name: true,
      },
    });

    const recipients = contacts.map(c => ({
      phone_number: c.phone_number!,
      contact_name: c.name || c.push_name || undefined,
    }));

    return this.addRecipients(broadcastId, organizationId, { recipients });
  }

  /**
   * Add recipients from tags
   */
  private async addRecipientsFromTags(
    broadcastId: string,
    organizationId: string,
    tags: string[],
    instanceId?: string
  ): Promise<{ added: number; skipped: number }> {
    // Get contacts with matching tags
    const contacts = await prisma.contact.findMany({
      where: {
        organization_id: organizationId,
        ...(instanceId && { instance_id: instanceId }),
        phone_number: { not: null },
        // Note: Full JSON tag filtering would need raw query
        // Simplified approach - get all and filter
      },
      select: {
        phone_number: true,
        name: true,
        push_name: true,
        tags: true,
      },
    });

    // Filter by tags
    const filtered = contacts.filter(c => {
      const contactTags = (c.tags as string[]) || [];
      return tags.some(tag => contactTags.includes(tag));
    });

    const recipients = filtered.map(c => ({
      phone_number: c.phone_number!,
      contact_name: c.name || c.push_name || undefined,
    }));

    return this.addRecipients(broadcastId, organizationId, { recipients });
  }

  /**
   * Add all contacts as recipients
   */
  private async addRecipientsFromAllContacts(
    broadcastId: string,
    organizationId: string,
    instanceId: string
  ): Promise<{ added: number; skipped: number }> {
    const contacts = await prisma.contact.findMany({
      where: {
        organization_id: organizationId,
        instance_id: instanceId,
        phone_number: { not: null },
        is_group: false,
      },
      select: {
        phone_number: true,
        name: true,
        push_name: true,
      },
    });

    const recipients = contacts.map(c => ({
      phone_number: c.phone_number!,
      contact_name: c.name || c.push_name || undefined,
    }));

    return this.addRecipients(broadcastId, organizationId, { recipients });
  }

  /**
   * Add recipients from tags (public)
   */
  async addRecipientsFromTagsPublic(
    broadcastId: string,
    organizationId: string,
    input: AddRecipientsFromTagsInput
  ): Promise<{ added: number; skipped: number }> {
    const broadcast = await prisma.broadcast.findFirst({
      where: {
        id: broadcastId,
        organization_id: organizationId,
      },
    });

    if (!broadcast) {
      throw new Error('BROADCAST_NOT_FOUND');
    }

    return this.addRecipientsFromTags(
      broadcastId,
      organizationId,
      input.tags,
      input.instance_id || broadcast.instance_id
    );
  }

  /**
   * Add recipients from contacts (public)
   */
  async addRecipientsFromContactsPublic(
    broadcastId: string,
    organizationId: string,
    input: AddRecipientsFromContactsInput
  ): Promise<{ added: number; skipped: number }> {
    const broadcast = await prisma.broadcast.findFirst({
      where: {
        id: broadcastId,
        organization_id: organizationId,
      },
    });

    if (!broadcast) {
      throw new Error('BROADCAST_NOT_FOUND');
    }

    return this.addRecipientsFromContactIds(
      broadcastId,
      organizationId,
      input.contact_ids
    );
  }

  /**
   * Remove recipient
   */
  async removeRecipient(
    broadcastId: string,
    recipientId: string,
    organizationId: string
  ): Promise<void> {
    const broadcast = await prisma.broadcast.findFirst({
      where: {
        id: broadcastId,
        organization_id: organizationId,
      },
    });

    if (!broadcast) {
      throw new Error('BROADCAST_NOT_FOUND');
    }

    if (!['DRAFT', 'SCHEDULED'].includes(broadcast.status)) {
      throw new Error('BROADCAST_NOT_EDITABLE');
    }

    await prisma.broadcastRecipient.delete({
      where: { id: recipientId },
    });

    // Update recipient count
    const count = await prisma.broadcastRecipient.count({
      where: { broadcast_id: broadcastId },
    });

    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { recipient_count: count },
    });
  }

  /**
   * Clear all recipients
   */
  async clearRecipients(
    broadcastId: string,
    organizationId: string
  ): Promise<void> {
    const broadcast = await prisma.broadcast.findFirst({
      where: {
        id: broadcastId,
        organization_id: organizationId,
      },
    });

    if (!broadcast) {
      throw new Error('BROADCAST_NOT_FOUND');
    }

    if (!['DRAFT', 'SCHEDULED'].includes(broadcast.status)) {
      throw new Error('BROADCAST_NOT_EDITABLE');
    }

    await prisma.broadcastRecipient.deleteMany({
      where: { broadcast_id: broadcastId },
    });

    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { recipient_count: 0 },
    });
  }

  /**
   * List recipients for a broadcast
   */
  async listRecipients(
    broadcastId: string,
    organizationId: string,
    query: ListRecipientsQuery
  ): Promise<BroadcastRecipientListResponse> {
    const broadcast = await prisma.broadcast.findFirst({
      where: {
        id: broadcastId,
        organization_id: organizationId,
      },
    });

    if (!broadcast) {
      throw new Error('BROADCAST_NOT_FOUND');
    }

    const { status, page, limit } = query;

    const where: Prisma.BroadcastRecipientWhereInput = {
      broadcast_id: broadcastId,
    };

    if (status) {
      where.status = status;
    }

    const total = await prisma.broadcastRecipient.count({ where });

    const recipients = await prisma.broadcastRecipient.findMany({
      where,
      orderBy: { created_at: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      recipients: recipients.map(this.formatRecipientResponse),
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get broadcast statistics
   */
  async getBroadcastStats(
    broadcastId: string,
    organizationId: string
  ): Promise<BroadcastStats> {
    const broadcast = await prisma.broadcast.findFirst({
      where: {
        id: broadcastId,
        organization_id: organizationId,
      },
    });

    if (!broadcast) {
      throw new Error('BROADCAST_NOT_FOUND');
    }

    const stats = await prisma.broadcastRecipient.groupBy({
      by: ['status'],
      where: { broadcast_id: broadcastId },
      _count: true,
    });

    const result: BroadcastStats = {
      total_recipients: broadcast.recipient_count,
      pending: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
    };

    for (const stat of stats) {
      switch (stat.status) {
        case 'PENDING':
          result.pending = stat._count;
          break;
        case 'SENT':
          result.sent = stat._count;
          break;
        case 'DELIVERED':
          result.delivered = stat._count;
          break;
        case 'READ':
          result.read = stat._count;
          break;
        case 'FAILED':
          result.failed = stat._count;
          break;
      }
    }

    return result;
  }

  /**
   * Start broadcast execution
   */
  async startBroadcast(
    broadcastId: string,
    organizationId: string
  ): Promise<BroadcastResponse> {
    const broadcast = await prisma.broadcast.findFirst({
      where: {
        id: broadcastId,
        organization_id: organizationId,
      },
    });

    if (!broadcast) {
      throw new Error('BROADCAST_NOT_FOUND');
    }

    if (!['DRAFT', 'SCHEDULED', 'PAUSED'].includes(broadcast.status)) {
      throw new Error('BROADCAST_CANNOT_START');
    }

    if (broadcast.recipient_count === 0) {
      throw new Error('BROADCAST_NO_RECIPIENTS');
    }

    // Verify instance is connected
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: broadcast.instance_id,
        status: 'CONNECTED',
      },
    });

    if (!instance) {
      throw new Error('INSTANCE_NOT_CONNECTED');
    }

    // Update status to RUNNING
    const updated = await prisma.broadcast.update({
      where: { id: broadcastId },
      data: {
        status: 'RUNNING',
        started_at: broadcast.started_at || new Date(),
      },
    });

    // Add to queue
    if (!broadcastQueue) {
      throw new Error('BROADCAST_QUEUE_NOT_AVAILABLE');
    }

    await broadcastQueue.add(
      'process-broadcast',
      {
        broadcast_id: broadcastId,
        organization_id: organizationId,
        instance_id: broadcast.instance_id,
      },
      {
        jobId: `broadcast-${broadcastId}`,
      }
    );

    logger.info({ broadcastId }, 'Broadcast started');
    return this.formatBroadcastResponse(updated);
  }

  /**
   * Pause broadcast
   */
  async pauseBroadcast(
    broadcastId: string,
    organizationId: string
  ): Promise<BroadcastResponse> {
    const broadcast = await prisma.broadcast.findFirst({
      where: {
        id: broadcastId,
        organization_id: organizationId,
      },
    });

    if (!broadcast) {
      throw new Error('BROADCAST_NOT_FOUND');
    }

    if (broadcast.status !== 'RUNNING') {
      throw new Error('BROADCAST_NOT_RUNNING');
    }

    const updated = await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: 'PAUSED' },
    });

    logger.info({ broadcastId }, 'Broadcast paused');
    return this.formatBroadcastResponse(updated);
  }

  /**
   * Resume broadcast
   */
  async resumeBroadcast(
    broadcastId: string,
    organizationId: string
  ): Promise<BroadcastResponse> {
    return this.startBroadcast(broadcastId, organizationId);
  }

  /**
   * Cancel broadcast
   */
  async cancelBroadcast(
    broadcastId: string,
    organizationId: string
  ): Promise<BroadcastResponse> {
    const broadcast = await prisma.broadcast.findFirst({
      where: {
        id: broadcastId,
        organization_id: organizationId,
      },
    });

    if (!broadcast) {
      throw new Error('BROADCAST_NOT_FOUND');
    }

    if (!['RUNNING', 'PAUSED', 'SCHEDULED'].includes(broadcast.status)) {
      throw new Error('BROADCAST_CANNOT_CANCEL');
    }

    const updated = await prisma.broadcast.update({
      where: { id: broadcastId },
      data: {
        status: 'FAILED',
        completed_at: new Date(),
      },
    });

    // Remove from queue if exists
    try {
      if (broadcastQueue) {
        const job = await broadcastQueue.getJob(`broadcast-${broadcastId}`);
        if (job) {
          await job.remove();
        }
      }
    } catch (err) {
      logger.error({ err, broadcastId }, 'Error removing job from queue');
    }

    logger.info({ broadcastId }, 'Broadcast cancelled');
    return this.formatBroadcastResponse(updated);
  }

  /**
   * Format broadcast to response
   */
  private formatBroadcastResponse(broadcast: any): BroadcastResponse {
    const sentCount = broadcast.sent_count || 0;
    const failedCount = broadcast.failed_count || 0;
    const totalProcessed = sentCount + failedCount;
    const recipientCount = broadcast.recipient_count || 0;
    const progressPercentage = recipientCount > 0
      ? Math.round((totalProcessed / recipientCount) * 100)
      : 0;

    return {
      id: broadcast.id,
      instance_id: broadcast.instance_id,
      name: broadcast.name,
      message_type: broadcast.message_type,
      content: broadcast.content,
      media_url: broadcast.media_url,
      caption: broadcast.caption,
      recipient_type: broadcast.recipient_type,
      recipient_filter: broadcast.recipient_filter,
      recipient_count: recipientCount,
      status: broadcast.status,
      scheduled_at: broadcast.scheduled_at,
      started_at: broadcast.started_at,
      completed_at: broadcast.completed_at,
      sent_count: sentCount,
      failed_count: failedCount,
      delay_min_ms: broadcast.delay_min_ms,
      delay_max_ms: broadcast.delay_max_ms,
      created_at: broadcast.created_at,
      updated_at: broadcast.updated_at,
      progress_percentage: progressPercentage,
    };
  }

  /**
   * Format recipient to response
   */
  private formatRecipientResponse(recipient: any): BroadcastRecipientResponse {
    return {
      id: recipient.id,
      broadcast_id: recipient.broadcast_id,
      phone_number: recipient.phone_number,
      contact_name: recipient.contact_name,
      variables: recipient.variables,
      status: recipient.status,
      sent_at: recipient.sent_at,
      delivered_at: recipient.delivered_at,
      read_at: recipient.read_at,
      failed_at: recipient.failed_at,
      error_message: recipient.error_message,
      created_at: recipient.created_at,
    };
  }
}

// Export singleton instance
export const broadcastService = new BroadcastService();
