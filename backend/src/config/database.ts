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

// NOTE: Multi-tenant isolation is enforced at the service/route layer
// by explicitly filtering on organization_id from the JWT payload.
// A Prisma $use middleware was previously here but removed because
// params.organizationId was never set — it was dead code.

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
