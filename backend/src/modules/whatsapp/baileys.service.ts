import makeWASocket, {
  DisconnectReason,
  WASocket,
  ConnectionState,
  BaileysEventMap,
  WAMessageKey,
  WAMessage,
  proto,
  delay,
  getAggregateVotesInPollMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
  getContentType,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as QRCode from 'qrcode';
import pino from 'pino';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import { saveFile, ensureUploadsDir } from '../../services/storage.service';
import prisma from '../../config/database';
import config from '../../config';
import { InstanceStatus, WarmingPhase, MessageType, Prisma } from '@prisma/client';
import {
  useMultiFileAuthState,
  deleteSession,
  sessionExists,
} from './session.service';
import { WARMING_PHASE_LIMITS, WarmingPhaseType } from './whatsapp.schema';
import { validateMediaUrl } from '../../utils/url-validator';

// ============================================
// BAILEYS SERVICE
// WhatsApp Connection Manager
// ============================================

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Event emitter for broadcasting events to routes/webhooks
export const baileysEvents = new EventEmitter();

// Store active socket connections
const activeSockets: Map<string, WASocket> = new Map();

/**
 * Race-safe message upsert: catches P2002 unique constraint violation
 * (concurrent SELECT→INSERT race) and retries as update.
 */
async function safeMessageUpsert(args: Prisma.MessageUpsertArgs): Promise<void> {
  try {
    await prisma.message.upsert(args);
  } catch (err: any) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      logger.debug({ where: args.where }, '🔄 [MSG] Upsert race detected (P2002), retrying as update');
      try {
        await prisma.message.update({ where: args.where, data: args.update });
      } catch (updateErr: any) {
        logger.warn({ where: args.where, err: updateErr.message }, '⚠️ [MSG] Update after P2002 also failed');
      }
    } else {
      throw err;
    }
  }
}

// Store QR codes with expiration
const qrCodeStore: Map<string, { code: string; expiresAt: Date }> = new Map();

// Store health check intervals for cleanup
const healthIntervals: Map<string, NodeJS.Timeout> = new Map();

// Reconnect guard: prevent duplicate reconnections
const reconnectTimers: Map<string, NodeJS.Timeout> = new Map();

// Reconnect attempt counter for exponential backoff
const reconnectAttempts: Map<string, number> = new Map();

// Sync config cache: avoid DB lookups per event
const syncConfigCache: Map<string, { syncEnabled: boolean }> = new Map();

// Sync locks: serialize batch processing per instance (async mutex via promise chaining)
const syncLocks: Map<string, Promise<void>> = new Map();

// Completion timers: detect end of history sync via timeout
const syncCompletionTimers: Map<string, NodeJS.Timeout> = new Map();

// Sync pause control: instances in this set will skip processing incoming history batches
const syncPausedInstances: Set<string> = new Set();

// Flag: instances being disconnected programmatically (by disconnectInstance)
// When set, the connection.close handler skips DB/session work to avoid race conditions
const manuallyDisconnecting: Set<string> = new Set();

/**
 * Schedule a reconnect with exponential backoff.
 * Delays: 5s → 10s → 20s → 40s → 60s (capped). Max 10 attempts.
 */
function scheduleReconnect(instanceId: string, organizationId: string, reason: string): void {
  const existing = reconnectTimers.get(instanceId);
  if (existing) {
    logger.info({ instanceId }, '🔌 [RECONNECT] Already scheduled, skipping');
    return;
  }

  const attempt = (reconnectAttempts.get(instanceId) || 0) + 1;
  const MAX_ATTEMPTS = 10;
  if (attempt > MAX_ATTEMPTS) {
    logger.error({ instanceId, attempt }, '🔌 [RECONNECT] Max attempts reached, giving up — manual reconnect required');
    reconnectAttempts.delete(instanceId);
    updateInstanceStatus(instanceId, 'ERROR', { disconnected_at: new Date() }).catch(() => {});
    return;
  }

  reconnectAttempts.set(instanceId, attempt);
  const delayMs = Math.min(5000 * Math.pow(2, attempt - 1), 60000); // 5s, 10s, 20s, 40s, 60s cap
  logger.info({ instanceId, attempt, delayMs, reason }, `🔌 [RECONNECT] Scheduling attempt ${attempt}/${MAX_ATTEMPTS} in ${delayMs}ms`);

  updateInstanceStatus(instanceId, 'CONNECTING').catch(() => {});

  const timer = setTimeout(() => {
    reconnectTimers.delete(instanceId);
    initializeConnection(instanceId, organizationId)
      .then(() => {
        // Success — reset counter (will be confirmed by connection='open' handler)
        logger.info({ instanceId, attempt }, '🔌 [RECONNECT] initializeConnection succeeded');
      })
      .catch((err) => {
        logger.error({ err, instanceId, attempt }, '🔌 [RECONNECT] Failed, scheduling next attempt');
        scheduleReconnect(instanceId, organizationId, 'retry_after_failure');
      });
  }, delayMs);
  reconnectTimers.set(instanceId, timer);
}

/**
 * Clean up all in-memory sync state for an instance.
 * Does NOT touch the database — caller is responsible for DB updates.
 */
export function cleanupSyncState(instanceId: string): void {
  syncPausedInstances.add(instanceId);
  syncLocks.delete(instanceId);
  syncConfigCache.delete(instanceId);

  const timer = syncCompletionTimers.get(instanceId);
  if (timer) {
    clearTimeout(timer);
    syncCompletionTimers.delete(instanceId);
  }
}

export async function stopHistorySync(instanceId: string): Promise<void> {
  // 1. In-memory: block new batches from being queued/processed
  cleanupSyncState(instanceId);

  // 2. DB: update status and preserve progress
  const instance = await prisma.whatsAppInstance.findUnique({
    where: { id: instanceId },
    select: { history_sync_progress: true },
  });

  const progress = (instance?.history_sync_progress as any) || {};
  progress.stopped_at = new Date().toISOString();
  progress.stopped_by_user = true;

  await prisma.whatsAppInstance.update({
    where: { id: instanceId },
    data: {
      history_sync_status: 'STOPPED',
      history_sync_progress: progress,
      sync_history_on_connect: false,
    },
  });

  logger.info({ instanceId }, '⏸️ [SYNC] History sync STOPPED by user');

  // 3. Emit webhook
  baileysEvents.emit('history.sync', {
    instanceId,
    event: 'history.sync.stopped',
    data: { instance_id: instanceId, stopped_at: progress.stopped_at },
  });
}

/**
 * Resume history sync processing for an instance.
 * Next incoming WhatsApp history batch will be processed again.
 */
export async function resumeHistorySync(instanceId: string): Promise<void> {
  // 1. In-memory: allow batches to be processed again
  syncPausedInstances.delete(instanceId);
  syncConfigCache.delete(instanceId); // re-read fresh config on next event

  // 2. DB: update status and restore progress
  const instance = await prisma.whatsAppInstance.findUnique({
    where: { id: instanceId },
    select: { history_sync_progress: true },
  });

  const progress = (instance?.history_sync_progress as any) || {};
  delete progress.stopped_at;
  delete progress.stopped_by_user;
  delete progress.stopped_reason;
  progress.resumed_at = new Date().toISOString();

  await prisma.whatsAppInstance.update({
    where: { id: instanceId },
    data: {
      history_sync_status: 'SYNCING',
      history_sync_progress: progress,
      sync_history_on_connect: true,
    },
  });

  logger.info({ instanceId }, '▶️ [SYNC] History sync RESUMED by user');

  // 3. Set a safety completion timer — if WhatsApp sends no more batches after resume,
  //    this prevents the status from staying SYNCING forever.
  //    handleHistorySync will reset/replace this timer when real batches arrive.
  const existingTimer = syncCompletionTimers.get(instanceId);
  if (existingTimer) clearTimeout(existingTimer);

  const safetyTimer = setTimeout(async () => {
    try {
      syncCompletionTimers.delete(instanceId);
      const latest = await prisma.whatsAppInstance.findUnique({
        where: { id: instanceId },
        select: { history_sync_status: true, history_sync_progress: true },
      });
      // Only finalize if still SYNCING (no new batches came to reset the timer)
      if (latest?.history_sync_status === 'SYNCING') {
        const finalProgress = (latest.history_sync_progress as any) || {};
        finalProgress.percentage = 100;
        finalProgress.completed_at = new Date().toISOString();
        const finalStatus = (finalProgress.batch_errors || 0) > 0 ? 'PARTIAL' : 'COMPLETED';

        await prisma.whatsAppInstance.update({
          where: { id: instanceId },
          data: {
            history_sync_status: finalStatus as any,
            history_sync_progress: finalProgress,
            last_history_sync_at: new Date(),
          },
        });
        logger.info({ instanceId, finalStatus }, '✅ [SYNC] Resume safety timer: no new batches after 60s');
      }
    } catch (err) {
      logger.error({ err, instanceId }, '❌ [SYNC] Resume safety timer error');
    }
  }, 60000); // 60 seconds — generous window for WhatsApp to send more batches

  syncCompletionTimers.set(instanceId, safetyTimer);

  // 4. Emit webhook
  baileysEvents.emit('history.sync', {
    instanceId,
    event: 'history.sync.resumed',
    data: { instance_id: instanceId, resumed_at: progress.resumed_at },
  });
}

// ============================================
// TYPES
// ============================================

/** Result of extracting message content from a WAMessage */
export interface ExtractedMessageContent {
  text: string;
  messageType: MessageType;
  mediaUrl: string | null;
}

export interface ConnectionInfo {
  status: InstanceStatus;
  phone_number?: string | null;
  phone_name?: string | null;
  battery?: number;
  is_charging?: boolean;
  platform?: string;
}

export interface QRCodeData {
  qr_code: string;
  expires_in: number;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format phone number to WhatsApp JID
 */
function formatPhoneToJid(phone: string): string {
  // Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Remove leading 0 and add country code if needed
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1); // Default to Indonesia
  }
  
  // Add @s.whatsapp.net suffix
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Extract phone number from JID.
 * Returns the numeric part for standard JIDs (628xxx@s.whatsapp.net → 628xxx).
 * Returns null for LID JIDs (LID:xxx@lid) since phone number cannot be extracted.
 */
export function extractPhoneFromJid(jid: string): string | null {
  if (!jid) return null;
  // LID JIDs don't contain phone numbers
  if (jid.includes('@lid') || jid.startsWith('LID:')) return null;
  // Group JIDs — return group id
  if (jid.endsWith('@g.us')) return jid.replace('@g.us', '');
  // Standard JID — strip @domain and :device suffix
  const cleaned = jid.replace('@s.whatsapp.net', '');
  // Remove :device suffix (e.g. "6281234567890:54" → "6281234567890")
  const colonIdx = cleaned.indexOf(':');
  return colonIdx > 0 ? cleaned.substring(0, colonIdx) : cleaned;
}

/**
 * Calculate message delay based on warming phase (anti-ban)
 */
function getMessageDelay(warmingPhase: WarmingPhaseType): number {
  const config = WARMING_PHASE_LIMITS[warmingPhase];
  const baseDelay = config.min_delay_ms;
  // Add random variation 0-50% to seem more human
  const variation = Math.random() * 0.5;
  return Math.floor(baseDelay * (1 + variation));
}

/**
 * Extract message content from a WAMessage.
 * Pure function — reusable by both real-time handler and history sync handler.
 * Returns null if the message should be skipped (e.g., protocolMessage).
 */
