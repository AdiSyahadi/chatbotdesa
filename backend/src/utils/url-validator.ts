/**
 * URL Validator - SSRF Protection
 * Blocks private/reserved IP ranges, internal hostnames, and non-HTTP(S) schemes.
 * Resolves DNS first to prevent DNS rebinding attacks.
 */

import { URL } from 'url';
import dns from 'dns/promises';
import net from 'net';
import logger from '../config/logger';

// Private/reserved IPv4 ranges that should never be accessed
const BLOCKED_IP_RANGES = [
  { start: '10.0.0.0', end: '10.255.255.255' },       // RFC 1918
  { start: '172.16.0.0', end: '172.31.255.255' },      // RFC 1918
  { start: '192.168.0.0', end: '192.168.255.255' },    // RFC 1918
  { start: '127.0.0.0', end: '127.255.255.255' },      // Loopback
  { start: '169.254.0.0', end: '169.254.255.255' },    // Link-local (includes AWS metadata)
  { start: '0.0.0.0', end: '0.255.255.255' },          // "This" network
  { start: '100.64.0.0', end: '100.127.255.255' },     // Carrier-grade NAT
  { start: '192.0.0.0', end: '192.0.0.255' },          // IETF Protocol Assignments
  { start: '198.18.0.0', end: '198.19.255.255' },      // Benchmark testing
];

const BLOCKED_HOSTNAMES = [
  'localhost',
  'metadata.google.internal',
  'metadata.google.com',
  '169.254.169.254',
  'metadata',
  'kubernetes.default.svc',
];

function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

function isPrivateIP(ip: string): boolean {
  // IPv6 private ranges
  if (net.isIPv6(ip)) {
    return ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd');
  }

  const ipLong = ipToLong(ip);
  return BLOCKED_IP_RANGES.some(range => {
    const start = ipToLong(range.start);
    const end = ipToLong(range.end);
    return ipLong >= start && ipLong <= end;
  });
}

export async function validateMediaUrl(urlString: string): Promise<{ valid: boolean; error?: string }> {
  // 1. Parse URL
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // 2. Only allow http and https
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, error: `Protocol '${parsed.protocol}' not allowed. Only http and https are supported.` };
  }

  // 3. Block known internal hostnames
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    logger.warn({ hostname, url: urlString }, '🛡️ SSRF attempt blocked: internal hostname');
    return { valid: false, error: `Hostname '${hostname}' is not allowed` };
  }

  // 4. If hostname is already an IP, check directly
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      logger.warn({ ip: hostname, url: urlString }, '🛡️ SSRF attempt blocked: private IP');
      return { valid: false, error: 'URLs pointing to private/internal IP addresses are not allowed' };
    }
    return { valid: true };
  }

  // 5. Resolve DNS and check if IP is private (prevents DNS rebinding)
  try {
    const addresses = await Promise.race([
      dns.resolve4(hostname).catch(() => [] as string[]),
      new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error('DNS timeout')), 5000)),
    ]);

    for (const addr of addresses) {
      if (isPrivateIP(addr)) {
        logger.warn({ hostname, resolvedIp: addr, url: urlString }, '🛡️ SSRF attempt blocked: DNS resolved to private IP');
        return { valid: false, error: 'URLs pointing to private/internal IP addresses are not allowed' };
      }
    }
  } catch {
    // DNS resolution failed or timed out — let Baileys handle the error
    return { valid: true };
  }

  return { valid: true };
}
