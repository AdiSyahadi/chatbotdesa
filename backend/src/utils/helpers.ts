import { DEFAULT_COUNTRY_CODE } from '../config/constants';

export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const randomDelay = (min: number, max: number): Promise<void> => {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return delay(ms);
};

export const formatPhoneNumber = (phone: string): string => {
  // Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '');
  
  // If starts with 0, replace with country code
  if (cleaned.startsWith('0')) {
    cleaned = DEFAULT_COUNTRY_CODE + cleaned.substring(1);
  }
  
  // If doesn't start with country code, assume default
  if (!cleaned.startsWith(DEFAULT_COUNTRY_CODE)) {
    cleaned = DEFAULT_COUNTRY_CODE + cleaned;
  }
  
  return cleaned;
};

// PATCH-114: Deprecated — use formatPhoneNumber directly. Kept for backward compat.
export const formatToJid = (phone: string): string => {
  const formatted = formatPhoneNumber(phone);
  return `${formatted}@s.whatsapp.net`;
};

// PATCH-114: Deprecated — use extractPhoneFromJid instead. Kept for backward compat.
export const parseJid = (jid: string): string => {
  return jid.split('@')[0];
};

/**
 * PATCH-114: Canonical phone extraction from JID.
 * Handles LID JIDs, group JIDs, device suffixes, and null inputs.
 * Single source of truth — previously duplicated in baileys.service.ts and contacts.schema.ts.
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