function extractMessageContent(msg: WAMessage): ExtractedMessageContent | null {
  const messageContent = msg.message;
  if (!messageContent) return null;

  let text = '';
  let messageType: MessageType = 'TEXT';
  let mediaUrl: string | null = null;

  if (messageContent.conversation) {
    text = messageContent.conversation;
  } else if (messageContent.extendedTextMessage?.text) {
    text = messageContent.extendedTextMessage.text;
  } else if (messageContent.imageMessage) {
    messageType = 'IMAGE';
    text = messageContent.imageMessage.caption || '';
  } else if (messageContent.videoMessage) {
    messageType = 'VIDEO';
    text = messageContent.videoMessage.caption || '';
  } else if (messageContent.audioMessage) {
    messageType = 'AUDIO';
    text = messageContent.audioMessage.ptt ? '[Voice Note]' : '[Audio]';
  } else if (messageContent.documentMessage) {
    messageType = 'DOCUMENT';
    text = messageContent.documentMessage.fileName || '[Document]';
  } else if (messageContent.stickerMessage) {
    messageType = 'STICKER';
    text = '[Sticker]';
  } else if (messageContent.contactMessage) {
    messageType = 'CONTACT';
    text = messageContent.contactMessage.displayName || '[Contact]';
  } else if (messageContent.contactsArrayMessage) {
    messageType = 'CONTACT';
    const names = messageContent.contactsArrayMessage.contacts?.map(c => c.displayName).filter(Boolean);
    text = names?.length ? names.join(', ') : '[Contacts]';
  } else if (messageContent.locationMessage) {
    messageType = 'LOCATION';
    const loc = messageContent.locationMessage;
    text = loc.name || loc.address || `[Location: ${loc.degreesLatitude}, ${loc.degreesLongitude}]`;
  } else if (messageContent.liveLocationMessage) {
    messageType = 'LOCATION';
    text = '[Live Location]';
  } else if (messageContent.reactionMessage) {
    messageType = 'REACTION';
    text = messageContent.reactionMessage.text || '';
  } else if (messageContent.pollCreationMessage || messageContent.pollCreationMessageV3) {
    messageType = 'POLL';
    const poll = messageContent.pollCreationMessage || messageContent.pollCreationMessageV3;
    text = poll?.name || '[Poll]';
  } else if (messageContent.buttonsResponseMessage) {
    text = messageContent.buttonsResponseMessage.selectedDisplayText || '[Button Response]';
  } else if (messageContent.listResponseMessage) {
    text = messageContent.listResponseMessage.title || messageContent.listResponseMessage.singleSelectReply?.selectedRowId || '[List Response]';
  } else if (messageContent.templateButtonReplyMessage) {
    text = messageContent.templateButtonReplyMessage.selectedDisplayText || '[Template Reply]';
  } else if (messageContent.viewOnceMessage || messageContent.viewOnceMessageV2) {
    const inner = messageContent.viewOnceMessage?.message || messageContent.viewOnceMessageV2?.message;
    if (inner?.imageMessage) {
      messageType = 'IMAGE';
      text = inner.imageMessage.caption || '[View Once Photo]';
    } else if (inner?.videoMessage) {
      messageType = 'VIDEO';
      text = inner.videoMessage.caption || '[View Once Video]';
    } else if (inner?.audioMessage) {
      messageType = 'AUDIO';
      text = '[View Once Audio]';
    } else if (inner?.stickerMessage) {
      messageType = 'STICKER';
      text = '[View Once Sticker]';
    } else {
      text = '[View Once Message]';
    }
  } else if (messageContent.templateMessage) {
    // Template message (businesses)
    const tmpl = messageContent.templateMessage;
    const hydratedMsg = tmpl.hydratedTemplate || tmpl.fourRowTemplate;
    if (hydratedMsg) {
      text = (hydratedMsg as any).hydratedContentText || (hydratedMsg as any).hydratedTitleText || '[Template Message]';
    } else {
      text = '[Template Message]';
    }
  } else if (messageContent.highlyStructuredMessage) {
    // Highly structured message (i18n template)
    const hsm = messageContent.highlyStructuredMessage;
    text = hsm.hydratedHsm?.hydratedTemplate?.hydratedContentText || '[Structured Message]';
  } else if (messageContent.buttonsMessage) {
    // Buttons message
    const btns = messageContent.buttonsMessage;
    text = btns.contentText || btns.headerType?.toString() || '[Buttons Message]';
  } else if (messageContent.listMessage) {
    // List message
    const list = messageContent.listMessage;
    text = list.description || list.title || '[List Message]';
  } else if (messageContent.interactiveMessage) {
    // Interactive message (WhatsApp Business)
    const interactive = messageContent.interactiveMessage;
    const body = interactive.body?.text || interactive.header?.title || '';
    text = body || '[Interactive Message]';
  } else if ((messageContent as any).placeholderMessage) {
    // Placeholder message (e.g., "waiting for this message")
    text = '[Placeholder Message]';
  } else if ((messageContent as any).orderMessage) {
    // Order/commerce message
    text = '[Order Message]';
  } else if ((messageContent as any).groupInviteMessage) {
    // Group invite
    const invite = (messageContent as any).groupInviteMessage;
    text = invite.caption || invite.groupName || '[Group Invite]';
  } else if ((messageContent as any).invoiceMessage) {
    // Invoice message
    text = '[Invoice Message]';
  } else if ((messageContent as any).productMessage) {
    // Product catalog message
    text = '[Product Message]';
  } else if (messageContent.protocolMessage) {
    // Protocol messages (delete, ephemeral settings, etc.) — skip silently
    return null;
  } else if (messageContent.ephemeralMessage?.message) {
    // Disappearing message wrapper — extract inner content
    const inner = messageContent.ephemeralMessage.message;
    if (inner.conversation) {
      text = inner.conversation;
    } else if (inner.extendedTextMessage?.text) {
      text = inner.extendedTextMessage.text;
    } else if (inner.imageMessage) {
      messageType = 'IMAGE';
      text = inner.imageMessage.caption || '';
    } else if (inner.videoMessage) {
      messageType = 'VIDEO';
      text = inner.videoMessage.caption || '';
    } else if (inner.documentMessage) {
      messageType = 'DOCUMENT';
      text = inner.documentMessage.fileName || '[Document]';
    } else if (inner.audioMessage) {
      messageType = 'AUDIO';
      text = inner.audioMessage.ptt ? '[Voice Note]' : '[Audio]';
    } else if (inner.stickerMessage) {
      messageType = 'STICKER';
      text = '[Sticker]';
    } else {
      text = '[Disappearing Message]';
    }
  } else {
    // Unknown message type — log it and store what we can
    const keys = Object.keys(messageContent).filter(k => k !== 'messageContextInfo');
    messageType = 'UNKNOWN';
    text = `[${keys.join(', ')}]`;
    logger.warn({ messageKeys: keys }, '⚠️ Unhandled message type in extractMessageContent');
  }

  return { text, messageType, mediaUrl };
}

/**
 * Convert Baileys messageTimestamp (which can be a protobuf Long object) to plain number.
 * Returns undefined if the timestamp is falsy.
 */
function convertMessageTimestamp(ts: any): number | undefined {
  if (!ts) return undefined;
  if (typeof ts === 'number') return ts;
  if (typeof ts.toNumber === 'function') return ts.toNumber();
  return Number(ts);
}

/**
 * Generate a deterministic fallback wa_message_id for messages without one.
 * Uses sha256(chatJid + timestamp + content) to ensure deduplication.
 * Returns 'gen_' prefix + 32 char hex string.
 */
function generateFallbackMessageId(chatJid: string, timestamp: number | undefined, content: string): string {
  const raw = `${chatJid}|${timestamp || 0}|${content || ''}`;
  const hash = createHash('sha256').update(raw).digest('hex').substring(0, 32);
  return `gen_${hash}`;
}

/**
 * Enqueue async work per instance with serialized execution.
 * Ensures batches for the same instance are processed sequentially.
 */
function enqueueSyncBatch(instanceId: string, fn: () => Promise<void>): void {
  const prev = syncLocks.get(instanceId) || Promise.resolve();
  const next = prev.then(fn).catch(err => {
    logger.error({ err, instanceId }, 'Sync batch error');
  });
  syncLocks.set(instanceId, next);
  next.finally(() => {
    if (syncLocks.get(instanceId) === next) {
      syncLocks.delete(instanceId);
    }
  });
}

/**
 * Get sync config for an instance. Uses in-memory cache to avoid DB lookups per event.
 */
async function getSyncConfig(instanceId: string): Promise<{ syncEnabled: boolean }> {
  const cached = syncConfigCache.get(instanceId);
  if (cached) return cached;

  const instance = await prisma.whatsAppInstance.findUnique({
    where: { id: instanceId },
    select: { sync_history_on_connect: true },
  });

  const config = { syncEnabled: instance?.sync_history_on_connect ?? false };
  syncConfigCache.set(instanceId, config);
  return config;
}

/**
 * Invalidate sync config cache for an instance (called when settings are updated via API).
 */
export function invalidateSyncConfigCache(instanceId: string): void {
  syncConfigCache.delete(instanceId);
}

/**
 * Check if instance can send message (rate limiting)
 */
export async function canSendMessage(instanceId: string): Promise<{
  allowed: boolean;
  reason?: string;
  wait_ms?: number;
}> {
  const instance = await prisma.whatsAppInstance.findUnique({
    where: { id: instanceId },
    select: {
      daily_message_count: true,
      daily_limit: true,
      warming_phase: true,
      last_message_at: true,
      health_score: true,
    },
  });

  if (!instance) {
    return { allowed: false, reason: 'Instance not found' };
  }

  // Check daily limit
  if (instance.daily_message_count >= instance.daily_limit) {
    return {
      allowed: false,
      reason: `Daily limit reached (${instance.daily_limit} messages)`,
    };
  }

  // Check health score
  if (instance.health_score < 20) {
    return {
      allowed: false,
      reason: 'Health score too low. Let the account rest.',
    };
  }

  // Check minimum delay since last message
  if (instance.last_message_at) {
    const config = WARMING_PHASE_LIMITS[instance.warming_phase as WarmingPhaseType];
    const timeSinceLastMessage = Date.now() - instance.last_message_at.getTime();
    
    if (timeSinceLastMessage < config.min_delay_ms) {
      return {
        allowed: false,
        reason: 'Please wait between messages',
        wait_ms: config.min_delay_ms - timeSinceLastMessage,
      };
    }
  }

  return { allowed: true };
}

// ============================================
// SOCKET MANAGEMENT
// ============================================

/**
 * Get active socket for an instance
 */
export function getSocket(instanceId: string): WASocket | undefined {
  return activeSockets.get(instanceId);
}

/**
 * Check if socket is connected
 */
export function isConnected(instanceId: string): boolean {
  const socket = activeSockets.get(instanceId);
  return socket?.user !== undefined;
}

/**
 * Get QR code for instance
 */
export function getQRCode(instanceId: string): QRCodeData | null {
  const stored = qrCodeStore.get(instanceId);
  if (!stored) return null;

  const now = new Date();
  if (now > stored.expiresAt) {
    qrCodeStore.delete(instanceId);
    return null;
  }

  const expires_in = Math.floor((stored.expiresAt.getTime() - now.getTime()) / 1000);
  return {
    qr_code: stored.code,
    expires_in,
  };
}

// ============================================
// MAIN CONNECTION FUNCTION
// ============================================

/**
 * Initialize WhatsApp connection for an instance
 */
