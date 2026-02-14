/**
 * Shared BullMQ Redis connection options
 * All workers and queue producers MUST use this single source of truth.
 *
 * BullMQ requires separate ioredis connections (cannot share with @fastify/rate-limit or config/redis.ts),
 * but the HOST/PORT/PASSWORD must come from the same env vars.
 */

const redisConnectionOptions: {
  host: string;
  port: number;
  password?: string;
  maxRetriesPerRequest: null;
} = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

export default redisConnectionOptions;
