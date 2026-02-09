import { PrismaClient } from '@prisma/client';
import config from './index';

const prismaClientSingleton = () => {
  return new PrismaClient({
    datasources: {
      db: {
        url: config.database.url,
      },
    },
    log:
      config.app.env === 'development'
        ? ['error', 'warn']
        : ['error'],
  });
};

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prisma ?? prismaClientSingleton();

export default prisma;

if (config.app.env !== 'production') globalThis.prisma = prisma;

// Middleware untuk multi-tenant isolation
// Automatically inject organization_id filter untuk semua query
prisma.$use(async (params, next) => {
  // Get organization_id from context (will be set by auth middleware)
  const organizationId = (params as any).organizationId;

  if (!organizationId) {
    return next(params);
  }

  // Models yang perlu organization_id filtering
  const modelsWithOrgId = [
    'User',
    'WhatsAppInstance',
    'Message',
    'Contact',
    'Webhook',
    'WebhookLog',
    'ApiKey',
    'Subscription',
    'Invoice',
    'UsageLog',
    'AuditLog',
  ];

  if (modelsWithOrgId.includes(params.model || '')) {
    // Add organization_id to where clause
    if (params.action === 'findMany' || params.action === 'findFirst') {
      params.args = params.args || {};
      params.args.where = params.args.where || {};
      params.args.where.organization_id = organizationId;
    }

    // Add organization_id to create/update data
    if (params.action === 'create' || params.action === 'update') {
      params.args = params.args || {};
      params.args.data = params.args.data || {};
      if (params.action === 'create') {
        params.args.data.organization_id = organizationId;
      }
    }
  }

  return next(params);
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