export async function initializeConnection(
  instanceId: string,
  organizationId: string
): Promise<{
  success: boolean;
  status: InstanceStatus;
  qr_code?: string;
  error?: string;
}> {
  try {
    logger.info({ instanceId }, '🔌 [INIT] Initializing connection for instance');
    
    // Check if already connected
    const existingSocket = activeSockets.get(instanceId);
    if (existingSocket?.user) {
      logger.info({ instanceId, userId: existingSocket.user.id }, '🔌 [INIT] Already connected, skipping');
      return {
        success: true,
        status: 'CONNECTED',
      };
    }

    // Close existing socket if any (prevents conflict/replaced errors)
    if (existingSocket) {
      logger.info({ instanceId }, '🔌 [INIT] Closing existing socket without user');
      try { existingSocket.end(undefined); } catch (e) { /* ignore */ }
      activeSockets.delete(instanceId);
    }

    // Clear any pending reconnect timer
    const pendingTimer = reconnectTimers.get(instanceId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      reconnectTimers.delete(instanceId);
    }

    // Reset reconnect attempt counter so this connection gets a fresh set of retries.
    // Without this, stale counter from a previous disconnect cycle carries over and
    // causes scheduleReconnect to hit MAX_ATTEMPTS prematurely (e.g., user manually
    // clicks Connect after a loggedOut cycle that already exhausted 10 attempts).
    reconnectAttempts.delete(instanceId);

    // Clear ALL stale sync state from previous session so fresh sync can proceed
    syncPausedInstances.delete(instanceId);
    syncConfigCache.delete(instanceId);
    syncLocks.delete(instanceId);
    const staleTimer = syncCompletionTimers.get(instanceId);
    if (staleTimer) {
      clearTimeout(staleTimer);
      syncCompletionTimers.delete(instanceId);
    }

    // Update status to CONNECTING
    await updateInstanceStatus(instanceId, 'CONNECTING');

    // Get auth state from session storage
    const { state, saveCreds } = await useMultiFileAuthState(instanceId);

    // Use signal key store with warn-level logger to surface key errors
    // Using makeCacheableSignalKeyStore for performance, but with visible logging
    const signalKeyStore = makeCacheableSignalKeyStore(state.keys, pino({ level: 'warn' }));

    // Fetch latest Baileys version to ensure compatibility
    const { version, isLatest } = await fetchLatestBaileysVersion();
    logger.info({ version, isLatest }, 'Using Baileys version');

    // Fetch sync config to determine if full history sync should be enabled
    const syncConfig = await getSyncConfig(instanceId);
    const shouldSyncHistory = syncConfig.syncEnabled;
    if (shouldSyncHistory) {
      logger.info({ instanceId }, '📜 [INIT] History sync ENABLED — syncFullHistory=true');
    }

    // Create socket with proper configuration
    // Using Baileys default browser fingerprint to avoid detection
    const baileysLogger = pino({ level: 'warn' }); // Use warn to catch internal errors
    const socket = makeWASocket({
      auth: {
        creds: state.creds,
        keys: signalKeyStore,
      },
      version,
      logger: baileysLogger,
      // Use standard WhatsApp Web browser fingerprint
      browser: ['Ubuntu', 'Chrome', '120.0.6099.224'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000, // Slightly more aggressive keepalive
      // Anti-ban measures
      markOnlineOnConnect: false,
      // Conditionally enable full history sync based on instance setting
      syncFullHistory: shouldSyncHistory,
      // Generate high-quality links
      generateHighQualityLinkPreview: true,
      // getMessage: required for retry mechanism when other side requests message resend
      getMessage: async (key) => {
        if (key.id) {
          try {
            const msg = await prisma.message.findFirst({
              where: { wa_message_id: key.id, instance_id: instanceId },
              select: { content: true },
            });
            if (msg?.content) {
              return proto.Message.fromObject({ conversation: msg.content });
            }
          } catch (e) {
            logger.warn({ err: e, keyId: key.id }, '⚠️ getMessage error');
          }
        }
        return undefined;
      },
    });

    // Store socket reference
    activeSockets.set(instanceId, socket);
    logger.info({ instanceId, activeSocketCount: activeSockets.size }, '🔌 [INIT] Socket created and stored');

    // ========================================
    // WEBSOCKET-LEVEL MONITORING
    // Intercept at the lowest level to see ALL incoming message frames,
    // including ones that fail Signal decryption and get silently dropped.
    // This helps diagnose WHY live messages might not emit messages.upsert.
    // ========================================
    try {
      const ws = (socket as any).ws;
      if (ws && typeof ws.on === 'function') {
        let wsFrameCount = 0;
        let wsMsgFrameCount = 0;
        let lastFrameTime = Date.now();

        // Monitor ALL frames at the raw WebSocket level
        ws.on('frame', () => {
          wsFrameCount++;
          lastFrameTime = Date.now();
        });

        // Monitor message-specific frames (BEFORE decryption/processing)
        // This fires even if the message later fails Signal decryption
        ws.on('CB:message', (node: any) => {
          wsMsgFrameCount++;
          const from = node?.attrs?.from || 'unknown';
          const offline = node?.attrs?.offline ? 'YES' : 'no';
          logger.debug({ instanceId, frameNumber: wsMsgFrameCount, from, offline }, '🌐 [WS-MSG] CB:message received');
        });

        // Periodic health check with buffer force-flush
        const prevInterval = healthIntervals.get(instanceId);
        if (prevInterval) clearInterval(prevInterval);
        
        const healthInterval = setInterval(() => {
          const isAlive = activeSockets.has(instanceId);
          if (!isAlive) {
            logger.info({ instanceId: instanceId.substring(0, 8) }, '♻️ [HEALTH] Instance removed from activeSockets, stopping health check');
            clearInterval(healthInterval);
            healthIntervals.delete(instanceId);
            return;
          }

          const timeSinceLastFrame = Date.now() - lastFrameTime;
          logger.debug({ instanceId: instanceId.substring(0, 8), wsFrameCount, wsMsgFrameCount, lastFrameSecondsAgo: Math.round(timeSinceLastFrame / 1000), user: socket.user?.id || 'none' }, '♻️ [HEALTH] Status check');

          // CRITICAL: Force-flush the event buffer in case it's stuck
          // In Baileys v6, createBufferedFunction calls buffer() but never flush().
          // If the state machine doesn't call flush(), events accumulate forever.
          try {
            const evAny = socket.ev as any;
            if (typeof evAny.flush === 'function') {
              const flushed = evAny.flush();
              if (flushed) {
                logger.warn({ instanceId }, '♻️ [HEALTH] 🚨 Buffer WAS stuck — force flushed events!');
              }
            }
          } catch (e: any) {
            // ignore flush errors
          }

          // If no frames for 60s+ while "connected", the WS might be dead
          if (timeSinceLastFrame > 60000 && socket.user) {
            logger.warn({ instanceId, silentSeconds: Math.round(timeSinceLastFrame / 1000) }, '⚠️ [HEALTH] No WS frames — connection might be zombie!');
            
            // After 120s+ of silence, force-close the zombie socket to trigger reconnect
            if (timeSinceLastFrame > 120000) {
              logger.error({ instanceId, silentSeconds: Math.round(timeSinceLastFrame / 1000) }, '💀 [HEALTH] Zombie connection detected (120s+) — force-closing to trigger reconnect');
              clearInterval(healthInterval);
              healthIntervals.delete(instanceId);
              try {
                socket.end(new Boom('Zombie connection detected by health check', { statusCode: DisconnectReason.connectionLost }));
              } catch (e) {
                logger.warn({ instanceId }, '⚠️ [HEALTH] Error closing zombie socket, removing from activeSockets');
                activeSockets.delete(instanceId);
                scheduleReconnect(instanceId, organizationId, 'zombie_health_check');
              }
            }
          }
        }, 15000); // every 15 seconds (includes buffer flush)

        healthIntervals.set(instanceId, healthInterval);
        logger.info({ instanceId }, '🔌 [INIT] WebSocket monitoring + buffer flush attached');
      } else {
        logger.warn({ instanceId }, '⚠️ [INIT] socket.ws not accessible for monitoring');
      }
    } catch (e: any) {
      logger.warn({ instanceId, err: e.message }, '⚠️ [INIT] WS monitoring setup error');
    }

    // INTERCEPT ev.emit to handle messages DIRECTLY at the emit level
    // This is the most reliable approach: Baileys internal buffer/flush/process
    // mechanism doesn't reliably deliver messages.upsert to ev.process() or ev.on()
    // But we KNOW ev.emit IS called (confirmed via diagnostic logging)
    const originalEmit = socket.ev.emit.bind(socket.ev);
    (socket.ev as any).emit = function(event: any, data: any) {
      const eventName = String(event);
      
      // Log all events for visibility
      if (eventName === 'messages.upsert') {
        logger.debug({ instanceId, eventName, type: data?.type, count: data?.messages?.length }, '🔍 [RAW-EVENT] Event received');
      }

      // IMPORTANT: Only process 'notify' type messages (new real-time messages)
      // 'append' type = historical sync from WhatsApp server on connect
      // Route to sync handler if sync is enabled, otherwise ignore
      if (eventName === 'messages.upsert' && data?.type === 'append' && data?.messages) {
        // Skip if sync is paused/stopped (check early to avoid queueing)
        if (syncPausedInstances.has(instanceId)) {
          logger.info({ instanceId, droppedCount: data.messages.length }, '⏸️ [SYNC-EVENT] Sync paused, dropping append messages');
        } else {
          // Enqueue serialized per instance to avoid race conditions
          enqueueSyncBatch(instanceId, () =>
            handleAppendHistoryMessages(instanceId, organizationId, data.messages)
          );
        }
      }

      // Handle messaging-history.set — main history sync event from WhatsApp
      if (eventName === 'messaging-history.set' && data) {
        logger.info({ instanceId, msgCount: data.messages?.length || 0, chatCount: data.chats?.length || 0, contactCount: data.contacts?.length || 0, isLatest: data.isLatest }, '📜 [SYNC-EVENT] messaging-history.set received');
        // Skip if sync is paused/stopped (check early to avoid queueing)
        if (syncPausedInstances.has(instanceId)) {
          logger.info({ instanceId }, '⏸️ [SYNC-EVENT] Sync paused, dropping messaging-history.set batch');
        } else {
          // Enqueue serialized per instance to avoid race conditions
          enqueueSyncBatch(instanceId, () =>
            handleHistorySync(instanceId, organizationId, data)
          );
        }
      }

      // Process real-time messages DIRECTLY at emit level (before buffering)
      if (eventName === 'messages.upsert' && data?.type === 'notify' && data?.messages) {
        logger.info({ instanceId, count: data.messages.length }, '🔔🔔🔔 [BAILEYS] Processing notify message(s) at emit level');
        for (const msg of data.messages) {
          if (msg.key?.remoteJid === 'status@broadcast') continue;
          logger.debug({ instanceId, from: msg.key?.remoteJid, fromMe: msg.key?.fromMe, msgId: msg.key?.id }, '🔔 [BAILEYS] Message received');
          handleRealtimeMessage(instanceId, organizationId, msg).catch((err: any) => {
            logger.error({ err, instanceId }, '❌ [BAILEYS] Error handling message');
          });
        }
      }

      // Process message status updates at emit level too
      if (eventName === 'messages.update' && Array.isArray(data)) {
        for (const update of data) {
          handleMessageUpdate(instanceId, update).catch((err: any) => {
            logger.error({ err, instanceId }, '❌ [BAILEYS] Error handling message update');
          });
        }
      }

      // Handle LID → Phone Number mapping via chats.phoneNumberShare (Baileys v6.6+)
      // This is the ACTUAL event name — "lid-mapping.update" does NOT exist in Baileys.
      if (eventName === 'chats.phoneNumberShare' && data) {
        logger.info({ instanceId, lid: data.lid, jid: data.jid }, '🔗 [LID-MAP] chats.phoneNumberShare received');
        handleLidMappingUpdate(instanceId, organizationId, { lid: data.lid, pn: data.jid }, 'chats.phoneNumberShare').catch((err: any) => {
          logger.error({ err, instanceId }, '❌ [LID-MAP] Error handling LID mapping');
        });
      }

      // Extract LID↔Phone mappings from contacts.upsert events
      // Contact objects may have both `lid` and `jid` fields — capture the cross-reference
      if (eventName === 'contacts.upsert' && Array.isArray(data)) {
        for (const contact of data) {
          const contactLid = contact.lid as string | undefined;
          const contactJid = contact.jid as string | undefined;
          const contactId = contact.id as string | undefined;
          // Case 1: contact.lid + contact.jid both present
          if (contactLid?.endsWith('@lid') && contactJid?.endsWith('@s.whatsapp.net')) {
            handleLidMappingUpdate(instanceId, organizationId, { lid: contactLid, pn: contactJid }, 'contacts.upsert').catch(() => {});
          }
          // Case 2: contact.id is @s.whatsapp.net and contact.lid is present
          if (contactLid?.endsWith('@lid') && contactId?.endsWith('@s.whatsapp.net')) {
            handleLidMappingUpdate(instanceId, organizationId, { lid: contactLid, pn: contactId }, 'contacts.upsert').catch(() => {});
          }
          // Case 3: contact.id is @lid and contact.jid is @s.whatsapp.net
          if (contactId?.endsWith('@lid') && contactJid?.endsWith('@s.whatsapp.net')) {
            handleLidMappingUpdate(instanceId, organizationId, { lid: contactId, pn: contactJid }, 'contacts.upsert').catch(() => {});
          }
        }
      }

      return originalEmit(event as any, data);
    };

    // =====================
    // EVENT HANDLERS (using ev.process() as recommended by Baileys)
    // =====================
    logger.info({ instanceId }, '🔌 [INIT] Binding event handlers using ev.process()...');

    // Credentials update - save to storage (this one uses ev.on as it's not buffered)
    socket.ev.on('creds.update', saveCreds);

    // Use ev.process() for ALL buffered events - this is the official Baileys pattern
    // ev.on() misses events because Baileys buffers them internally
    socket.ev.process(async (events) => {
      // ---- Connection Update ----
      if (events['connection.update']) {
        const update = events['connection.update'];
        const { connection, lastDisconnect, qr } = update;

        // Debug logging
        logger.debug({ instanceId, connection, hasQr: !!qr }, '🔌 [EVENT] connection.update');
        logger.info({ instanceId, connection, hasQr: !!qr, update }, 'Connection update received');

        // Handle QR Code
        if (qr) {
          logger.info({ instanceId }, 'QR code received, generating base64...');
          try {
            const qrBase64 = await QRCode.toDataURL(qr, {
              width: 300,
              margin: 2,
            });

            // Store QR with 120 second expiration (longer than Baileys' ~30s regen cycle
            // so the frontend always has a valid QR to fetch between regenerations)
            qrCodeStore.set(instanceId, {
              code: qrBase64,
              expiresAt: new Date(Date.now() + 120000),
            });

            await updateInstanceStatus(instanceId, 'QR_READY', { qr_code: qrBase64 });
            logger.info({ instanceId }, 'QR code stored and status updated to QR_READY');

            // Emit event for WebSocket/webhook
            baileysEvents.emit('qr', { instanceId, qr_code: qrBase64 });
          } catch (err) {
            logger.error({ err, instanceId }, 'Error generating QR code');
          }
        }

        // Handle successful connection
        if (connection === 'open') {
          const phoneNumber = socket.user?.id ? extractPhoneFromJid(socket.user.id) : null;
          const waDisplayName = socket.user?.notify || socket.user?.verifiedName || socket.user?.name || null;

          // Check if sync was auto-stopped by safety net during a temporary disconnect.
          // If so, recover: reset to SYNCING so incoming history events aren't blocked.
          const currentInstance = await prisma.whatsAppInstance.findUnique({
            where: { id: instanceId },
            select: { history_sync_status: true, history_sync_progress: true, sync_history_on_connect: true },
          });
          const syncRecoveryData: Record<string, unknown> = {};
          if (
            currentInstance?.history_sync_status === 'STOPPED' &&
            currentInstance?.sync_history_on_connect === true
          ) {
            const prog = (currentInstance.history_sync_progress as any) || {};
            // Only recover auto-corrected stops, NOT user-initiated stops
            if (prog.stopped_reason === 'stale_auto_corrected' && !prog.stopped_by_user) {
              syncRecoveryData.history_sync_status = 'SYNCING';
              delete prog.stopped_at;
              delete prog.stopped_reason;
              prog.recovered_at = new Date().toISOString();
              syncRecoveryData.history_sync_progress = prog;
              syncPausedInstances.delete(instanceId);
              logger.info({ instanceId }, '🔄 [SYNC] Recovered auto-stopped sync on reconnect');
            }
          }

          await prisma.whatsAppInstance.update({
            where: { id: instanceId },
            data: {
              status: 'CONNECTED',
              phone_number: phoneNumber,
              wa_display_name: waDisplayName,
              connected_at: new Date(),
              qr_code: null,
              health_score: 100,
              ...syncRecoveryData,
            },
          });

          qrCodeStore.delete(instanceId);
          reconnectAttempts.delete(instanceId); // Reset backoff on successful connection

          logger.info({ instanceId, phoneNumber, waDisplayName }, 'WhatsApp connected');
          baileysEvents.emit('connection', {
            instanceId,
            status: 'CONNECTED',
            phone_number: phoneNumber,
            wa_display_name: waDisplayName,
          });
        }

        // Handle disconnection
        if (connection === 'close') {
          activeSockets.delete(instanceId);
          qrCodeStore.delete(instanceId);
          // Clean up health interval
          const interval = healthIntervals.get(instanceId);
          if (interval) { clearInterval(interval); healthIntervals.delete(instanceId); }

          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const errorMsg = (lastDisconnect?.error as Boom)?.output?.payload?.message || '';
          
          logger.info({ instanceId, statusCode, errorMsg }, '🔌 [CLOSE] Instance disconnected');

          // If disconnectInstance() initiated this close, skip all DB/session handling
          // disconnectInstance() manages its own cleanup to avoid race conditions
          if (manuallyDisconnecting.has(instanceId)) {
            manuallyDisconnecting.delete(instanceId);
            logger.info({ instanceId }, '🔌 [CLOSE] Programmatic disconnect, close handler skipping');
            return;
          }

          // Determine if we should reconnect
          // 440 = connectionReplaced (conflict) — do NOT reconnect, another socket just opened
          const noReconnectCodes = [
            DisconnectReason.loggedOut,       // 401
            DisconnectReason.forbidden,       // 403
            440,                              // connectionReplaced/conflict
          ];
          const shouldReconnect = !noReconnectCodes.includes(statusCode || 0);

          if (statusCode === DisconnectReason.loggedOut) {
            // Clean up sync state for this instance
            cleanupSyncState(instanceId);
            deleteSession(instanceId);

            // Check if sync was active when logged out
            const currentInst = await prisma.whatsAppInstance.findUnique({
              where: { id: instanceId },
              select: { history_sync_status: true, history_sync_progress: true },
            });
            const wasSyncing = currentInst?.history_sync_status === 'SYNCING';
            const logoutProgress = (currentInst?.history_sync_progress as any) || {};
            if (wasSyncing) {
              logoutProgress.stopped_at = new Date().toISOString();
              logoutProgress.stopped_reason = 'logged_out';
            }

            await updateInstanceStatus(instanceId, 'DISCONNECTED', {
              phone_number: null,
              connected_at: null,
              disconnected_at: new Date(),
              ...(wasSyncing ? {
                history_sync_status: 'STOPPED',
                history_sync_progress: logoutProgress,
              } : {}),
            });

            logger.info({ instanceId }, 'Logged out, session deleted');
            baileysEvents.emit('connection', {
              instanceId,
              status: 'DISCONNECTED',
              reason: 'logged_out',
            });
          } else if (statusCode === 440) {
            // Connection replaced by another socket (conflict)
            // This is NOT an error — just means a newer socket took over
            // Do NOT reconnect to avoid infinite loop
            logger.info({ instanceId }, '🔌 [CLOSE] Conflict (440) — socket was replaced, NOT reconnecting');
            // The newer socket is already connected, so don't update DB status
          } else if (statusCode === DisconnectReason.badSession) {
            deleteSession(instanceId);
            logger.warn({ instanceId, statusCode }, 'Bad session — deleted session, scheduling reconnect (QR re-scan required)');
            // Schedule reconnect with backoff — will present QR for re-scan
            scheduleReconnect(instanceId, organizationId, 'bad_session');
          } else if (shouldReconnect) {
            // Clear any pending completion timer from old session
            // Without this, the 30s timer can fire during the 5s reconnect delay
            // and mark sync as COMPLETED prematurely while we're reconnecting
            const oldCompletionTimer = syncCompletionTimers.get(instanceId);
            if (oldCompletionTimer) {
              clearTimeout(oldCompletionTimer);
              syncCompletionTimers.delete(instanceId);
            }

            // Schedule reconnect with exponential backoff
            scheduleReconnect(instanceId, organizationId, `disconnect_${statusCode}`);
          }
        }
      }

      // ---- Messages Upsert (handled at emit level above, this is backup) ----
      if (events['messages.upsert']) {
        const upsert = events['messages.upsert'];
        logger.debug({ instanceId, type: upsert.type, count: upsert.messages.length }, '📋 [PROCESS-BACKUP] messages.upsert via ev.process()');
        // NOTE: Primary handling is done at emit interception level above
      }

      // ---- Messages Update (handled at emit level above, this is backup) ----
      if (events['messages.update']) {
        logger.debug({ instanceId, count: events['messages.update'].length }, '📋 [PROCESS-BACKUP] messages.update via ev.process()');
      }

      // ---- Messaging History Set (backup — primary handling is at emit level) ----
      if (events['messaging-history.set']) {
        const { messages, chats, contacts, isLatest } = events['messaging-history.set'];
        logger.debug({ instanceId, msgCount: messages.length, chatCount: chats.length, contactCount: contacts.length, isLatest }, '📋 [PROCESS-BACKUP] messaging-history.set via ev.process()');
        // NOTE: Primary handling is done at emit interception level above
      }

      // ---- LID→Phone mapping (backup — primary handling is at emit level) ----
      if (events['chats.phoneNumberShare']) {
        const data = events['chats.phoneNumberShare'];
        logger.debug({ instanceId, lid: data.lid, jid: data.jid }, '📋 [PROCESS-BACKUP] chats.phoneNumberShare via ev.process()');
      }

      // ---- Contacts Upsert (backup — LID extraction done at emit level) ----
      if (events['contacts.upsert']) {
        const contacts = events['contacts.upsert'];
        logger.debug({ instanceId, count: contacts.length }, '📋 [PROCESS-BACKUP] contacts.upsert via ev.process()');
      }
    });

    logger.info({ instanceId }, '🔌 [INIT] All event handlers bound via ev.process(). Waiting for connection...');

    // Wait a bit and check status
    await delay(2000);
    
    const currentStatus = socket.user ? 'CONNECTED' : 'QR_READY';
    const qrData = getQRCode(instanceId);
    logger.info({ instanceId, status: currentStatus, hasUser: !!socket.user, userId: socket.user?.id || 'N/A' }, '🔌 [INIT] Connection result');

    return {
      success: true,
      status: currentStatus as InstanceStatus,
      qr_code: qrData?.qr_code,
    };
  } catch (error) {
    logger.error({ error, instanceId }, 'Error initializing connection');
    await updateInstanceStatus(instanceId, 'ERROR');
    
    return {
      success: false,
      status: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Disconnect WhatsApp instance
 */
export async function disconnectInstance(instanceId: string): Promise<boolean> {
  try {
    // 1. Stop sync processing: in-memory guard + cancel timers + clear queue
    cleanupSyncState(instanceId);

    // 2. Cancel any pending reconnect timer
    const pendingReconnect = reconnectTimers.get(instanceId);
    if (pendingReconnect) {
      clearTimeout(pendingReconnect);
      reconnectTimers.delete(instanceId);
    }

    // 3. Close socket and delete session
    //    Set manuallyDisconnecting flag BEFORE logout so the connection.close
    //    handler skips DB operations (we handle them below, avoiding race)
    const socket = activeSockets.get(instanceId);
    if (socket) {
      manuallyDisconnecting.add(instanceId);
      try {
        await socket.logout();
      } catch (logoutErr) {
        logger.warn({ err: logoutErr, instanceId }, 'socket.logout() failed during disconnect');
      } finally {
        // Always clean up — if close handler already deleted it, this is a harmless no-op
        manuallyDisconnecting.delete(instanceId);
      }
      activeSockets.delete(instanceId);
    }
    deleteSession(instanceId);
    qrCodeStore.delete(instanceId);

    // 4. Update DB: status + sync status in single atomic write
    //    Preserve progress data so user can see what was synced before disconnect
    const current = await prisma.whatsAppInstance.findUnique({
      where: { id: instanceId },
      select: { history_sync_status: true, history_sync_progress: true },
    });

    const wasSyncing = current?.history_sync_status === 'SYNCING';
    const progress = (current?.history_sync_progress as any) || {};
    if (wasSyncing) {
      progress.stopped_at = new Date().toISOString();
      progress.stopped_reason = 'disconnected';
    }

    await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: {
        status: 'DISCONNECTED',
        phone_number: null,
        qr_code: null,
        disconnected_at: new Date(),
        // Only change sync status if it was actively SYNCING
        ...(wasSyncing ? {
          history_sync_status: 'STOPPED',
          history_sync_progress: progress,
        } : {}),
      },
    });

    baileysEvents.emit('connection', {
      instanceId,
      status: 'DISCONNECTED',
      reason: 'manual_disconnect',
    });

    logger.info({ instanceId, syncStatus: wasSyncing ? 'STOPPED' : 'unchanged' }, '🔌 [DISCONNECT] Instance disconnected');
    return true;
  } catch (error) {
    logger.error({ error, instanceId }, 'Error disconnecting');
    return false;
  }
}

/**
 * Restart instance connection
 */
export async function restartInstance(
  instanceId: string,
  organizationId: string
): Promise<boolean> {
  try {
    // 1. Clean ALL sync state (timers, locks, pause flags)
    cleanupSyncState(instanceId);

    // 2. Cancel any pending reconnect timer from previous close
    const pendingReconnect = reconnectTimers.get(instanceId);
    if (pendingReconnect) {
      clearTimeout(pendingReconnect);
      reconnectTimers.delete(instanceId);
    }

    // 3. Close existing socket with 440 (connectionReplaced) so close handler
    //    does NOT schedule another reconnect or touch DB
    const socket = activeSockets.get(instanceId);
    if (socket) {
      manuallyDisconnecting.add(instanceId);
      try {
        socket.end(new Boom('Restarting instance', { statusCode: 440 }));
      } finally {
        manuallyDisconnecting.delete(instanceId);
      }
      activeSockets.delete(instanceId);
    }

    // 4. Wait for socket cleanup
    await delay(2000);

    // 5. Reinitialize fresh connection
    await initializeConnection(instanceId, organizationId);
    return true;
  } catch (error) {
    logger.error({ error, instanceId }, 'Error restarting instance');
    return false;
  }
}

// ============================================
// MESSAGE FUNCTIONS
// ============================================

/**
 * Send text message
 */
export async function sendTextMessage(
  instanceId: string,
  to: string,
  message: string
): Promise<{ success: boolean; message_id?: string; error?: string }> {
  const socket = activeSockets.get(instanceId);
  
  if (!socket?.user) {
    return { success: false, error: 'Instance not connected' };
  }

  // Check rate limiting
  const canSend = await canSendMessage(instanceId);
  if (!canSend.allowed) {
    return { success: false, error: canSend.reason };
  }

  try {
    const jid = formatPhoneToJid(to);
    
    // Simulate typing for more human-like behavior
    await socket.presenceSubscribe(jid);
    await delay(500);
    await socket.sendPresenceUpdate('composing', jid);
    
    // Calculate typing time based on message length (40-60 chars per second)
    const typingTime = Math.min(Math.max(message.length * 20, 1000), 5000);
    await delay(typingTime);
    
    await socket.sendPresenceUpdate('paused', jid);

    // Send message
    const result = await socket.sendMessage(jid, { text: message });

    // Update message count
    await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: {
        daily_message_count: { increment: 1 },
        last_message_at: new Date(),
      },
    });

    return {
      success: true,
      message_id: result?.key?.id || undefined,
    };
  } catch (error) {
    logger.error({ error, instanceId, to }, 'Error sending text message');
    
    // Decrease health score on error
    await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: { health_score: { decrement: 5 } },
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message',
    };
  }
}

