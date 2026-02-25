import prisma from '../src/config/database';

/**
 * Check user details and subscription plan
 * Usage: tsx scripts/check-user.ts
 */
async function main() {
  const EMAIL = 'adi.rahadi024@gmail.com';

  console.log('\n=== Checking User Details ===\n');

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
    console.log(`❌ User with email ${EMAIL} not found!`);
    process.exit(1);
  }

  console.log('=== User Details ===');
  console.log(`Email: ${user.email}`);
  console.log(`Full Name: ${user.full_name}`);
  console.log(`Role: ${user.role}`);
  console.log(`Active: ${user.is_active}`);
  console.log(`Created: ${user.created_at}`);

  console.log('\n=== Organization Details ===');
  console.log(`Name: ${user.organization.name}`);
  console.log(`Slug: ${user.organization.slug}`);
  console.log(`Status: ${user.organization.subscription_status}`);
  console.log(`Trial Ends: ${user.organization.trial_ends_at || 'N/A'}`);

  if (user.organization.subscription_plan) {
    console.log('\n=== Subscription Plan ===');
    console.log(`Plan Name: ${user.organization.subscription_plan.name}`);
    console.log(`Plan Slug: ${user.organization.subscription_plan.slug}`);
    console.log(`Price: IDR ${user.organization.subscription_plan.price}/bulan`);
    console.log(`Max Instances: ${user.organization.subscription_plan.max_instances}`);
    console.log(`Max Contacts: ${user.organization.subscription_plan.max_contacts}`);
    console.log(`Max Messages/day: ${user.organization.subscription_plan.max_messages_per_day}`);
  } else {
    console.log('\n⚠️ No subscription plan assigned!');
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
