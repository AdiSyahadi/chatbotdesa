import prisma from '../src/config/database';
import { hashPassword } from '../src/utils/crypto';
import { UserRole } from '@prisma/client';

/**
 * Create new user account with Enterprise plan
 * Usage: tsx scripts/create-user-enterprise.ts
 */
async function main() {
  const EMAIL = 'adi.rahadi024@gmail.com';
  const PASSWORD = 'AdiRahadi2024!'; // Strong password with uppercase, lowercase, number
  const FULL_NAME = 'Adi Rahadi';
  const ORG_NAME = 'Adi Rahadi Organization';
  const PHONE = ''; // Optional

  console.log('\n=== Creating User with Enterprise Plan ===\n');

  // Step 1: Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: EMAIL },
  });

  if (existingUser) {
    console.error(`❌ User with email ${EMAIL} already exists!`);
    process.exit(1);
  }

  // Step 2: Find Enterprise plan
  const enterprisePlan = await prisma.subscriptionPlan.findFirst({
    where: { slug: 'enterprise' },
  });

  if (!enterprisePlan) {
    console.error('❌ Enterprise plan not found in database!');
    console.log('   Run: npm run seed:plans first');
    process.exit(1);
  }

  // Step 3: Generate organization slug
  const slug = ORG_NAME.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // Check if slug exists
  const existingOrg = await prisma.organization.findUnique({
    where: { slug },
  });

  if (existingOrg) {
    console.error(`❌ Organization slug "${slug}" already taken!`);
    process.exit(1);
  }

  // Step 4: Hash password
  const passwordHash = await hashPassword(PASSWORD);

  // Step 5: Create organization and user in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create organization with Enterprise plan (ACTIVE)
    const organization = await tx.organization.create({
      data: {
        name: ORG_NAME,
        slug,
        email: EMAIL,
        subscription_plan_id: enterprisePlan.id,
        subscription_status: 'ACTIVE',
        trial_ends_at: null, // No trial for direct Enterprise
      },
    });

    // Create user (owner)
    const user = await tx.user.create({
      data: {
        organization_id: organization.id,
        email: EMAIL,
        password_hash: passwordHash,
        full_name: FULL_NAME,
        phone: PHONE || null,
        role: UserRole.ORG_OWNER,
        is_active: true,
      },
    });

    return { organization, user };
  });

  // Step 6: Display result
  console.log('✅ User account created successfully!\n');
  console.log('=== Account Details ===');
  console.log(`Email: ${result.user.email}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`Full Name: ${result.user.full_name}`);
  console.log(`Role: ${result.user.role}`);
  console.log(`\n=== Organization Details ===`);
  console.log(`Name: ${result.organization.name}`);
  console.log(`Slug: ${result.organization.slug}`);
  console.log(`Plan: ${enterprisePlan.name}`);
  console.log(`Status: ${result.organization.subscription_status}`);
  console.log(`\n=== Plan Features ===`);
  console.log(`Max Instances: ${enterprisePlan.max_instances}`);
  console.log(`Max Contacts: ${enterprisePlan.max_contacts}`);
  console.log(`Max Messages/day: ${enterprisePlan.max_messages_per_day}`);
  console.log(`Price: IDR ${enterprisePlan.price}/bulan`);
  console.log(`History Sync: ${enterprisePlan.allow_history_sync ? 'Enabled' : 'Disabled'}`);
  console.log(`Max Sync Messages: ${enterprisePlan.max_sync_messages === 0 ? 'Unlimited' : enterprisePlan.max_sync_messages}`);
  console.log('\n✅ Account is ready to use!');

  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ Error creating user:', error.message);
  console.error(error);
  process.exit(1);
});