/**
 * Get mimetype from URL or filename extension
 */
function getMimetypeFromUrl(url: string, defaultType: string): string {
  const mimetypes: Record<string, string> = {
    // Video
    '.mp4': 'video/mp4',
    '.mpeg': 'video/mpeg',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    // Document
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    // Audio
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
  };

  try {
    // Extract filename from URL
    const urlPath = new URL(url).pathname;
    const ext = urlPath.substring(urlPath.lastIndexOf('.')).toLowerCase();
    return mimetypes[ext] || defaultType;
  } catch {
    return defaultType;
  }
}

/**
 * Get filename from URL
 */
function getFilenameFromUrl(url: string, defaultName: string): string {
  try {
    const urlPath = new URL(url).pathname;
    const filename = urlPath.substring(urlPath.lastIndexOf('/') + 1);
    return filename || defaultName;
  } catch {
    return defaultName;
  }
}

/**
 * Resolve media URL to a local file path if the URL points to self-hosted storage.
 * Returns { localPath } for self-hosted files, { remoteUrl } for external URLs.
 * Self-hosted uploads are served at e.g. http://localhost:3001/uploads/orgId/uuid.ext
 * Resolving to local path avoids SSRF validation and auth issues when Baileys fetches the file.
 */
function resolveMediaSource(mediaUrl: string): { localPath: string } | { remoteUrl: string } {
  const appUrl = config.app.url; // e.g. "http://localhost:3001"
  const uploadsPrefix = `${appUrl}/uploads/`;
  const mediaPrefix = `${appUrl}/media/`;

  let relativePath: string | null = null;

  if (mediaUrl.startsWith(uploadsPrefix)) {
    // e.g. "http://localhost:3001/uploads/orgId/uuid.jpg" → "orgId/uuid.jpg"
    relativePath = mediaUrl.substring(uploadsPrefix.length);
  } else if (mediaUrl.startsWith(mediaPrefix)) {
    // e.g. "http://localhost:3001/media/orgId/uuid.jpg" → "orgId/uuid.jpg"
    relativePath = mediaUrl.substring(mediaPrefix.length);
  }

  if (relativePath) {
    // Sanitize: prevent path traversal
    const sanitized = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
    const uploadsRoot = path.resolve(config.storage.path, 'uploads');
    const localPath = path.resolve(uploadsRoot, sanitized);

    // Verify the resolved path is within uploads directory and file exists
    if (localPath.startsWith(uploadsRoot) && fs.existsSync(localPath)) {
      return { localPath };
    }
  }

  return { remoteUrl: mediaUrl };
}

