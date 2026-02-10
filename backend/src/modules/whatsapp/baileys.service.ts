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
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as QRCode from 'qrcode';
import pino from 'pino';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import prisma from '../../config/database';
import { InstanceStatus, WarmingPhase, MessageType } from '@prisma/client';
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

// Store QR codes with expiration
const qrCodeStore: Map<string, { code: string; expiresAt: Date }> = new Map();

// Store health check intervals for cleanup
const healthIntervals: Map<string, NodeJS.Timeout> = new Map();

// Reconnect guard: prevent duplicate reconnections
const reconnectTimers: Map<string, NodeJS.Timeout> = new Map();

// Sync config cache: avoid DB lookups per event
const syncConfigCache: Map<string, { syncEnabled: boolean }> = new Map();

// Sync locks: serialize batch processing per instance (async mutex via promise chaining)
const syncLocks: Map<string, Promise<void>> = new Map();

// Completion timers: detect end of history sync via timeout
const syncCompletionTimers: Map<string, NodeJS.Timeout> = new Map();

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
export function formatPhoneToJid(phone: string): string {
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
  // Standard JID
  return jid.replace('@s.whatsapp.net', '');
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
export function extractMessageContent(msg: WAMessage): ExtractedMessageContent | null {
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
export function convertMessageTimestamp(ts: any): number | undefined {
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
export function generateFallbackMessageId(chatJid: string, timestamp: number | undefined, content: string): string {
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
    console.log(`\n🔌 [INIT] Initializing connection for instance ${instanceId}`);
    
    // Check if already connected
    const existingSocket = activeSockets.get(instanceId);
    if (existingSocket?.user) {
      console.log(`🔌 [INIT] Already connected (user: ${existingSocket.user.id}), skipping`);
      return {
        success: true,
        status: 'CONNECTED',
      };
    }

    // Close existing socket if any (prevents conflict/replaced errors)
    if (existingSocket) {
      console.log(`🔌 [INIT] Closing existing socket without user for ${instanceId}`);
      try { existingSocket.end(undefined); } catch (e) { /* ignore */ }
      activeSockets.delete(instanceId);
    }

    // Clear any pending reconnect timer
    const pendingTimer = reconnectTimers.get(instanceId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      reconnectTimers.delete(instanceId);
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
      console.log(`📜 [INIT] History sync ENABLED for ${instanceId} — syncFullHistory=true`);
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
            console.log(`⚠️ getMessage error for ${key.id}:`, e);
          }
        }
        return undefined;
      },
    });

    // Store socket reference
    activeSockets.set(instanceId, socket);
    console.log(`🔌 [INIT] Socket created and stored for ${instanceId}. Active sockets: ${activeSockets.size}`);

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
          console.log(`\n🌐 [WS-MSG] CB:message #${wsMsgFrameCount} from=${from} offline=${offline}`);
        });

        // Periodic health check with buffer force-flush
        const prevInterval = healthIntervals.get(instanceId);
        if (prevInterval) clearInterval(prevInterval);
        
        const healthInterval = setInterval(() => {
          const isAlive = activeSockets.has(instanceId);
          if (!isAlive) {
            console.log(`♻️ [HEALTH] Instance ${instanceId.substring(0, 8)}... removed from activeSockets, stopping health check`);
            clearInterval(healthInterval);
            healthIntervals.delete(instanceId);
            return;
          }

          const timeSinceLastFrame = Date.now() - lastFrameTime;
          console.log(`♻️ [HEALTH] ${instanceId.substring(0, 8)}...: wsFrames=${wsFrameCount} msgFrames=${wsMsgFrameCount} lastFrame=${Math.round(timeSinceLastFrame / 1000)}s ago user=${socket.user?.id || 'none'}`);

          // CRITICAL: Force-flush the event buffer in case it's stuck
          // In Baileys v6, createBufferedFunction calls buffer() but never flush().
          // If the state machine doesn't call flush(), events accumulate forever.
          try {
            const evAny = socket.ev as any;
            if (typeof evAny.flush === 'function') {
              const flushed = evAny.flush();
              if (flushed) {
                console.log(`♻️ [HEALTH] 🚨 Buffer WAS stuck — force flushed events!`);
              }
            }
          } catch (e: any) {
            // ignore flush errors
          }

          // If no frames for 60s+ while "connected", the WS might be dead
          if (timeSinceLastFrame > 60000 && socket.user) {
            console.log(`⚠️ [HEALTH] No WS frames for ${Math.round(timeSinceLastFrame / 1000)}s — connection might be zombie!`);
          }
        }, 15000); // every 15 seconds (includes buffer flush)

        healthIntervals.set(instanceId, healthInterval);
        console.log(`🔌 [INIT] WebSocket monitoring + buffer flush attached for ${instanceId}`);
      } else {
        console.log(`⚠️ [INIT] socket.ws not accessible for monitoring`);
      }
    } catch (e: any) {
      console.log(`⚠️ [INIT] WS monitoring setup error:`, e.message);
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
        console.log(`🔍 [RAW-EVENT] ${eventName} type=${data?.type} count=${data?.messages?.length}`);
      }

      // IMPORTANT: Only process 'notify' type messages (new real-time messages)
      // 'append' type = historical sync from WhatsApp server on connect
      // Route to sync handler if sync is enabled, otherwise ignore
      if (eventName === 'messages.upsert' && data?.type === 'append' && data?.messages) {
        // Enqueue serialized per instance to avoid race conditions
        enqueueSyncBatch(instanceId, () =>
          handleAppendHistoryMessages(instanceId, organizationId, data.messages)
        );
      }

      // Handle messaging-history.set — main history sync event from WhatsApp
      if (eventName === 'messaging-history.set' && data) {
        console.log(`📜 [SYNC-EVENT] messaging-history.set: ${data.messages?.length || 0} msgs, ${data.chats?.length || 0} chats, ${data.contacts?.length || 0} contacts, isLatest=${data.isLatest}`);
        // Enqueue serialized per instance to avoid race conditions
        enqueueSyncBatch(instanceId, () =>
          handleHistorySync(instanceId, organizationId, data)
        );
      }

      // Process real-time messages DIRECTLY at emit level (before buffering)
      if (eventName === 'messages.upsert' && data?.type === 'notify' && data?.messages) {
        console.log(`\n🔔🔔🔔 [BAILEYS] Processing ${data.messages.length} notify message(s) at emit level`);
        for (const msg of data.messages) {
          if (msg.key?.remoteJid === 'status@broadcast') continue;
          console.log(`🔔 [BAILEYS] Message from=${msg.key?.remoteJid}, fromMe=${msg.key?.fromMe}, id=${msg.key?.id}`);
          handleRealtimeMessage(instanceId, organizationId, msg).catch((err: any) => {
            console.error(`❌ [BAILEYS] Error handling message:`, err);
          });
        }
      }

      // Process message status updates at emit level too
      if (eventName === 'messages.update' && Array.isArray(data)) {
        for (const update of data) {
          handleMessageUpdate(instanceId, update).catch((err: any) => {
            console.error(`❌ [BAILEYS] Error handling message update:`, err);
          });
        }
      }

      return originalEmit(event as any, data);
    };

    // =====================
    // EVENT HANDLERS (using ev.process() as recommended by Baileys)
    // =====================
    console.log(`🔌 [INIT] Binding event handlers for ${instanceId} using ev.process()...`);

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
        console.log(`🔌 [EVENT] connection.update for ${instanceId}: connection=${connection}, hasQr=${!!qr}`);
        logger.info({ instanceId, connection, hasQr: !!qr, update }, 'Connection update received');

        // Handle QR Code
        if (qr) {
          logger.info({ instanceId }, 'QR code received, generating base64...');
          try {
            const qrBase64 = await QRCode.toDataURL(qr, {
              width: 300,
              margin: 2,
            });

            // Store QR with 30 second expiration
            qrCodeStore.set(instanceId, {
              code: qrBase64,
              expiresAt: new Date(Date.now() + 30000),
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

          await prisma.whatsAppInstance.update({
            where: { id: instanceId },
            data: {
              status: 'CONNECTED',
              phone_number: phoneNumber,
              connected_at: new Date(),
              qr_code: null,
              health_score: 100,
            },
          });

          qrCodeStore.delete(instanceId);

          logger.info({ instanceId, phoneNumber }, 'WhatsApp connected');
          baileysEvents.emit('connection', {
            instanceId,
            status: 'CONNECTED',
            phone_number: phoneNumber,
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
          
          console.log(`🔌 [CLOSE] Instance ${instanceId}: statusCode=${statusCode}, error="${errorMsg}"`);

          // Determine if we should reconnect
          // 440 = connectionReplaced (conflict) — do NOT reconnect, another socket just opened
          const noReconnectCodes = [
            DisconnectReason.loggedOut,       // 401
            DisconnectReason.forbidden,       // 403
            440,                              // connectionReplaced/conflict
          ];
          const shouldReconnect = !noReconnectCodes.includes(statusCode || 0);

          if (statusCode === DisconnectReason.loggedOut) {
            deleteSession(instanceId);
            await updateInstanceStatus(instanceId, 'DISCONNECTED', {
              phone_number: null,
              connected_at: null,
              disconnected_at: new Date(),
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
            console.log(`🔌 [CLOSE] Conflict (440) for ${instanceId} — socket was replaced, NOT reconnecting`);
            // The newer socket is already connected, so don't update DB status
          } else if (statusCode === DisconnectReason.badSession) {
            deleteSession(instanceId);
            await updateInstanceStatus(instanceId, 'ERROR', {
              disconnected_at: new Date(),
            });

            logger.warn({ instanceId, statusCode }, 'Bad session, please reconnect');
          } else if (shouldReconnect) {
            // Only schedule reconnect if not already scheduled
            const existingTimer = reconnectTimers.get(instanceId);
            if (existingTimer) {
              console.log(`🔌 [CLOSE] Reconnect already scheduled for ${instanceId}, skipping`);
            } else {
              logger.info({ instanceId, statusCode }, 'Disconnected, will reconnect in 5s');
              await updateInstanceStatus(instanceId, 'CONNECTING');

              const timer = setTimeout(() => {
                reconnectTimers.delete(instanceId);
                initializeConnection(instanceId, organizationId).catch((err) => {
                  logger.error({ err, instanceId }, 'Reconnection failed');
                });
              }, 5000);
              reconnectTimers.set(instanceId, timer);
            }
          }
        }
      }

      // ---- Messages Upsert (handled at emit level above, this is backup) ----
      if (events['messages.upsert']) {
        const upsert = events['messages.upsert'];
        console.log(`📋 [PROCESS-BACKUP] messages.upsert via ev.process(): type=${upsert.type}, count=${upsert.messages.length}`);
        // NOTE: Primary handling is done at emit interception level above
      }

      // ---- Messages Update (handled at emit level above, this is backup) ----
      if (events['messages.update']) {
        console.log(`📋 [PROCESS-BACKUP] messages.update via ev.process(): ${events['messages.update'].length} updates`);
      }

      // ---- Messaging History Set (backup — primary handling is at emit level) ----
      if (events['messaging-history.set']) {
        const { messages, chats, contacts, isLatest } = events['messaging-history.set'];
        console.log(`📋 [PROCESS-BACKUP] messaging-history.set via ev.process(): ${messages.length} msgs, ${chats.length} chats, ${contacts.length} contacts, isLatest=${isLatest}`);
        // NOTE: Primary handling is done at emit interception level above
      }
    });

    console.log(`🔌 [INIT] All event handlers bound for ${instanceId} via ev.process(). Waiting for connection...`);

    // Wait a bit and check status
    await delay(2000);
    
    const currentStatus = socket.user ? 'CONNECTED' : 'QR_READY';
    const qrData = getQRCode(instanceId);
    console.log(`🔌 [INIT] Connection result for ${instanceId}: status=${currentStatus}, hasUser=${!!socket.user}, userId=${socket.user?.id || 'N/A'}`);

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
    const socket = activeSockets.get(instanceId);
    
    if (socket) {
      await socket.logout();
      activeSockets.delete(instanceId);
    }

    deleteSession(instanceId);
    qrCodeStore.delete(instanceId);

    await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: {
        status: 'DISCONNECTED',
        phone_number: null,
        qr_code: null,
        disconnected_at: new Date(),
      },
    });

    baileysEvents.emit('connection', {
      instanceId,
      status: 'DISCONNECTED',
      reason: 'manual_disconnect',
    });

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
    // First disconnect
    const socket = activeSockets.get(instanceId);
    if (socket) {
      socket.end(undefined);
      activeSockets.delete(instanceId);
    }

    // Wait a bit
    await delay(2000);

    // Reinitialize
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

  // SSRF protection: validate media URL before fetching
  const urlValidation = await validateMediaUrl(mediaUrl);
  if (!urlValidation.valid) {
    return { success: false, error: `Invalid media URL: ${urlValidation.error}` };
  }

  try {
    const jid = formatPhoneToJid(to);
    
    let messageContent: any;
    
    switch (mediaType) {
      case 'image':
        messageContent = {
          image: { url: mediaUrl },
          caption,
        };
        break;
      case 'video':
        messageContent = {
          video: { url: mediaUrl },
          mimetype: getMimetypeFromUrl(mediaUrl, 'video/mp4'),
          caption,
        };
        break;
      case 'audio':
        messageContent = {
          audio: { url: mediaUrl },
          mimetype: getMimetypeFromUrl(mediaUrl, 'audio/mpeg'),
        };
        break;
      case 'document':
        messageContent = {
          document: { url: mediaUrl },
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

    if (!instance.sync_history_on_connect) {
      console.log(`📜 [SYNC] sync_history_on_connect=false for ${instanceId}, skipping ${messages.length} messages`);
      return;
    }

    // 2. Check plan quota
    const plan = instance.organization?.subscription_plan;
    if (plan && !plan.allow_history_sync) {
      console.log(`📜 [SYNC] Plan does not allow history sync for ${instanceId}`);
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
        console.log(`📜 [SYNC] Quota reached for ${instanceId}: ${currentSyncedCount}/${maxSyncMessages} messages`);
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
    const progress = (instance.history_sync_progress as any) || {
      total_messages_received: 0,
      messages_inserted: 0,
      messages_skipped_duplicate: 0,
      contacts_synced: 0,
      batch_errors: 0,
      percentage: 0,
      started_at: new Date().toISOString(),
    };

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
    for (const contact of contacts) {
      try {
        if (!contact.id) continue;
        const contactJid = contact.id;
        const phoneNumber = extractPhoneFromJid(contactJid);
        const isGroup = contactJid.endsWith('@g.us');

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
            phone_number: isGroup ? null : phoneNumber,
            name: contact.name || null,
            push_name: contact.notify || null,
            is_group: isGroup,
          },
          update: {
            push_name: contact.notify || undefined,
            name: contact.name || undefined,
          },
        });
        contactsSynced++;
      } catch (err) {
        logger.error({ err, contactId: contact.id, instanceId }, '⚠️ [SYNC] Contact upsert error');
      }
    }

    // 6. Update progress
    progress.messages_inserted = (progress.messages_inserted || 0) + batchInserted;
    progress.messages_skipped_duplicate = (progress.messages_skipped_duplicate || 0) + batchSkipped;
    progress.contacts_synced = (progress.contacts_synced || 0) + contactsSynced;
    progress.batch_errors = (progress.batch_errors || 0) + batchErrors;

    await prisma.whatsAppInstance.update({
      where: { id: instanceId },
      data: {
        history_sync_progress: progress,
        updated_at: new Date(),
      },
    });

    console.log(`📜 [SYNC] Batch done for ${instanceId}: +${batchInserted} inserted, +${batchSkipped} skipped, +${contactsSynced} contacts, errors=${batchErrors}`);

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

            console.log(`✅ [SYNC] History sync ${finalStatus} for ${instanceId}: ${finalProgress.messages_inserted} messages, ${finalProgress.contacts_synced} contacts`);

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
      console.log(`📜 [HISTORY] Ignoring ${messages.length} historical message(s) (type=append, sync disabled)`);
      return;
    }

    // Get instance phone for direction detection
    const instance = await prisma.whatsAppInstance.findUnique({
      where: { id: instanceId },
      select: { phone_number: true },
    });
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

    if (inserted > 0 || skipped > 0) {
      console.log(`📜 [HISTORY] Append for ${instanceId}: +${inserted} inserted, ${skipped} duplicates skipped`);
    }
  } catch (error) {
    logger.error({ error, instanceId }, '❌ [HISTORY] Error handling append messages');
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
    const now = new Date();

    // Use upsert to avoid duplicate constraint violation.
    // If the message was already saved by sendText/sendMedia (outgoing via API),
    // the upsert will update it (e.g., we could update source or other metadata).
    // If it's a new message, it inserts.
    if (waMessageId) {
      await prisma.message.upsert({
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
          direction,
          status: fromMe ? 'SENT' : 'DELIVERED',
          source: 'REALTIME',
          sent_at: fromMe ? now : null,
          delivered_at: fromMe ? null : now,
        },
        update: {
          // If already exists (e.g., outgoing saved by sendText), don't overwrite — just mark it was seen by Baileys
          // Only update fields that Baileys might have better data for
          ...(fromMe ? {} : {
            // For incoming: update if somehow the API saved it first (shouldn't happen, but safe)
            direction,
            status: 'DELIVERED',
            delivered_at: now,
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
    const phoneNumber = extractPhoneFromJid(chatJid);

    // Emit webhook event with proper direction
    const eventType = fromMe ? 'outgoing' : 'incoming';
    logger.info({ instanceId, from: chatJid, type: messageType, fromMe, direction }, `📨 Emitting ${eventType} message event to baileysEvents`);
    baileysEvents.emit('message', {
      instanceId,
      type: eventType,
      message: {
        id: waMessageId,
        from: chatJid,
        chat_jid: chatJid,
        sender_jid: senderJid,
        phone_number: phoneNumber,
        direction,
        type: messageType.toLowerCase(),
        content: text,
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
    phone_name: socket.user.name,
  };
}

/**
 * Initialize all active instances on startup
 */
export async function initializeActiveInstances(): Promise<void> {
  try {
    // --- Stale sync cleanup ---
    // If server restarted mid-sync, those syncs are dead. Mark them PARTIAL.
    const staleSyncCount = await prisma.whatsAppInstance.updateMany({
      where: {
        history_sync_status: 'SYNCING',
        updated_at: { lt: new Date(Date.now() - 10 * 60 * 1000) }, // > 10 minutes ago
      },
      data: {
        history_sync_status: 'PARTIAL',
      },
    });
    if (staleSyncCount.count > 0) {
      console.log(`📜 [STARTUP] Marked ${staleSyncCount.count} stale SYNCING instance(s) as PARTIAL`);
    }

    const instances = await prisma.whatsAppInstance.findMany({
      where: {
        is_active: true,
        status: { in: ['CONNECTED', 'CONNECTING'] },
        deleted_at: null,
      },
      select: {
        id: true,
        organization_id: true,
      },
    });

    console.log(`\n📱 [STARTUP] Found ${instances.length} active instance(s) to initialize`);

    for (const instance of instances) {
      const hasSession = sessionExists(instance.id);
      console.log(`📱 [STARTUP] Instance ${instance.id}: hasSession=${hasSession}`);
      
      // Check if session exists
      if (hasSession) {
        // Initialize with delay to avoid rate limiting
        setTimeout(() => {
          console.log(`📱 [STARTUP] Now initializing instance ${instance.id}...`);
          initializeConnection(instance.id, instance.organization_id).catch((err) => {
            console.error(`📱 [STARTUP] Failed to initialize instance ${instance.id}:`, err);
          });
        }, Math.random() * 5000);
      } else {
        console.log(`📱 [STARTUP] No session for ${instance.id}, marking as DISCONNECTED`);
        // No session, update status
        await prisma.whatsAppInstance.update({
          where: { id: instance.id },
          data: { status: 'DISCONNECTED' },
        });
      }
    }
  } catch (error) {
    console.error('📱 [STARTUP] Error initializing active instances:', error);
  }
}
