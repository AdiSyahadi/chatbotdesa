import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

// Load .env file from backend root directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface Config {
  app: {
    env: string;
    port: number;
    url: string;
    frontendUrl: string;
  };
  database: {
    url: string;
  };
  redis: {
    url: string;
    password?: string;
    db: number;
  };
  jwt: {
    secret: string;
    refreshSecret: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };
  storage: {
    type: 'local' | 'minio';
    path: string;
    minio?: {
      endpoint: string;
      port: number;
      useSSL: boolean;
      accessKey: string;
      secretKey: string;
      bucketName: string;
    };
  };
  midtrans: {
    enabled: boolean;
    isProduction: boolean;
    serverKey: string;
    clientKey: string;
  };
  rateLimit: {
    max: number;
    window: string;
  };
  baileys: {
    maxInstancesPerServer: number;
    minMessageDelay: number;
    maxMessageDelay: number;
    sessionBackupInterval: number;
  };
  webhook: {
    maxRetries: number;
    retryDelay: number;
    timeout: number;
  };
  logging: {
    level: string;
    pretty: boolean;
  };
  cors: {
    origin: string;
  };
}

const config: Config = {
  app: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3001', 10),
    url: process.env.APP_URL || 'http://localhost:3001',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  },
  database: {
    url: process.env.DATABASE_URL || 'mysql://root:root@localhost:3306/whatsapp_saas',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  jwt: {
    secret: (() => {
      const secret = process.env.JWT_SECRET;
      if (!secret && process.env.NODE_ENV === 'production') {
        throw new Error('FATAL: JWT_SECRET environment variable is required in production');
      }
      if (!secret) {
        console.warn('⚠️  JWT_SECRET not set — using random secret (sessions will not persist across restarts)');
      }
      return secret || crypto.randomBytes(64).toString('hex');
    })(),
    refreshSecret: (() => {
      const secret = process.env.JWT_REFRESH_SECRET;
      if (!secret && process.env.NODE_ENV === 'production') {
        throw new Error('FATAL: JWT_REFRESH_SECRET environment variable is required in production');
      }
      if (!secret) {
        console.warn('⚠️  JWT_REFRESH_SECRET not set — using random secret (sessions will not persist across restarts)');
      }
      return secret || crypto.randomBytes(64).toString('hex');
    })(),
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  storage: {
    type: (process.env.FILE_STORAGE_TYPE as 'local' | 'minio') || 'local',
    path: process.env.FILE_STORAGE_PATH || path.join(__dirname, '../../storage'),
    minio: process.env.FILE_STORAGE_TYPE === 'minio' ? {
      endpoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000', 10),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
      bucketName: process.env.MINIO_BUCKET_NAME || 'whatsapp-saas',
    } : undefined,
  },
  midtrans: {
    enabled: process.env.MIDTRANS_ENABLED === 'true',
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY || '',
    clientKey: process.env.MIDTRANS_CLIENT_KEY || '',
  },
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    window: process.env.RATE_LIMIT_WINDOW || '15m',
  },
  baileys: {
    maxInstancesPerServer: parseInt(process.env.MAX_INSTANCES_PER_SERVER || '50', 10),
    minMessageDelay: parseInt(process.env.MIN_MESSAGE_DELAY || '3000', 10),
    maxMessageDelay: parseInt(process.env.MAX_MESSAGE_DELAY || '7000', 10),
    sessionBackupInterval: parseInt(process.env.SESSION_BACKUP_INTERVAL || '1', 10),
  },
  webhook: {
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY || '60000', 10),
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '30000', 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: process.env.LOG_PRETTY === 'true',
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },
};

export default config;
