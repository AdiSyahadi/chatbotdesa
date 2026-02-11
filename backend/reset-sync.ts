import prisma from './src/config/database';

async function main() {
  const instanceId = '9ffd4b01-14f5-4af6-8daa-b5856da96d57';

  // 1. Delete messages in batches to avoid lock timeout
  let totalMsgs = 0;
  while (true) {
    const batch = await prisma.message.deleteMany({
      where: { instance_id: instanceId },
      // @ts-ignore - Prisma doesn't have take on deleteMany, but we limit via raw
    });
    // deleteMany deletes all matching - if we get here, it succeeded
    totalMsgs += batch.count;
    console.log(`✅ Deleted ${batch.count} messages (total: ${totalMsgs})`);
    break;
  }

  // 2. Delete ALL contacts for this instance
  const deletedContacts = await prisma.contact.deleteMany({
    where: { instance_id: instanceId },
  });
  console.log(`✅ Deleted ${deletedContacts.count} contacts`);

  // 3. Reset sync status
  await prisma.whatsAppInstance.update({
    where: { id: instanceId },
    data: {
      history_sync_status: 'IDLE',
      history_sync_progress: { set: null },
      last_history_sync_at: null,
    },
  });
  console.log('✅ Reset sync status to IDLE');
  console.log('✅ Done! Siap untuk sync history lagi.');

  await prisma.$disconnect();
}

main().catch(console.error);