/**
 * Send media message
 */
export async function sendMediaMessage(
  instanceId: string,
  to: string,
  mediaUrl: string,
  mediaType: 'image' | 'video' | 'audio' | 'document',
  caption?: string,
  filename?: string
): Promise<{ success: boolean; message_id?: string; error?: string }> {
  const socket = activeSockets.get(instanceId);
  
  if (!socket?.user) {
    return { success: false, error: 'Instance not connected' };
  }

  const canSend = await canSendMessage(instanceId);
  if (!canSend.allowed) {
    return { success: false, error: canSend.reason };
  }

  // Resolve media source: local file path for self-hosted uploads, remote URL otherwise
  const mediaSource = resolveMediaSource(mediaUrl);

  // Only run SSRF validation for remote URLs (external API calls)
  if ('remoteUrl' in mediaSource) {
    const urlValidation = await validateMediaUrl(mediaSource.remoteUrl);
    if (!urlValidation.valid) {
      return { success: false, error: `Invalid media URL: ${urlValidation.error}` };
    }
  }

  // Determine what to pass to Baileys: local file path or remote URL
  const mediaSrc = 'localPath' in mediaSource
    ? { url: mediaSource.localPath }
    : { url: mediaSource.remoteUrl };

  try {
    const jid = formatPhoneToJid(to);
    
    let messageContent: any;
    
    switch (mediaType) {
      case 'image':
        messageContent = {
          image: mediaSrc,
          caption,
        };
        break;
      case 'video':
        messageContent = {
          video: mediaSrc,
          mimetype: getMimetypeFromUrl(mediaUrl, 'video/mp4'),
          caption,
        };
        break;
      case 'audio':
        messageContent = {
          audio: mediaSrc,
          mimetype: getMimetypeFromUrl(mediaUrl, 'audio/mpeg'),
        };
        break;
      case 'document':
        messageContent = {
          document: mediaSrc,
          mimetype: getMimetypeFromUrl(mediaUrl, 'application/octet-stream'),
          fileName: filename || getFilenameFromUrl(mediaUrl, 'document'),
          caption,
        };
        break;
    }

    const result = await socket.sendMessage(jid, messageContent);

    // Update message count
    await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: {
        daily_message_count: { increment: 1 },
        last_message_at: new Date(),
      },
    });

    return {
      success: true,
      message_id: result?.key?.id || undefined,
    };
  } catch (error) {
    logger.error({ error, instanceId, to }, 'Error sending media message');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send media',
    };
  }
}

/**
 * Send location message
 */
export async function sendLocationMessage(
  instanceId: string,
  to: string,
  latitude: number,
  longitude: number,
  name?: string,
  address?: string
): Promise<{ success: boolean; message_id?: string; error?: string }> {
  const socket = activeSockets.get(instanceId);
  
  if (!socket?.user) {
    return { success: false, error: 'Instance not connected' };
  }

  // Check daily sending limit (same as sendTextMessage)
  const canSend = await canSendMessage(instanceId);
  if (!canSend.allowed) {
    return { success: false, error: canSend.reason };
  }

  try {
    const jid = formatPhoneToJid(to);
    
    const result = await socket.sendMessage(jid, {
      location: {
        degreesLatitude: latitude,
        degreesLongitude: longitude,
        name,
        address,
      },
    });

    // Increment daily message count (same as sendTextMessage)
    await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: {
        daily_message_count: { increment: 1 },
        last_message_at: new Date(),
      },
    });

    return {
      success: true,
      message_id: result?.key?.id || undefined,
    };
  } catch (error) {
    logger.error({ error, instanceId, to }, 'Error sending location');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send location',
    };
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Update instance status in database
 */
async function updateInstanceStatus(
  instanceId: string,
  status: InstanceStatus,
  additionalData?: Record<string, any>
): Promise<void> {
  try {
    await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: {
        status,
        ...additionalData,
      },
    });
  } catch (error) {
    logger.error({ error, instanceId, status }, 'Error updating instance status');
  }
}

// ============================================
// HISTORY SYNC ENGINE
// ============================================

/**
 * Handle WhatsApp messaging-history.set event.
 * Processes history messages and contacts in batches with deduplication.
 * Called from emit-level interception — serialized per instance via enqueueSyncBatch.
 */
