#!/bin/bash
docker exec waapi-backend node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Update enterprise org limits
  const user = await prisma.user.findUnique({ where: { email: 'test@wapisas.com' } });
  if (!user) { console.log('User not found'); process.exit(1); }

  const org = await prisma.organization.update({
    where: { id: user.organization_id },
    data: {
      max_instances: 20,
      max_contacts: 100000,
      max_messages_per_day: 2000,
      subscription_status: 'ACTIVE',
    },
    select: { name: true, max_instances: true, max_contacts: true, max_messages_per_day: true, subscription_status: true }
  });

  console.log('Updated org:', JSON.stringify(org));
  await prisma.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"
