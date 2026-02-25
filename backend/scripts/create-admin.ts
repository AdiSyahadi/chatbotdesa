/**
 * create-admin.ts
 *
 * Creates (or resets) the SUPER_ADMIN account.
 * Safe to run multiple times — uses upsert so it won't create duplicates.
 *
 * Usage:
 *   npx tsx scripts/create-admin.ts
 *   npx tsx scripts/create-admin.ts --email custom@admin.com --password MyStr0ng!Pass
 */

import prisma from '../src/config/database';
import bcrypt from 'bcrypt';

// ─── Default credentials (override via CLI args) ──────────────────────────────
const DEFAULTS = {
  email: 'admin@waapi.system',
  password: 'Admin@Saas2026!',
  fullName: 'Super Administrator',
  phone: '+628100000001',
};

// ─── CLI arg parser ───────────────────────────────────────────────────────────
function getArg(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

async function main() {
  const email    = getArg('--email',    DEFAULTS.email);
  const password = getArg('--password', DEFAULTS.password);
  const fullName = getArg('--name',     DEFAULTS.fullName);
  const phone    = getArg('--phone',    DEFAULTS.phone);

  console.log('\n🔐  WhatsApp SaaS — Admin Account Setup');
  console.log('─'.repeat(45));

  // 1. Hash the password
  const passwordHash = await bcrypt.hash(password, 10);

  // 2. Find the most feature-rich plan to attach to the system org
  const plan = await prisma.subscriptionPlan.findFirst({
    orderBy: { max_instances: 'desc' },
    where: { is_active: true },
  });

  if (!plan) {
    console.error('❌  No active subscription plan found.');
    console.error('   Run `npx tsx scripts/seed-plans.ts` first.');
    process.exit(1);
  }

  // 3. Upsert the "System" organization for the super admin
  const orgSlug = 'system-admin';
  let org = await prisma.organization.findFirst({ where: { slug: orgSlug } });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: 'System Administration',
        slug: orgSlug,
        email: email,
        phone: phone,
        subscription_plan_id: plan.id,
        subscription_status: 'ACTIVE',
        max_instances: plan.max_instances,
        max_contacts: plan.max_contacts,
        max_messages_per_day: plan.max_messages_per_day,
        is_active: true,
      },
    });
    console.log(`✔  Organization  : ${org.name} (created)`);
  } else {
    console.log(`✔  Organization  : ${org.name} (already exists)`);
  }

  // 4. Upsert the SUPER_ADMIN user
  const existing = await prisma.user.findFirst({ where: { email } });

  if (existing) {
    // Update credentials + ensure SUPER_ADMIN role
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        full_name: fullName,
        password_hash: passwordHash,
        role: 'SUPER_ADMIN',
        is_active: true,
        is_email_verified: true,
        email_verified_at: new Date(),
        organization_id: org.id,
      },
    });
    console.log(`✔  User          : ${email} (credentials updated)`);
  } else {
    await prisma.user.create({
      data: {
        email,
        full_name: fullName,
        phone,
        password_hash: passwordHash,
        role: 'SUPER_ADMIN',
        organization_id: org.id,
        is_active: true,
        is_email_verified: true,
        email_verified_at: new Date(),
        notify_email: true,
        notify_browser: true,
      },
    });
    console.log(`✔  User          : ${email} (created)`);
  }

  // 5. Print summary
  console.log('\n────────────────────────────────────────────');
  console.log('  ✅  Admin account ready!');
  console.log('────────────────────────────────────────────');
  console.log(`  Login URL  :  /admin/login`);
  console.log(`  Email      :  ${email}`);
  console.log(`  Password   :  ${password}`);
  console.log(`  Role       :  SUPER_ADMIN`);
  console.log('────────────────────────────────────────────');
  console.log('  ⚠️   Change your password after first login!\n');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('\n❌  Error:', err.message ?? err);
  process.exit(1);
});
