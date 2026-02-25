import prisma from '../src/config/database';

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'adi.rahadi024@gmail.com' },
    include: {
      organization: {
        include: { subscription_plan: true }
      }
    }
  });

  const org = user!.organization;

  console.log('=== ORGANIZATION ACTUAL LIMITS (enforced in code) ===');
  console.log('max_instances:', org.max_instances);
  console.log('max_contacts:', org.max_contacts);
  console.log('max_messages_per_day:', org.max_messages_per_day);
  console.log('subscription_status:', org.subscription_status);

  console.log('\n=== PLAN DEFINED LIMITS ===');
  console.log('plan.name:', org.subscription_plan?.name);
  console.log('plan.max_instances:', org.subscription_plan?.max_instances);
  console.log('plan.max_contacts:', org.subscription_plan?.max_contacts);
  console.log('plan.max_messages_per_day:', org.subscription_plan?.max_messages_per_day);

  console.log('\n=== SYNC STATUS ===');
  const maxInst = org.max_instances === org.subscription_plan?.max_instances;
  const maxCont = org.max_contacts === org.subscription_plan?.max_contacts;
  const maxMsg = org.max_messages_per_day === org.subscription_plan?.max_messages_per_day;
  console.log('max_instances synced?', maxInst ? '✅' : `❌ (org=${org.max_instances} plan=${org.subscription_plan?.max_instances})`);
  console.log('max_contacts synced?', maxCont ? '✅' : `❌ (org=${org.max_contacts} plan=${org.subscription_plan?.max_contacts})`);
  console.log('max_messages_per_day synced?', maxMsg ? '✅' : `❌ (org=${org.max_messages_per_day} plan=${org.subscription_plan?.max_messages_per_day})`);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
