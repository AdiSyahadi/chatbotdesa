import { FastifyInstance } from 'fastify';
import prisma from '../../config/database';
import { AppError } from '../../types';
import { InstanceStatus, WarmingPhase, Prisma } from '@prisma/client';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
import {
  CreateInstanceInput,
  UpdateInstanceInput,
  ListInstancesQuery,
  SendTextMessageInput,
  SendMediaMessageInput,
  SendLocationInput,
  WARMING_PHASE_LIMITS,
  WarmingPhaseType,
} from './whatsapp.schema';
import {
  initializeConnection,
  disconnectInstance,
  restartInstance,
  getSocket,
  getQRCode,
  getConnectionInfo,
  sendTextMessage,
  sendMediaMessage,
  sendLocationMessage,
  deleteMessageForInstance,
  editMessageForInstance,
  isConnected,
  QRCodeData,
  baileysEvents,
  extractPhoneFromJid,
} from './baileys.service';
import { deleteSession, sessionExists, getSessionInfo } from './session.service';
import { v4 as uuidv4 } from 'uuid';
import { safeMessageUpsert } from '../../utils/safe-upsert';

// PATCH-093: safeMessageUpsert moved to ../../utils/safe-upsert.ts

// ============================================
// WHATSAPP SERVICE
// Business Logic Layer
// ============================================

export class WhatsAppService {
  constructor(private readonly fastify: FastifyInstance) {}

  // ============================================
  // INSTANCE MANAGEMENT
  // ============================================