async function handleHistorySync(
  instanceId: string,
  organizationId: string,
  data: { messages: WAMessage[]; chats: any[]; contacts: any[]; isLatest: boolean }
): Promise<void> {
  const { messages, chats, contacts, isLatest } = data;

  try {
    // 1. Check if sync is enabled for this instance
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { id: instanceId },
      select: {
        sync_history_on_connect: true,
        history_sync_status: true,
        history_sync_progress: true,
        phone_number: true,
        organization: {
          select: {
            subscription_plan: {
              select: {
                allow_history_sync: true,
                max_sync_messages: true,
              },
            },
          },
        },
      },
    });

    if (!instance) {
      logger.warn({ instanceId }, '⚠️ [SYNC] Instance not found, skipping history sync');
      return;
    }

    // Check if sync is paused/stopped by user
    if (syncPausedInstances.has(instanceId) || instance.history_sync_status === 'STOPPED') {
      logger.info({ instanceId, skippedCount: messages.length }, '⏸️ [SYNC] Sync is STOPPED, skipping messages');
      return;
    }

    if (!instance.sync_history_on_connect) {
      logger.info({ instanceId, skippedCount: messages.length }, '📜 [SYNC] sync_history_on_connect=false, skipping messages');
      return;
    }

    // 2. Check plan quota
    const plan = instance.organization?.subscription_plan;
    if (plan && !plan.allow_history_sync) {
      logger.info({ instanceId }, '📜 [SYNC] Plan does not allow history sync');
      return;
    }

    // Check current synced message count vs quota
    let currentSyncedCount = 0;
    const maxSyncMessages = (plan as any)?.max_sync_messages ?? 0; // 0 = unlimited
    if (maxSyncMessages > 0) {
      currentSyncedCount = await prisma.message.count({
        where: { instance_id: instanceId, source: 'HISTORY_SYNC' },
      });
      if (currentSyncedCount >= maxSyncMessages) {
        logger.info({ instanceId, currentSyncedCount, maxSyncMessages }, '📜 [SYNC] Quota reached');
        await prisma.whatsAppInstance.update({
          where: { id: instanceId },
          data: {
            history_sync_status: 'PARTIAL',
            history_sync_progress: {
              ...((instance.history_sync_progress as any) || {}),
              quota_reached: true,
              quota_limit: maxSyncMessages,
              quota_used: currentSyncedCount,
            },
          },
        });
        return;
      }
    }

    // 3. Update status to SYNCING if not already
    if (instance.history_sync_status !== 'SYNCING') {
      await prisma.whatsAppInstance.update({
        where: { id: instanceId },
        data: {
          history_sync_status: 'SYNCING',
          history_sync_progress: {
            total_messages_received: messages.length,
            messages_inserted: 0,
            messages_skipped_duplicate: 0,
            contacts_synced: 0,
            batch_errors: 0,
            percentage: 0,
            batches_received: 1,
            last_batch_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
          },
        },
      });

      // Emit webhook: sync started
      baileysEvents.emit('history.sync', {
        instanceId,
        event: 'history.sync.started',
        data: { instance_id: instanceId, started_at: new Date().toISOString() },
      });
    }

    // Load current progress
    const rawProgress = (instance.history_sync_progress as any) || {};
    const progress: any = { ...rawProgress };
    if (!progress.started_at) {
      progress.started_at = new Date().toISOString();
    }
    if (!progress.total_messages_received) progress.total_messages_received = 0;
    if (!progress.messages_inserted) progress.messages_inserted = 0;
    if (!progress.messages_skipped_duplicate) progress.messages_skipped_duplicate = 0;
    if (!progress.contacts_synced) progress.contacts_synced = 0;
    if (!progress.batch_errors) progress.batch_errors = 0;
    if (progress.percentage === undefined) progress.percentage = 0;

    progress.total_messages_received = (progress.total_messages_received || 0) + messages.length;

    // 4. Process messages in batches of 100
    const BATCH_SIZE = 100;
    const instancePhoneJid = instance.phone_number ? `${instance.phone_number}@s.whatsapp.net` : '';
    let batchInserted = 0;
    let batchSkipped = 0;
    let batchErrors = 0;
    let remainingQuota = maxSyncMessages > 0 ? maxSyncMessages - currentSyncedCount : Infinity;

    for (let i = 0; i < messages.length && remainingQuota > 0; i += BATCH_SIZE) {
      const batch = messages.slice(i, Math.min(i + BATCH_SIZE, i + remainingQuota));

      try {
        const dbRecords: any[] = [];

        for (const msg of batch) {
          // Skip status@broadcast
          if (msg.key?.remoteJid === 'status@broadcast') continue;

          const extracted = extractMessageContent(msg);
          if (!extracted) continue; // protocolMessage or empty

          const { text, messageType } = extracted;
          const chatJid = msg.key.remoteJid || '';
          const timestamp = convertMessageTimestamp(msg.messageTimestamp);

          // Generate wa_message_id — fallback for missing IDs
          const waMessageId = msg.key.id || generateFallbackMessageId(chatJid, timestamp, text);

          // Detect direction
          const direction = msg.key.fromMe ? 'OUTGOING' : 'INCOMING';

          // Detect sender (handles group chats)
          const senderJid = msg.key.fromMe
            ? instancePhoneJid
            : (msg.key.participant || msg.key.remoteJid || '');

          // Determine status
          const status = msg.key.fromMe ? 'SENT' : 'DELIVERED';

          // Convert timestamp to Date — use original timestamp, NOT new Date()
          const sentAt = timestamp ? new Date(timestamp * 1000) : null;

          dbRecords.push({
            organization_id: organizationId,
            instance_id: instanceId,
            wa_message_id: waMessageId,
            chat_jid: chatJid,
            sender_jid: senderJid,
            message_type: messageType,
            content: text,
            direction,
            status,
            source: 'HISTORY_SYNC',
            sent_at: sentAt,
            delivered_at: direction === 'INCOMING' ? sentAt : null,
          });
        }

        if (dbRecords.length > 0) {
          const result = await prisma.message.createMany({
            data: dbRecords,
            skipDuplicates: true,
          });
          batchInserted += result.count;
          batchSkipped += dbRecords.length - result.count;
          remainingQuota -= result.count;
        }
      } catch (err) {
        batchErrors++;
        logger.error({ err, instanceId, batchIndex: Math.floor(i / BATCH_SIZE) }, '❌ [SYNC] Batch insert error');
      }

      // Breathing room for DB between batches
      if (i + BATCH_SIZE < messages.length) {
        await delay(50);
      }
    }

    // 5. Process contacts
    let contactsSynced = 0;
    let lidMappingsFound = 0;
    for (const contact of contacts) {
      try {
        if (!contact.id) continue;
        const contactJid = contact.id;
        const phoneNumber = extractPhoneFromJid(contactJid);
        const isGroup = contactJid.endsWith('@g.us');

        // Capture LID ↔ Phone mappings from contact data
        // Baileys contacts may have: { id: '628xxx@s.whatsapp.net', lid: '37224xxx@lid', phoneNumber: '628xxx@s.whatsapp.net' }
        const contactLid = (contact as any).lid as string | undefined;
        const contactPhoneNumber = (contact as any).phoneNumber as string | undefined;

        // Case 1: Contact has PN as id + LID in .lid field
        if (contactLid && contactLid.endsWith('@lid') && contactJid.endsWith('@s.whatsapp.net')) {
          const pnClean = contactJid.replace('@s.whatsapp.net', '');
          await prisma.lidPhoneMapping.upsert({
            where: { instance_id_lid_jid: { instance_id: instanceId, lid_jid: contactLid } },
            create: { instance_id: instanceId, lid_jid: contactLid, phone_jid: contactJid, phone_number: pnClean, source: 'history-sync' },
            update: { phone_jid: contactJid, phone_number: pnClean },
          }).catch((err: unknown) => { logger.debug({ err, instanceId }, 'LID mapping upsert skipped'); }); // Non-critical
          lidMappingsFound++;
        }

        // Case 2: Contact has LID as id + phoneNumber field
        if (contactJid.endsWith('@lid') && contactPhoneNumber && contactPhoneNumber.endsWith('@s.whatsapp.net')) {
          const pnClean = contactPhoneNumber.replace('@s.whatsapp.net', '');
          await prisma.lidPhoneMapping.upsert({
            where: { instance_id_lid_jid: { instance_id: instanceId, lid_jid: contactJid } },
            create: { instance_id: instanceId, lid_jid: contactJid, phone_jid: contactPhoneNumber, phone_number: pnClean, source: 'history-sync' },
            update: { phone_jid: contactPhoneNumber, phone_number: pnClean },
          }).catch((err: unknown) => { logger.debug({ err, instanceId }, 'LID mapping upsert skipped'); });
          // Also backfill the contact phone_number
          lidMappingsFound++;
        }

        // Resolve phone_number for @lid contacts using mapping
        let resolvedPhone = phoneNumber;
        if (!resolvedPhone && contactJid.endsWith('@lid')) {
          // Try to look up from mapping we just saved or existing
          if (contactPhoneNumber?.endsWith('@s.whatsapp.net')) {
            resolvedPhone = contactPhoneNumber.replace('@s.whatsapp.net', '');
          }
        }

        await prisma.contact.upsert({
          where: {
            instance_id_jid: {
              instance_id: instanceId,
              jid: contactJid,
            },
          },
          create: {
            organization_id: organizationId,
            instance_id: instanceId,
            jid: contactJid,
            phone_number: isGroup ? null : (resolvedPhone || phoneNumber),
            name: contact.name || null,
            push_name: contact.notify || null,
            is_group: isGroup,
          },
          update: {
            push_name: contact.notify || undefined,
            name: contact.name || undefined,
            // Update phone_number if was null and we now have it
            ...(resolvedPhone ? { phone_number: resolvedPhone } : {}),
          },
        });
        contactsSynced++;
      } catch (err) {
        logger.error({ err, contactId: contact.id, instanceId }, '⚠️ [SYNC] Contact upsert error');
      }
    }

    if (lidMappingsFound > 0) {
      logger.info({ instanceId, lidMappingsFound }, '🔗 [SYNC] Found LID→Phone mapping(s) from history sync contacts');
    }

    // 6. Update progress
    progress.messages_inserted = (progress.messages_inserted || 0) + batchInserted;
    progress.messages_skipped_duplicate = (progress.messages_skipped_duplicate || 0) + batchSkipped;
    progress.contacts_synced = (progress.contacts_synced || 0) + contactsSynced;
    progress.batch_errors = (progress.batch_errors || 0) + batchErrors;
    progress.batches_received = (progress.batches_received || 0) + 1;
    progress.last_batch_at = new Date().toISOString();

    // Calculate percentage based on batches received (heuristic: typical sync ~20-50 batches)
    // Cap at 95% — only completion detection sets 100%
    progress.percentage = Math.min(95, Math.max(5, Math.round((progress.batches_received || 0) * 2.5)));

    // Calculate messages per second rate
    if (progress.started_at) {
      const elapsedMs = Date.now() - new Date(progress.started_at).getTime();
      const elapsedSec = elapsedMs / 1000;
      progress.messages_per_second = elapsedSec > 0
        ? Math.round(progress.messages_inserted / elapsedSec)
        : 0;
    }

    await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: {
        history_sync_progress: progress,
        updated_at: new Date(),
      },
    });

    logger.info({ instanceId, batchInserted, batchSkipped, contactsSynced, batchErrors }, '📜 [SYNC] Batch done');

    // Emit webhook: progress
    baileysEvents.emit('history.sync', {
      instanceId,
      event: 'history.sync.progress',
      data: {
        instance_id: instanceId,
        percentage: progress.percentage || 0,
        messages_inserted: progress.messages_inserted,
        contacts_synced: progress.contacts_synced,
      },
    });

    // 7. Completion detection via timeout
    // Reset timer — if no new batch arrives within 30s after isLatest=true, mark COMPLETED
    const existingTimer = syncCompletionTimers.get(instanceId);
    if (existingTimer) clearTimeout(existingTimer);

    if (isLatest) {
      const timer = setTimeout(async () => {
        try {
          syncCompletionTimers.delete(instanceId);

          // Re-fetch latest progress from DB
          const latest = await prisma.whatsAppInstance.findUnique({
            where: { id: instanceId },
            select: { history_sync_status: true, history_sync_progress: true },
          });

          if (latest?.history_sync_status === 'SYNCING') {
            const finalProgress = (latest.history_sync_progress as any) || {};
            finalProgress.percentage = 100;
            finalProgress.completed_at = new Date().toISOString();

            const finalStatus = (finalProgress.batch_errors || 0) > 0 ? 'PARTIAL' : 'COMPLETED';

            await prisma.whatsAppInstance.update({
              where: { id: instanceId },
              data: {
                history_sync_status: finalStatus as any,
                history_sync_progress: finalProgress,
                last_history_sync_at: new Date(),
              },
            });

            logger.info({ instanceId, finalStatus, messagesInserted: finalProgress.messages_inserted, contactsSynced: finalProgress.contacts_synced }, '✅ [SYNC] History sync completed');

            // Emit webhook: completed
            baileysEvents.emit('history.sync', {
              instanceId,
              event: `history.sync.${finalStatus.toLowerCase()}`,
              data: {
                instance_id: instanceId,
                total_messages: finalProgress.messages_inserted,
                total_contacts: finalProgress.contacts_synced,
                duration_seconds: finalProgress.started_at
                  ? Math.round((Date.now() - new Date(finalProgress.started_at).getTime()) / 1000)
                  : 0,
              },
            });
          }
        } catch (err) {
          logger.error({ err, instanceId }, '❌ [SYNC] Error in completion handler');
        }
      }, 30000); // 30 seconds timeout

      syncCompletionTimers.set(instanceId, timer);
    }
  } catch (error) {
    logger.error({ error, instanceId }, '❌ [SYNC] Error in handleHistorySync');

    // Mark as FAILED
    try {
      const currentProgress = await prisma.whatsAppInstance.findUnique({
        where: { id: instanceId },
        select: { history_sync_progress: true },
      });
      const failProgress = (currentProgress?.history_sync_progress as any) || {};
      failProgress.error = String(error);
      failProgress.failed_at = new Date().toISOString();

      await prisma.whatsAppInstance.update({
        where: { id: instanceId },
        data: {
          history_sync_status: 'FAILED',
          history_sync_progress: failProgress,
        },
      });

      baileysEvents.emit('history.sync', {
        instanceId,
        event: 'history.sync.failed',
        data: {
          instance_id: instanceId,
          error: String(error),
          messages_inserted_before_failure: failProgress.messages_inserted || 0,
        },
      });
    } catch (updateErr) {
      logger.error({ updateErr, instanceId }, '❌ [SYNC] Failed to update error status');
    }
  }
}

/**
 * Handle historical messages arriving via messages.upsert type=append.
 * These come in smaller batches compared to messaging-history.set.
 */
