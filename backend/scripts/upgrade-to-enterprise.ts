import prisma from '../src/config/database';

/**
 * Upgrade user to Enterprise plan
 * Usage: tsx scripts/upgrade-to-enterprise.ts
 */
async function main() {
  const EMAIL = 'adi.rahadi024@gmail.com';

  console.log('\n=== Upgrading User to Enterprise Plan ===\n');

  // Step 1: Find Enterprise plan
  const enterprisePlan = await prisma.subscriptionPlan.findFirst({
    where: { slug: 'enterprise' },
  });

  if (!enterprisePlan) {
    console.error('❌ Enterprise plan not found in database!');
    console.log('   Run: npm run seed:plans first');
    process.exit(1);
  }

  // Step 2: Find user
  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    include: {
      organization: {
        include: {
          subscription_plan: true,
        },
      },
    },
  });

  if (!user) {
    console.error(`❌ User with email ${EMAIL} not found!`);
    process.exit(1);
  }

  console.log(`Found user: ${user.full_name} (${user.email})`);
  console.log(`Current organization: ${user.organization.name}`);
  
  if (user.organization.subscription_plan) {
    console.log(`Current plan: ${user.organization.subscription_plan.name}`);
  } else {
    console.log(`Current plan: None (Trial)`);
  }

  // Step 3: Upgrade organization to Enterprise
  const updatedOrg = await prisma.organization.update({
    where: { id: user.organization_id },
    data: {
      subscription_plan_id: enterprisePlan.id,
      subscription_status: 'ACTIVE',
      trial_ends_at: null,
      // Sync enforced limits from plan — required for runtime enforcement
      max_instances: enterprisePlan.max_instances,
      max_contacts: enterprisePlan.max_contacts,
      max_messages_per_day: enterprisePlan.max_messages_per_day,
    },
    include: {
      subscription_plan: true,
    },
  });

  console.log('\n✅ Successfully upgraded to Enterprise!\n');
  console.log('=== Updated Organization Details ===');
  console.log(`Name: ${updatedOrg.name}`);
  console.log(`Status: ${updatedOrg.subscription_status}`);
  console.log(`Plan: ${updatedOrg.subscription_plan?.name}`);
  console.log(`\n=== Enterprise Plan Features ===`);
  console.log(`Max Instances: ${updatedOrg.subscription_plan?.max_instances}`);
  console.log(`Max Contacts: ${updatedOrg.subscription_plan?.max_contacts}`);
  console.log(`Max Messages/day: ${updatedOrg.subscription_plan?.max_messages_per_day}`);
  console.log(`Price: IDR ${updatedOrg.subscription_plan?.price}/bulan`);
  console.log(`History Sync: ${updatedOrg.subscription_plan?.allow_history_sync ? 'Enabled' : 'Disabled'}`);
  console.log(`Max Sync Messages: ${updatedOrg.subscription_plan?.max_sync_messages === 0 ? 'Unlimited' : updatedOrg.subscription_plan?.max_sync_messages}`);
  console.log('\n✅ Account is now on Enterprise plan!');

  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ Error upgrading user:', error.message);
  console.error(error);
  process.exit(1);
});