  /**
   * List all instances for organization with pagination
   */
  async listInstances(
    organizationId: string,
    query: ListInstancesQuery
  ): Promise<{
    data: any[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      total_pages: number;
    };
  }> {
    const { status, page, limit, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      organization_id: organizationId,
      deleted_at: null,
    };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone_number: { contains: search } },
      ];
    }

    const [instances, total] = await Promise.all([
      prisma.whatsAppInstance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          name: true,
          phone_number: true,
          wa_display_name: true,
          status: true,
          health_score: true,
          daily_message_count: true,
          daily_limit: true,
          warming_phase: true,
          connected_at: true,
          created_at: true,
          is_active: true,
        },
      }),
      prisma.whatsAppInstance.count({ where }),
    ]);

    // Enrich with real-time status
    const enrichedInstances = instances.map((instance) => ({
      ...instance,
      is_online: isConnected(instance.id),
    }));

    return {
      data: enrichedInstances,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get instance by ID
   */
  async getInstance(
    instanceId: string,
    organizationId: string
  ): Promise<any> {
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: instanceId,
        organization_id: organizationId,
        deleted_at: null,
      },
      select: {
        id: true,
        name: true,
        phone_number: true,
        wa_display_name: true,
        status: true,
        health_score: true,
        daily_message_count: true,
        daily_limit: true,
        warming_phase: true,
        account_age_days: true,
        webhook_url: true,
        webhook_events: true,
        connected_at: true,
        disconnected_at: true,
        last_seen_at: true,
        created_at: true,
        updated_at: true,
        is_active: true,
      },
    });

    if (!instance) {
      throw new AppError('Instance not found', 404, 'INSTANCE_001');
    }

    // Get real-time connection info
    const connectionInfo = await getConnectionInfo(instanceId);
    const sessionInfo = getSessionInfo(instanceId);

    return {
      ...instance,
      is_online: isConnected(instanceId),
      connection_info: connectionInfo,
      session_info: {
        exists: sessionInfo.exists,
        files_count: sessionInfo.files.length,
        size_bytes: sessionInfo.size,
        last_sync: sessionInfo.lastModified,
      },
    };
  }

  /**
   * Create new instance
   */
  async createInstance(
    organizationId: string,
    data: CreateInstanceInput
  ): Promise<any> {
    // Generate webhook secret if webhook_url provided
    const webhookSecret = data.webhook_url
      ? data.webhook_secret || uuidv4().replace(/-/g, '')
      : null;

    // Use interactive transaction to prevent TOCTOU race on instance limit
    // (concurrent requests both passing the count check before either inserts)
    const instance = await prisma.$transaction(async (tx) => {
      // Check organization limits inside transaction
      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
        select: {
          max_instances: true,
          _count: {
            select: {
              whatsapp_instances: {
                where: { deleted_at: null },
              },
            },
          },
        },
      });

      if (!organization) {
        throw new AppError('Organization not found', 404, 'ORG_001');
      }

      const currentCount = organization._count.whatsapp_instances;
      if (currentCount >= organization.max_instances) {
        throw new AppError(
          `Instance limit reached (${organization.max_instances})`,
          403,
          'INSTANCE_002'
        );
      }

      // Create instance — within the same transaction
      return tx.whatsAppInstance.create({
        data: {
          organization_id: organizationId,
          name: data.name,
          webhook_url: data.webhook_url || null,
          webhook_events: data.webhook_events || ['message', 'status', 'connection'],
          webhook_secret: webhookSecret,
          status: 'DISCONNECTED',
          warming_phase: 'DAY_1_3',
          daily_limit: WARMING_PHASE_LIMITS.DAY_1_3.daily_limit,
        },
        select: {
          id: true,
          name: true,
          status: true,
          webhook_url: true,
          webhook_events: true,
          webhook_secret: true,
          warming_phase: true,
          daily_limit: true,
          created_at: true,
        },
      });
    });

    return instance;
  }

  /**
   * Update instance
   */
  async updateInstance(
    instanceId: string,
    organizationId: string,
    data: UpdateInstanceInput
  ): Promise<any> {
    // Verify ownership
    const existing = await prisma.whatsAppInstance.findFirst({
      where: {
        id: instanceId,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (!existing) {
      throw new AppError('Instance not found', 404, 'INSTANCE_001');
    }

    // Update
    const updated = await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.webhook_url !== undefined && { webhook_url: data.webhook_url }),
        ...(data.webhook_events && { webhook_events: data.webhook_events }),
        ...(data.webhook_secret !== undefined && { webhook_secret: data.webhook_secret }),
        ...(data.is_active !== undefined && { is_active: data.is_active }),
      },
      select: {
        id: true,
        name: true,
        status: true,
        webhook_url: true,
        webhook_events: true,
        is_active: true,
        updated_at: true,
      },
    });

    return updated;
  }

  /**
   * Delete instance (soft delete)
   * PATCH-082: Soft-delete in DB first (atomic), then perform side effects
   */
  async deleteInstance(
    instanceId: string,
    organizationId: string
  ): Promise<void> {
    // Atomically verify ownership + soft delete in one query
    const { count } = await prisma.whatsAppInstance.updateMany({
      where: {
        id: instanceId,
        organization_id: organizationId,
        deleted_at: null,
      },
      data: {
        deleted_at: new Date(),
        is_active: false,
        status: 'DISCONNECTED',
      },
    });

    if (count === 0) {
      throw new AppError('Instance not found', 404, 'INSTANCE_001');
    }

    // Side effects after successful DB update (idempotent)
    try {
      if (isConnected(instanceId)) {
        await disconnectInstance(instanceId);
      }
    } catch (e: any) {
      logger.warn({ instanceId, err: e.message }, '⚠️ [DELETE] Disconnect failed during delete (non-critical)');
    }

    try {
      deleteSession(instanceId);
    } catch (e: any) {
      logger.warn({ instanceId, err: e.message }, '⚠️ [DELETE] Session file cleanup failed (non-critical)');
    }
  }

  // ============================================
  // CONNECTION MANAGEMENT
  // ============================================

  /**
   * Connect instance (generate QR code)
   */
  async connectInstance(
    instanceId: string,
    organizationId: string
  ): Promise<{
    status: InstanceStatus;
    qr_code?: string;
    expires_in?: number;
  }> {
    // Verify ownership
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: instanceId,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (!instance) {
      throw new AppError('Instance not found', 404, 'INSTANCE_001');
    }

    if (!instance.is_active) {
      throw new AppError('Instance is disabled', 403, 'INSTANCE_004');
    }

    // Check if already connected
    if (isConnected(instanceId)) {
      return { status: 'CONNECTED' };
    }

    // Initialize connection
    const result = await initializeConnection(instanceId, organizationId);

    if (!result.success) {
      throw new AppError(
        result.error || 'Failed to initialize connection',
        500,
        'INSTANCE_003'
      );
    }

    // Get QR code if available
    const qrData = getQRCode(instanceId);

    return {
      status: result.status,
      qr_code: qrData?.qr_code || result.qr_code,
      expires_in: qrData?.expires_in,
    };
  }

  /**
   * Disconnect instance
   */
  async disconnect(
    instanceId: string,
    organizationId: string
  ): Promise<{ status: InstanceStatus; message: string }> {
    // Verify ownership
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: instanceId,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (!instance) {
      throw new AppError('Instance not found', 404, 'INSTANCE_001');
    }

    await disconnectInstance(instanceId);

    return {
      status: 'DISCONNECTED',
      message: 'Instance disconnected successfully',
    };
  }

  /**
   * Get QR code for instance
   */
  async getQR(
    instanceId: string,
    organizationId: string
  ): Promise<QRCodeData> {
    // Verify ownership
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: instanceId,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (!instance) {
      throw new AppError('Instance not found', 404, 'INSTANCE_001');
    }

    if (instance.status !== 'QR_READY') {
      throw new AppError(
        'QR code not available. Start connection first.',
        400,
        'INSTANCE_005'
      );
    }

    const qrData = getQRCode(instanceId);
    if (!qrData) {
      throw new AppError('QR code expired. Reconnect to get new QR.', 400, 'INSTANCE_005');
    }

    return qrData;
  }

  /**
   * Get connection status
   */
  async getStatus(
    instanceId: string,
    organizationId: string
  ): Promise<{
    status: InstanceStatus;
    phone_number?: string | null;
    phone_name?: string | null;
    is_online: boolean;
    health_score: number;
  }> {
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: instanceId,
        organization_id: organizationId,
        deleted_at: null,
      },
      select: {
        status: true,
        phone_number: true,
        health_score: true,
      },
    });

    if (!instance) {
      throw new AppError('Instance not found', 404, 'INSTANCE_001');
    }

    const connectionInfo = await getConnectionInfo(instanceId);

    return {
      status: instance.status,
      phone_number: connectionInfo?.phone_number || instance.phone_number,
      phone_name: connectionInfo?.phone_name,
      is_online: isConnected(instanceId),
      health_score: instance.health_score,
    };
  }

  /**
   * Restart instance connection
   */
  async restart(
    instanceId: string,
    organizationId: string
  ): Promise<{ status: InstanceStatus; message: string }> {
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: instanceId,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (!instance) {
      throw new AppError('Instance not found', 404, 'INSTANCE_001');
    }

    await restartInstance(instanceId, organizationId);

    return {
      status: 'CONNECTING',
      message: 'Instance is restarting',
    };
  }

  // ============================================
  // MESSAGING
  // ============================================

  /**
   * Enforce daily outgoing message limit for the organization.
   * Throws 429 AppError if today's outgoing count >= org.max_messages_per_day.
   */
  private async checkDailyMessageLimit(organizationId: string): Promise<void> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [org, messagesSentToday] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { max_messages_per_day: true },
      }),
      prisma.message.count({
        where: {
          organization_id: organizationId,
          direction: 'OUTGOING',
          sent_at: { gte: startOfDay },
        },
      }),
    ]);

    if (org && messagesSentToday >= org.max_messages_per_day) {
      throw new AppError(
        `Daily message limit reached (${org.max_messages_per_day}). Limit resets at midnight.`,
        429,
        'MSG_LIMIT_001'
      );
    }
  }

  /**
   * Send text message
   */
  async sendText(
    instanceId: string,
    organizationId: string,
    data: SendTextMessageInput
  ): Promise<{
    success: boolean;
    message_id?: string;
    queued?: boolean;
  }> {
    // Verify ownership and connection
    const instance = await this.verifyInstanceForMessaging(instanceId, organizationId);

    // Enforce daily message limit
    await this.checkDailyMessageLimit(organizationId);

    const result = await sendTextMessage(instanceId, data.to, data.message);

    if (!result.success) {
      throw new AppError(result.error || 'Failed to send message', 400, 'MSG_001');
    }

    const chatJid = data.to.includes('@') ? data.to : `${data.to}@s.whatsapp.net`;
    const now = new Date();

    // Save outgoing message to database using race-safe upsert to handle
    // concurrent Baileys messages.upsert event (which may fire for the same outgoing message)
    if (result.message_id) {
      await safeMessageUpsert({
        where: {
          unique_wa_message_per_instance: {
            wa_message_id: result.message_id,
            instance_id: instanceId,
          },
        },
        create: {
          organization_id: organizationId,
          instance_id: instanceId,
          wa_message_id: result.message_id,
          chat_jid: chatJid,
          message_type: 'TEXT',
          content: data.message,
          direction: 'OUTGOING',
          status: 'SENT',
          source: 'REALTIME',
          sent_at: now,
        },
        update: {
          // Already exists (rare race: Baileys event arrived first) — ensure it's marked OUTGOING
          direction: 'OUTGOING',
          status: 'SENT',
          sent_at: now,
        },
      });
    } else {
      await prisma.message.create({
        data: {
          organization_id: organizationId,
          instance_id: instanceId,
          chat_jid: chatJid,
          message_type: 'TEXT',
          content: data.message,
          direction: 'OUTGOING',
          status: 'SENT',
          source: 'REALTIME',
          sent_at: now,
        },
      });
    }

    // Emit webhook event for message.sent
    const phoneNumber = extractPhoneFromJid(chatJid);
    baileysEvents.emit('message', {
      instanceId,
      type: 'outgoing',
      message: {
        id: result.message_id,
        from: chatJid,
        chat_jid: chatJid,
        phone_number: phoneNumber,
        direction: 'OUTGOING',
        type: 'text',
        content: data.message,
        timestamp: Math.floor(now.getTime() / 1000),
      },
    });

    return {
      success: true,
      message_id: result.message_id,
    };
  }

  /**
   * Send media message
   */
  async sendMedia(
    instanceId: string,
    organizationId: string,
    data: SendMediaMessageInput
  ): Promise<{
    success: boolean;
    message_id?: string;
  }> {
    await this.verifyInstanceForMessaging(instanceId, organizationId);

    // Enforce daily message limit
    await this.checkDailyMessageLimit(organizationId);

    const result = await sendMediaMessage(
      instanceId,
      data.to,
      data.media_url,
      data.media_type,
      data.caption,
      data.filename
    );

    if (!result.success) {
      throw new AppError(result.error || 'Failed to send media', 400, 'MSG_002');
    }

    const chatJid = data.to.includes('@') ? data.to : `${data.to}@s.whatsapp.net`;
    const mediaType = data.media_type.toUpperCase() as any;
    const now = new Date();

    // Save to database using race-safe upsert to handle concurrent Baileys event
    if (result.message_id) {
      await safeMessageUpsert({
        where: {
          unique_wa_message_per_instance: {
            wa_message_id: result.message_id,
            instance_id: instanceId,
          },
        },
        create: {
          organization_id: organizationId,
          instance_id: instanceId,
          wa_message_id: result.message_id,
          chat_jid: chatJid,
          message_type: mediaType,
          content: data.caption || null,
          media_url: data.media_url,
          media_type: data.media_type,
          direction: 'OUTGOING',
          status: 'SENT',
          source: 'REALTIME',
          sent_at: now,
        },
        update: {
          direction: 'OUTGOING',
          status: 'SENT',
          media_url: data.media_url,
          media_type: data.media_type,
          sent_at: now,
        },
      });
    } else {
      await prisma.message.create({
        data: {
          organization_id: organizationId,
          instance_id: instanceId,
          chat_jid: chatJid,
          message_type: mediaType,
          content: data.caption || null,
          media_url: data.media_url,
          media_type: data.media_type,
          direction: 'OUTGOING',
          status: 'SENT',
          source: 'REALTIME',
          sent_at: now,
        },
      });
    }

    // Emit webhook event for message.sent
    const phoneNumber = extractPhoneFromJid(chatJid);
    baileysEvents.emit('message', {
      instanceId,
      type: 'outgoing',
      message: {
        id: result.message_id,
        from: chatJid,
        chat_jid: chatJid,
        phone_number: phoneNumber,
        direction: 'OUTGOING',
        type: data.media_type.toLowerCase(),
        content: data.caption || null,
        media_url: data.media_url,
        timestamp: Math.floor(now.getTime() / 1000),
      },
    });

    return {
      success: true,
      message_id: result.message_id,
    };
  }

  /**
   * Send location
   */
  async sendLocation(
    instanceId: string,
    organizationId: string,
    data: SendLocationInput
  ): Promise<{
    success: boolean;
    message_id?: string;
  }> {
    await this.verifyInstanceForMessaging(instanceId, organizationId);

    // Enforce daily message limit
    await this.checkDailyMessageLimit(organizationId);

    const result = await sendLocationMessage(
      instanceId,
      data.to,
      data.latitude,
      data.longitude,
      data.name,
      data.address
    );

    if (!result.success) {
      throw new AppError(result.error || 'Failed to send location', 400, 'MSG_003');
    }

    const chatJid = data.to.includes('@') ? data.to : `${data.to}@s.whatsapp.net`;
    const locationText = data.name || data.address || `[Location: ${data.latitude}, ${data.longitude}]`;
    const now = new Date();

    // Save to database using race-safe upsert
    if (result.message_id) {
      await safeMessageUpsert({
        where: {
          unique_wa_message_per_instance: {
            wa_message_id: result.message_id,
            instance_id: instanceId,
          },
        },
        create: {
          organization_id: organizationId,
          instance_id: instanceId,
          wa_message_id: result.message_id,
          chat_jid: chatJid,
          message_type: 'LOCATION',
          content: locationText,
          direction: 'OUTGOING',
          status: 'SENT',
          source: 'REALTIME',
          sent_at: now,
        },
        update: {
          direction: 'OUTGOING',
          status: 'SENT',
          sent_at: now,
        },
      });
    } else {
      await prisma.message.create({
        data: {
          organization_id: organizationId,
          instance_id: instanceId,
          chat_jid: chatJid,
          message_type: 'LOCATION',
          content: locationText,
          direction: 'OUTGOING',
          status: 'SENT',
          source: 'REALTIME',
          sent_at: now,
        },
      });
    }

    // Emit webhook event for message.sent
    const phoneNumber = extractPhoneFromJid(chatJid);
    baileysEvents.emit('message', {
      instanceId,
      type: 'outgoing',
      message: {
        id: result.message_id,
        from: chatJid,
        chat_jid: chatJid,
        phone_number: phoneNumber,
        direction: 'OUTGOING',
        type: 'location',
        content: locationText,
        timestamp: Math.floor(now.getTime() / 1000),
      },
    });

    return {
      success: true,
      message_id: result.message_id,
    };
  }

  /**
   * Delete / revoke a WhatsApp message
   *
   * @param deleteFor "everyone" revokes the message for all participants,
   *                  "me" removes it from the local device only.
   */
  async deleteMessage(
    instanceId: string,
    organizationId: string,
    data: {
      message_id: string;   // wa_message_id
      chat_jid: string;     // e.g. 628xxx@s.whatsapp.net or 12xxxxx@g.us
      from_me?: boolean;    // default true
      participant?: string; // required for group messages not sent by self
      delete_for?: 'everyone' | 'me'; // default everyone
    }
  ): Promise<{ success: boolean }> {
    // Verify ownership and connection
    await this.verifyInstanceForMessaging(instanceId, organizationId);

    const fromMe = data.from_me !== undefined ? data.from_me : true;
    const deleteFor = data.delete_for || 'everyone';

    const result = await deleteMessageForInstance(
      instanceId,
      data.chat_jid,
      data.message_id,
      fromMe,
      data.participant,
      deleteFor
    );

    if (!result.success) {
      throw new AppError(result.error || 'Failed to delete message', 400, 'MSG_010');
    }

    // Update the message status in DB to DELETED (if it exists)
    try {
      await prisma.message.updateMany({
        where: {
          instance_id: instanceId,
          wa_message_id: data.message_id,
          organization_id: organizationId,
        },
        data: {
          status: 'DELETED',
        },
      });
    } catch (dbErr) {
      // Non-fatal: the message may not exist in our DB (e.g. old message)
      logger.warn({ err: dbErr, messageId: data.message_id }, '⚠️ Could not update message status to DELETED');
    }

    // Emit webhook event for message.deleted
    baileysEvents.emit('message', {
      instanceId,
      type: 'outgoing',
      message: {
        id: data.message_id,
        chat_jid: data.chat_jid,
        phone_number: extractPhoneFromJid(data.chat_jid),
        direction: 'OUTGOING',
        type: 'revoke',
        content: deleteFor === 'everyone' ? 'Message deleted for everyone' : 'Message deleted for me',
        timestamp: Math.floor(Date.now() / 1000),
      },
    });

    return { success: true };
  }

  /**
   * Edit a WhatsApp message (text body or media caption).
   *
   * Only works for messages sent by this account (fromMe) and within ~15
   * minutes of the original send time (enforced by WhatsApp server).
   */
  async editMessage(
    instanceId: string,
    organizationId: string,
    data: {
      message_id: string;  // wa_message_id
      chat_jid: string;    // e.g. 628xxx@s.whatsapp.net
      new_text: string;    // replacement text / caption
    }
  ): Promise<{ success: boolean }> {
    // Verify ownership and connection
    await this.verifyInstanceForMessaging(instanceId, organizationId);

    const result = await editMessageForInstance(
      instanceId,
      data.chat_jid,
      data.message_id,
      data.new_text
    );

    if (!result.success) {
      throw new AppError(result.error || 'Failed to edit message', 400, 'MSG_011');
    }

    // Update content in DB (if the message exists)
    try {
      await prisma.message.updateMany({
        where: {
          instance_id: instanceId,
          wa_message_id: data.message_id,
          organization_id: organizationId,
        },
        data: {
          content: data.new_text,
          edited_at: new Date(),
        },
      });
    } catch (dbErr) {
      // Non-fatal: the message may not exist in our DB
      logger.warn({ err: dbErr, messageId: data.message_id }, '⚠️ Could not update edited message content');
    }

    // Emit webhook event for message.edited
    baileysEvents.emit('message', {
      instanceId,
      type: 'outgoing',
      message: {
        id: data.message_id,
        chat_jid: data.chat_jid,
        phone_number: extractPhoneFromJid(data.chat_jid),
        direction: 'OUTGOING',
        type: 'edit',
        content: data.new_text,
        timestamp: Math.floor(Date.now() / 1000),
      },
    });

    return { success: true };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Verify instance exists and is connected for messaging
   */
  private async verifyInstanceForMessaging(
    instanceId: string,
    organizationId: string
  ): Promise<any> {
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: instanceId,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (!instance) {
      throw new AppError('Instance not found', 404, 'INSTANCE_001');
    }

    if (!instance.is_active) {
      throw new AppError('Instance is disabled', 403, 'INSTANCE_004');
    }

    if (!isConnected(instanceId)) {
      throw new AppError('Instance is not connected', 400, 'INSTANCE_006');
    }

    return instance;
  }

  /**
   * Get messages for an instance
   */
  async getMessages(
    instanceId: string,
    organizationId: string,
    query: {
      chat_jid?: string;
      direction?: 'INCOMING' | 'OUTGOING';
      page?: number;
      limit?: number;
    }
  ): Promise<{
    data: any[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      total_pages: number;
    };
  }> {
    // Verify ownership
    const instance = await prisma.whatsAppInstance.findFirst({
      where: {
        id: instanceId,
        organization_id: organizationId,
        deleted_at: null,
      },
    });

    if (!instance) {
      throw new AppError('Instance not found', 404, 'INSTANCE_001');
    }

    const page = query.page || 1;
    const limit = Math.min(query.limit || 50, 100); // PATCH-084: Cap at 100
    const skip = (page - 1) * limit;

    const where: any = {
      instance_id: instanceId,
      organization_id: organizationId,
    };

    if (query.chat_jid) {
      where.chat_jid = query.chat_jid;
    }

    if (query.direction) {
      where.direction = query.direction;
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ sent_at: 'desc' }, { created_at: 'desc' }],
        select: {
          id: true,
          wa_message_id: true,
          chat_jid: true,
          sender_jid: true,
          message_type: true,
          content: true,
          media_url: true,
          direction: true,
          status: true,
          sent_at: true,
          delivered_at: true,
          read_at: true,
          created_at: true,
        },
      }),
      prisma.message.count({ where }),
    ]);

    return {
      data: messages,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all messages for organization (across all instances)
   */
  async getAllMessages(
    organizationId: string,
    query: {
      instanceId?: string;
      direction?: 'INCOMING' | 'OUTGOING';
      status?: string;
      source?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{
    data: any[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      total_pages: number;
    };
  }> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100); // PATCH-084: Cap at 100
    const skip = (page - 1) * limit;

    const where: any = {
      organization_id: organizationId,
    };

    if (query.instanceId) {
      where.instance_id = query.instanceId;
    }

    if (query.direction) {
      where.direction = query.direction;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.source) {
      where.source = query.source;
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ sent_at: 'desc' }, { created_at: 'desc' }],
        select: {
          id: true,
          instance_id: true,
          wa_message_id: true,
          chat_jid: true,
          sender_jid: true,
          message_type: true,
          content: true,
          media_url: true,
          direction: true,
          status: true,
          source: true,
          sent_at: true,
          delivered_at: true,
          read_at: true,
          created_at: true,
          instance: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.message.count({ where }),
    ]);

    // Transform to flat structure with instance_name
    const transformedMessages = messages.map((msg: any) => ({
      ...msg,
      instance_name: msg.instance?.name,
      instance: undefined,
    }));

    return {
      data: transformedMessages,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update warming phase based on account age
   * PATCH-075: Added organizationId for tenant isolation
   */
  async updateWarmingPhase(instanceId: string, organizationId: string): Promise<void> {
    const instance = await prisma.whatsAppInstance.findFirst({
      where: { id: instanceId, organization_id: organizationId, deleted_at: null },
      select: { account_age_days: true, warming_phase: true },
    });

    if (!instance) return;

    let newPhase: WarmingPhase = instance.warming_phase;
    let newLimit = WARMING_PHASE_LIMITS[instance.warming_phase as WarmingPhaseType].daily_limit;

    if (instance.account_age_days >= 15) {
      newPhase = 'DAY_15_PLUS';
      newLimit = WARMING_PHASE_LIMITS.DAY_15_PLUS.daily_limit;
    } else if (instance.account_age_days >= 8) {
      newPhase = 'DAY_8_14';
      newLimit = WARMING_PHASE_LIMITS.DAY_8_14.daily_limit;
    } else if (instance.account_age_days >= 4) {
      newPhase = 'DAY_4_7';
      newLimit = WARMING_PHASE_LIMITS.DAY_4_7.daily_limit;
    }

    if (newPhase !== instance.warming_phase) {
      await prisma.whatsAppInstance.update({
        where: { id: instanceId },
        data: {
          warming_phase: newPhase,
          daily_limit: newLimit,
        },
      });
    }
  }
}