async function handleAppendHistoryMessages(
  instanceId: string,
  organizationId: string,
  messages: WAMessage[]
): Promise<void> {
  try {
    const config = await getSyncConfig(instanceId);
    if (!config.syncEnabled) {
      logger.info({ instanceId, count: messages.length }, '📜 [HISTORY] Ignoring historical message(s) (type=append, sync disabled)');
      return;
    }

    // Check if sync is paused/stopped
    if (syncPausedInstances.has(instanceId)) {
      logger.info({ instanceId, count: messages.length }, '⏸️ [HISTORY] Sync STOPPED, skipping append messages');
      return;
    }

    // Get instance phone + current sync state for progress tracking
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { id: instanceId },
      select: { phone_number: true, history_sync_status: true, history_sync_progress: true },
    });

    if (instance?.history_sync_status === 'STOPPED') {
      logger.info({ instanceId, count: messages.length }, '⏸️ [HISTORY] Sync STOPPED, skipping append messages');
      return;
    }

    const instancePhoneJid = instance?.phone_number ? `${instance.phone_number}@s.whatsapp.net` : '';

    let inserted = 0;
    let skipped = 0;

    for (const msg of messages) {
      if (msg.key?.remoteJid === 'status@broadcast') continue;

      const extracted = extractMessageContent(msg);
      if (!extracted) continue;

      const { text, messageType } = extracted;
      const chatJid = msg.key.remoteJid || '';
      const timestamp = convertMessageTimestamp(msg.messageTimestamp);
      const waMessageId = msg.key.id || generateFallbackMessageId(chatJid, timestamp, text);
      const direction = msg.key.fromMe ? 'OUTGOING' : 'INCOMING';
      const senderJid = msg.key.fromMe
        ? instancePhoneJid
        : (msg.key.participant || msg.key.remoteJid || '');
      const sentAt = timestamp ? new Date(timestamp * 1000) : null;

      try {
        await prisma.message.create({
          data: {
            organization_id: organizationId,
            instance_id: instanceId,
            wa_message_id: waMessageId,
            chat_jid: chatJid,
            sender_jid: senderJid,
            message_type: messageType,
            content: text,
            direction,
            status: msg.key.fromMe ? 'SENT' : 'DELIVERED',
            source: 'HISTORY_SYNC',
            sent_at: sentAt,
            delivered_at: direction === 'INCOMING' ? sentAt : null,
          },
        });
        inserted++;
      } catch (err: any) {
        // Handle duplicate — unique constraint violation (P2002)
        if (err?.code === 'P2002') {
          skipped++;
        } else {
          logger.error({ err, instanceId, msgId: waMessageId }, '⚠️ [HISTORY] Error inserting append message');
        }
      }
    }

    // Update progress tracking (merge with existing progress)
    if (inserted > 0 || skipped > 0) {
      logger.info({ instanceId, inserted, skipped }, '📜 [HISTORY] Append batch done');

      const rawProgress = (instance?.history_sync_progress as any) || {};
      const progress: any = { ...rawProgress };
      delete progress.set; // Remove Prisma artifact
      progress.total_messages_received = (progress.total_messages_received || 0) + messages.length;
      progress.messages_inserted = (progress.messages_inserted || 0) + inserted;
      progress.messages_skipped_duplicate = (progress.messages_skipped_duplicate || 0) + skipped;
      progress.batches_received = (progress.batches_received || 0) + 1;
      progress.last_batch_at = new Date().toISOString();
      if (!progress.started_at) progress.started_at = new Date().toISOString();

      // Calculate msgs/sec
      const elapsedMs = Date.now() - new Date(progress.started_at).getTime();
      const elapsedSec = elapsedMs / 1000;
      if (elapsedSec > 0) {
        progress.messages_per_second = Math.round(progress.messages_inserted / elapsedSec);
      }

      // Update DB — also set SYNCING if not already
      const updateData: any = { history_sync_progress: progress, updated_at: new Date() };
      if (instance?.history_sync_status === 'IDLE' || instance?.history_sync_status === null) {
        updateData.history_sync_status = 'SYNCING';
      }

      await prisma.whatsAppInstance.update({
        where: { id: instanceId },
        data: updateData,
      });
    }
  } catch (error) {
    logger.error({ error, instanceId }, '❌ [HISTORY] Error handling append messages');
  }
}

// ============================================
// LID → PHONE MAPPING HANDLER
// ============================================

/**
 * Handle LID → Phone Number mapping event from Baileys.
 * Stores the mapping in DB and backfills existing contacts that have this LID JID.
 * Also emits a webhook event so external CRMs can react immediately.
 */
async function handleLidMappingUpdate(
  instanceId: string,
  organizationId: string,
  mapping: { lid: string; pn: string },
  source: string = 'chats.phoneNumberShare'
): Promise<void> {
  try {
    const { lid, pn } = mapping;
    if (!lid || !pn) return;

    // Extract clean phone number from PN JID (e.g. 628123456789@s.whatsapp.net → 628123456789)
    const phoneNumber = pn.replace('@s.whatsapp.net', '').replace(/@.*$/, '');
    if (!phoneNumber) return;

    logger.info({ instanceId, lid, pn, phoneNumber, source }, '🔗 [LID-MAP] Storing mapping');

    // 1. Upsert into lid_phone_mappings table
    await prisma.lidPhoneMapping.upsert({
      where: {
        instance_id_lid_jid: {
          instance_id: instanceId,
          lid_jid: lid,
        },
      },
      create: {
        instance_id: instanceId,
        lid_jid: lid,
        phone_jid: pn,
        phone_number: phoneNumber,
        source,
      },
      update: {
        phone_jid: pn,
        phone_number: phoneNumber,
        source,
      },
    });

    // 2. Backfill: update Contact records that have this LID as their JID
    const updated = await prisma.contact.updateMany({
      where: {
        instance_id: instanceId,
        jid: lid,
        phone_number: null, // Only update if phone is not already set
      },
      data: {
        phone_number: phoneNumber,
      },
    });

    if (updated.count > 0) {
      logger.info({ instanceId, count: updated.count, phoneNumber, lid }, '🔗 [LID-MAP] Backfilled contacts');
    }

    // 3. Emit webhook event so CRM can update in real-time
    baileysEvents.emit('lid.mapping.resolved', {
      instanceId,
      lid_jid: lid,
      phone_jid: pn,
      phone_number: phoneNumber,
      contacts_updated: updated.count,
    });

    logger.info({ instanceId, lid, pn, phoneNumber, contactsUpdated: updated.count }, '🔗 LID mapping resolved and stored');
  } catch (error) {
    logger.error({ error, instanceId, mapping }, '❌ Error handling LID mapping update');
  }
}

/**
 * Batch resolve multiple LID JIDs to phone numbers.
 * Returns a Map<lid_jid, phone_number>.
 */
export async function batchResolveLidToPhone(
  instanceId: string,
  lidJids: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (lidJids.length === 0) return result;

  try {
    const mappings = await prisma.lidPhoneMapping.findMany({
      where: {
        instance_id: instanceId,
        lid_jid: { in: lidJids },
      },
    });
    for (const m of mappings) {
      result.set(m.lid_jid, m.phone_number);
    }
  } catch (error) {
    logger.error({ error, instanceId }, 'Error batch resolving LID mappings');
  }
  return result;
}

/** Media message types that can be downloaded from WhatsApp */
const DOWNLOADABLE_MEDIA_TYPES: Set<string> = new Set(['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER']);

/**
 * Download media from a WAMessage and save to local storage.
 * Returns the public URL if successful, null otherwise.
 * Non-critical — failure does not block message processing.
 */
async function downloadAndSaveMedia(
  msg: WAMessage,
  messageType: string,
  organizationId: string,
  instanceId: string,
): Promise<{ url: string; mimetype: string; fileSize: number; fileName: string | null } | null> {
  try {
    if (!DOWNLOADABLE_MEDIA_TYPES.has(messageType)) return null;

    const msgContent = msg.message;
    if (!msgContent) return null;

    // Determine the mimetype from the message content
    const contentType = getContentType(msgContent);
    if (!contentType) return null;

    // Get the actual media message object to read mimetype
    // Handle viewOnce and ephemeral wrappers
    let innerContent = msgContent;
    if (msgContent.viewOnceMessage?.message) {
      innerContent = msgContent.viewOnceMessage.message;
    } else if (msgContent.viewOnceMessageV2?.message) {
      innerContent = msgContent.viewOnceMessageV2.message;
    } else if (msgContent.ephemeralMessage?.message) {
      innerContent = msgContent.ephemeralMessage.message;
    }

    // Extract mimetype from the specific media message
    const mediaMsg = (innerContent as any)[getContentType(innerContent) || ''];
    const mimetype: string = mediaMsg?.mimetype || 'application/octet-stream';
    // Extract original filename (only exists for document messages from sender)
    const originalFileName: string | null = mediaMsg?.fileName || null;

    // Download media buffer from WhatsApp servers
    // Use instanceId to look up the correct socket for reupload requests
    const socket = activeSockets.get(instanceId);
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
      logger: logger as any,
      reuploadRequest: socket?.updateMediaMessage as any,
    });

    if (!buffer || (Buffer.isBuffer(buffer) && buffer.length === 0)) {
      logger.warn({ msgId: msg.key.id, messageType }, '⚠️ [MEDIA] Downloaded empty buffer');
      return null;
    }

    // Determine file extension from mimetype
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
      'video/mp4': 'mp4', 'video/mpeg': 'mpeg', 'video/quicktime': 'mov',
      'audio/ogg; codecs=opus': 'ogg', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a', 'audio/wav': 'wav',
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/msword': 'doc', 'application/vnd.ms-excel': 'xls',
    };
    const ext = extMap[mimetype.split(';')[0].trim()] || mimetype.split('/')[1]?.split(';')[0] || 'bin';
    const filename = `media_${Date.now()}.${ext}`;

    ensureUploadsDir();

    // Save via existing storage service (reuse, don't duplicate)
    const bufferData = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as any);
    const result = await saveFile(
      Readable.from(bufferData),
      filename,
      mimetype.split(';')[0].trim(), // Clean mimetype without codec params
      organizationId,
    );

    if (!result.success || !result.url) {
      logger.warn({ msgId: msg.key.id, error: result.error }, '⚠️ [MEDIA] Failed to save media file');
      return null;
    }

    // Replace /uploads/ with /media/ so the URL is publicly accessible (capability URL).
    // /uploads/* requires JWT/API-key auth (for dashboard frontend).
    // /media/* is public (UUID filenames are unguessable = secure).
    // External webhook consumers (CRM) need direct access without auth.
    const publicUrl = result.url.replace('/uploads/', '/media/');

    logger.info({ msgId: msg.key.id, messageType, url: publicUrl, size: bufferData.length }, '📥 [MEDIA] Downloaded and saved media');
    return { url: publicUrl, mimetype: mimetype.split(';')[0].trim(), fileSize: bufferData.length, fileName: originalFileName };
  } catch (error) {
    // Non-critical — log and continue. Message is still saved without media_url.
    logger.warn({ error, msgId: msg.key.id, messageType }, '⚠️ [MEDIA] Failed to download media (non-critical)');
    return null;
  }
}

/**
 * Handle real-time message (both incoming AND outgoing).
 * Uses upsert to gracefully handle the race condition where:
 *   - sendText() saves the outgoing message first (via API call)
 *   - Then Baileys fires messages.upsert for the same message
 * By using upsert, the second insert just updates instead of throwing a duplicate error.
 *
 * Also properly sets direction based on msg.key.fromMe.
 */
