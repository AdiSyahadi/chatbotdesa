/**
 * API Rate Limiter - Redis-backed sliding window per API key
 * Replaces the fake cosmetic rate limit headers with real enforcement
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import Redis from 'ioredis';
import config from '../config';
import logger from '../config/logger';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redis.url, {
      password: config.redis.password || undefined,
      db: config.redis.db || 0,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 1000);
      },
    });
    redis.connect().catch(() => {});
  }
  return redis;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
}

async function checkRateLimit(
  apiKeyId: string,
  limit: number,
  windowMs: number = 60000
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const key = `ratelimit:apikey:${apiKeyId}`;
  const resetAt = new Date(now + windowMs);

  try {
    const r = getRedis();

    // Sliding window using sorted set
    const pipeline = r.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);       // Remove expired entries
    pipeline.zadd(key, now.toString(), `${now}:${Math.random().toString(36).slice(2)}`);
    pipeline.zcard(key);                                   // Count requests in window
    pipeline.pexpire(key, windowMs);                       // Set TTL

    const results = await pipeline.exec();
    const count = (results?.[2]?.[1] as number) || 0;

    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  } catch (error) {
    // If Redis is down, allow the request (fail-open)
    logger.warn({ apiKeyId, error }, 'Rate limiter Redis error — failing open');
    return { allowed: true, limit, remaining: limit - 1, resetAt };
  }
}

/**
 * Fastify preHandler hook for API key rate limiting
 * Must be registered AFTER API key authentication
 */
export async function apiRateLimitHook(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = (req as any).apiKey;
  if (!apiKey) return; // No API key = skip rate limiting

  const limit = apiKey.rate_limit || 1000; // per minute
  const result = await checkRateLimit(apiKey.id || apiKey.key_id, limit, 60000);

  // Always set headers
  reply.header('X-RateLimit-Limit', result.limit);
  reply.header('X-RateLimit-Remaining', result.remaining);
  reply.header('X-RateLimit-Reset', result.resetAt.toISOString());

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);
    reply.header('Retry-After', retryAfter);

    reply.status(429).send({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Rate limit of ${result.limit} requests per minute exceeded`,
        retry_after: retryAfter,
      },
    });
    return;
  }
}

/**
 * Cleanup Redis connection on shutdown
 */
export async function closeRateLimiter(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
