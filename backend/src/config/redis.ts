import Redis from 'ioredis';
import config from './index';
import logger from './logger';

let redis: Redis | null = null;
let isRedisConnected = false;

try {
  redis = new Redis(config.redis.url, {
    password: config.redis.password || undefined,
    db: config.redis.db,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy(times) {
      if (times > 5) {
        logger.warn('Redis not available - broadcast features will be disabled');
        return null; // Stop retrying
      }
      const delay = Math.min(times * 500, 2000);
      return delay;
    },
  });

  redis.on('connect', () => {
    isRedisConnected = true;
    logger.info('Redis connected');
  });

  redis.on('ready', () => {
    isRedisConnected = true;
    logger.info('Redis ready');
  });

  redis.on('error', (err) => {
    // Only log if we were previously connected
    if (isRedisConnected) {
      logger.error({ err: err.message }, 'Redis connection error');
    }
    isRedisConnected = false;
  });

  redis.on('close', () => {
    isRedisConnected = false;
  });
} catch (err) {
  logger.warn('Failed to initialize Redis - broadcast features disabled');
  redis = null;
}

export function isRedisAvailable(): boolean {
  return isRedisConnected && redis !== null;
}

export default redis;

// Graceful shutdown
process.on('beforeExit', async () => {
  if (redis) {
    await redis.quit();
  }
});