async function handleRealtimeMessage(
  instanceId: string,
  organizationId: string,
  msg: WAMessage
): Promise<void> {
  try {
    // Use shared extraction logic
    const extracted = extractMessageContent(msg);
    if (!extracted) return; // protocolMessage or empty content — skip

    const { text, messageType } = extracted;
    const fromMe = msg.key.fromMe ?? false;
    const direction = fromMe ? 'OUTGOING' : 'INCOMING';
    const chatJid = msg.key.remoteJid || '';
    const senderJid = fromMe
      ? '' // Will be filled by the instance's own phone number context
      : (msg.key.participant || msg.key.remoteJid || '');
    const waMessageId = msg.key.id || undefined;
    const pushName = msg.pushName || null; // WhatsApp profile name of the sender
    const now = new Date();

    // Download and save media for ALL media messages (both incoming and outgoing).
    // For outgoing from phone: this is the ONLY place media gets saved.
    // For outgoing from API: sendMedia() already saved the original URL, but this gives
    // a better /media/ public URL (downloaded from WA servers, saved locally).
    let savedMediaUrl: string | null = null;
    let savedMediaType: string | null = null;
    let savedFileSize: number | null = null;
    let savedFileName: string | null = null;
    if (DOWNLOADABLE_MEDIA_TYPES.has(messageType)) {
      const mediaResult = await downloadAndSaveMedia(msg, messageType, organizationId, instanceId);
      if (mediaResult) {
        savedMediaUrl = mediaResult.url;
        savedMediaType = mediaResult.mimetype;
        savedFileSize = mediaResult.fileSize;
        savedFileName = mediaResult.fileName;
      }
    }

    // Use race-safe upsert to avoid duplicate constraint violation.
    // Both sendText/sendMedia AND this handler may fire for the same outgoing message.
    if (waMessageId) {
      await safeMessageUpsert({
        where: {
          unique_wa_message_per_instance: {
            wa_message_id: waMessageId,
            instance_id: instanceId,
          },
        },
        create: {
          organization_id: organizationId,
          instance_id: instanceId,
          wa_message_id: waMessageId,
          chat_jid: chatJid,
          sender_jid: senderJid,
          message_type: messageType,
          content: text,
          media_url: savedMediaUrl,
          media_type: savedMediaType,
          direction,
          status: fromMe ? 'SENT' : 'DELIVERED',
          source: 'REALTIME',
          sent_at: fromMe ? now : null,
          delivered_at: fromMe ? null : now,
        },
        update: {
          // If already exists (e.g., outgoing saved by sendText/sendMedia), update relevant fields
          ...(fromMe ? {
            // For outgoing: update media_url with locally-saved /media/ URL (better than original URL)
            ...(savedMediaUrl ? { media_url: savedMediaUrl, media_type: savedMediaType } : {}),
          } : {
            // For incoming: update if somehow the API saved it first (shouldn't happen, but safe)
            direction,
            status: 'DELIVERED',
            delivered_at: now,
            // Also set media_url if downloaded
            ...(savedMediaUrl ? { media_url: savedMediaUrl, media_type: savedMediaType } : {}),
          }),
        },
      });
    } else {
      // No wa_message_id — rare edge case, use plain create
      await prisma.message.create({
        data: {
          organization_id: organizationId,
          instance_id: instanceId,
          chat_jid: chatJid,
          sender_jid: senderJid,
          message_type: messageType,
          content: text,
          media_url: savedMediaUrl,
          media_type: savedMediaType,
          direction,
          status: fromMe ? 'SENT' : 'DELIVERED',
          source: 'REALTIME',
          sent_at: fromMe ? now : null,
          delivered_at: fromMe ? null : now,
        },
      });
    }

    // Convert timestamp for webhook (handles protobuf Long objects)
    const timestamp = convertMessageTimestamp(msg.messageTimestamp);
    let phoneNumber = extractPhoneFromJid(chatJid);

    // Resolve LID → Phone number if this is a @lid chat
    // Without this, private chat webhooks for LID contacts have phone_number=null
    // and CRM cannot identify the customer
    if (!phoneNumber && chatJid.endsWith('@lid')) {
      try {
        // Step 1: Check DB mapping cache first (fast path)
        const mapping = await prisma.lidPhoneMapping.findUnique({
          where: {
            instance_id_lid_jid: {
              instance_id: instanceId,
              lid_jid: chatJid,
            },
          },
          select: { phone_number: true },
        });
        if (mapping?.phone_number) {
          phoneNumber = mapping.phone_number;
          logger.debug({ instanceId, lid: chatJid, resolved: phoneNumber }, '🔗 [LID-RESOLVE] Resolved LID to phone from DB');
        } else {
          // Step 2: Active resolution via Baileys socket — query WhatsApp directly
          // sock.onWhatsApp(lid) can resolve LID→phone JID
          const socket = activeSockets.get(instanceId);
          if (socket?.user) {
            try {
              const results = await socket.onWhatsApp(chatJid);
              if (results && results.length > 0) {
                const result = results[0];
                // result.jid is the @s.whatsapp.net JID if resolved
                if (result.jid && result.jid.endsWith('@s.whatsapp.net')) {
                  const resolvedPhone = result.jid.replace('@s.whatsapp.net', '');
                  phoneNumber = resolvedPhone;
                  logger.info({ instanceId, lid: chatJid, resolved: resolvedPhone }, '🔗 [LID-RESOLVE] Resolved LID via onWhatsApp query');
                  // Save to DB for future fast lookups
                  await prisma.lidPhoneMapping.upsert({
                    where: { instance_id_lid_jid: { instance_id: instanceId, lid_jid: chatJid } },
                    create: { instance_id: instanceId, lid_jid: chatJid, phone_jid: result.jid, phone_number: resolvedPhone, source: 'onWhatsApp' },
                    update: { phone_jid: result.jid, phone_number: resolvedPhone, source: 'onWhatsApp' },
                  }).catch(() => {}); // Non-critical
                  // Also backfill contact phone_number
                  await prisma.contact.updateMany({
                    where: { instance_id: instanceId, jid: chatJid, phone_number: null },
                    data: { phone_number: resolvedPhone },
                  }).catch(() => {});
                }
              }
            } catch (resolveErr) {
              // onWhatsApp may fail for various reasons — non-critical, just log
              logger.debug({ err: resolveErr, instanceId, lid: chatJid }, '⚠️ [LID-RESOLVE] onWhatsApp query failed');
            }
          }
          if (!phoneNumber) {
            logger.debug({ instanceId, lid: chatJid }, '⚠️ [LID-RESOLVE] Could not resolve LID — phone_number will be null');
          }
        }
      } catch (err) {
        logger.error({ err, instanceId, lid: chatJid }, '❌ [LID-RESOLVE] Error resolving LID mapping');
      }
    }

    // Resolve contact name for webhook payload
    // For INCOMING: msg.pushName = sender's name = the contact. Use directly, fallback to DB.
    // For OUTGOING: msg.pushName = OUR name (the account owner), NOT the recipient.
    //   We must look up the RECIPIENT's name from Contact DB instead.
    let contactName: string | null = null;
    if (fromMe) {
      // Outgoing: contact_name = recipient's name from DB (NOT msg.pushName which is sender/us)
      try {
        const contact = await prisma.contact.findFirst({
          where: { instance_id: instanceId, jid: chatJid },
          select: { push_name: true, name: true },
        });
        contactName = contact?.push_name || contact?.name || null;
      } catch {
        // Non-critical — proceed without name
      }
    } else {
      // Incoming: msg.pushName IS the sender = the contact
      contactName = pushName;
      if (!contactName) {
        try {
          const lookupJid = chatJid.endsWith('@g.us') ? senderJid : chatJid;
          if (lookupJid) {
            const contact = await prisma.contact.findFirst({
              where: { instance_id: instanceId, jid: lookupJid },
              select: { push_name: true, name: true },
            });
            contactName = contact?.push_name || contact?.name || null;
          }
        } catch {
          // Non-critical — proceed without name
        }
      }
    }

    // Update Contact push_name from incoming message if available
    // This keeps contact names fresh as users change their WA profile names
    if (pushName && !fromMe) {
      const contactJid = chatJid.endsWith('@g.us') ? senderJid : chatJid;
      if (contactJid) {
        prisma.contact.updateMany({
          where: { instance_id: instanceId, jid: contactJid, push_name: { not: pushName } },
          data: { push_name: pushName },
        }).catch(() => {}); // Fire-and-forget, non-critical
      }
    }

    // Emit webhook event with proper direction
    const eventType = fromMe ? 'outgoing' : 'incoming';
    logger.info({ instanceId, from: chatJid, type: messageType, fromMe, direction, pushName: contactName }, `📨 Emitting ${eventType} message event to baileysEvents`);
    baileysEvents.emit('message', {
      instanceId,
      type: eventType,
      message: {
        id: waMessageId,
        from: chatJid,
        chat_jid: chatJid,
        sender_jid: senderJid,
        phone_number: phoneNumber,
        contact_name: contactName,
        direction,
        type: messageType.toLowerCase(),
        content: text,
        media_url: savedMediaUrl || undefined,
        mime_type: savedMediaType || undefined,
        file_size: savedFileSize || undefined,
        file_name: savedFileName || undefined,
        timestamp,
      },
    });
  } catch (error) {
    logger.error({ error, instanceId }, 'Error handling real-time message');
  }
}

/**
 * Handle message status update
 */
async function handleMessageUpdate(
  instanceId: string,
  update: { key: WAMessageKey; update: Partial<WAMessage> }
): Promise<void> {
  try {
    const { key, update: statusUpdate } = update;
    
    if (statusUpdate.status) {
      const statusMap: Record<number, string> = {
        1: 'PENDING',
        2: 'SENT',
        3: 'DELIVERED',
        4: 'READ',
      };

      const status = statusMap[statusUpdate.status] || 'PENDING';

      await prisma.message.updateMany({
        where: {
          instance_id: instanceId,
          wa_message_id: key.id || undefined,
        },
        data: {
          status: status as any,
          ...(status === 'DELIVERED' && { delivered_at: new Date() }),
          ...(status === 'READ' && { read_at: new Date() }),
        },
      });

      baileysEvents.emit('message.status', {
        instanceId,
        message_id: key.id,
        status,
      });
    }
  } catch (error) {
    logger.error({ error, instanceId }, 'Error handling message update');
  }
}

/**
 * Get connection info for instance
 */
export async function getConnectionInfo(instanceId: string): Promise<ConnectionInfo | null> {
  const socket = activeSockets.get(instanceId);
  
  if (!socket?.user) {
    return null;
  }

  return {
    status: 'CONNECTED',
    phone_number: extractPhoneFromJid(socket.user.id),
    phone_name: socket.user.notify || socket.user.verifiedName || socket.user.name,
  };
}

/**
 * Initialize all active instances on startup
 */
export async function initializeActiveInstances(): Promise<void> {
  try {
    // --- Stale sync cleanup ---
    // If server restarted mid-sync, those syncs are dead. Finalize them properly.
    const staleSyncs = await prisma.whatsAppInstance.findMany({
      where: {
        history_sync_status: 'SYNCING',
        updated_at: { lt: new Date(Date.now() - 2 * 60 * 1000) }, // > 2 minutes ago
      },
      select: { id: true, history_sync_progress: true },
    });
    if (staleSyncs.length > 0) {
      for (const stale of staleSyncs) {
        const progress = (stale.history_sync_progress as any) || {};
        progress.percentage = 100;
        progress.completed_at = new Date().toISOString();
        progress.auto_completed_reason = 'server_restart';
        const finalStatus = (progress.batch_errors || 0) > 0 ? 'PARTIAL' : 'COMPLETED';

        await prisma.whatsAppInstance.update({
          where: { id: stale.id },
          data: {
            history_sync_status: finalStatus,
            history_sync_progress: progress,
            last_history_sync_at: new Date(),
          },
        });
      }
      logger.info({ count: staleSyncs.length }, '📜 [STARTUP] Finalized stale SYNCING instance(s)');
    }

    const instances = await prisma.whatsAppInstance.findMany({
      where: {
        is_active: true,
        status: { in: ['CONNECTED', 'CONNECTING', 'QR_READY', 'ERROR'] },
        deleted_at: null,
      },
      select: {
        id: true,
        organization_id: true,
        status: true,
      },
    });

    logger.info({ count: instances.length }, '📱 [STARTUP] Found active instance(s) to initialize');

    for (const instance of instances) {
      const hasSession = sessionExists(instance.id);
      logger.info({ instanceId: instance.id, hasSession, status: instance.status }, '📱 [STARTUP] Instance status');
      
      // Check if session exists
      if (hasSession) {
        // Initialize with delay to avoid rate limiting
        setTimeout(() => {
          logger.info({ instanceId: instance.id }, '📱 [STARTUP] Now initializing instance...');
          initializeConnection(instance.id, instance.organization_id).catch((err) => {
            logger.error({ err, instanceId: instance.id }, '📱 [STARTUP] Failed to initialize instance');
          });
        }, Math.random() * 5000);
      } else {
        logger.info({ instanceId: instance.id }, '📱 [STARTUP] No session, marking as DISCONNECTED');
        // No session, update status
        await prisma.whatsAppInstance.update({
          where: { id: instance.id },
          data: { status: 'DISCONNECTED' },
        });
      }
    }
  } catch (error) {
    logger.error({ err: error }, '📱 [STARTUP] Error initializing active instances');
  }
}
