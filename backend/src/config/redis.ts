import Redis from 'ioredis';
import config from './index';

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
        console.warn('⚠️ Redis not available - broadcast features will be disabled');
        return null; // Stop retrying
      }
      const delay = Math.min(times * 500, 2000);
      return delay;
    },
  });

  redis.on('connect', () => {
    isRedisConnected = true;
    console.log('✅ Redis connected');
  });

  redis.on('ready', () => {
    isRedisConnected = true;
    console.log('✅ Redis ready');
  });

  redis.on('error', (err) => {
    // Only log if we were previously connected
    if (isRedisConnected) {
      console.error('❌ Redis connection error:', err.message);
    }
    isRedisConnected = false;
  });

  redis.on('close', () => {
    isRedisConnected = false;
  });
} catch (err) {
  console.warn('⚠️ Failed to initialize Redis - broadcast features disabled');
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
