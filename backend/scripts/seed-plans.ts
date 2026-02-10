import prisma from '../src/config/database';

async function main() {
  // Create 4 subscription plans
  const plans = await Promise.all([
    prisma.subscriptionPlan.create({
      data: {
        name: 'Free',
        slug: 'free',
        description: 'Untuk testing dan personal use. Fitur terbatas.',
        price: 0,
        currency: 'IDR',
        billing_period: 'MONTHLY',
        max_instances: 1,
        max_contacts: 100,
        max_messages_per_day: 20,
        trial_days: 0,
        features: ['1 WhatsApp Instance', '100 Contacts', '20 Messages/day', 'Basic Webhook'],
        allow_history_sync: false,
        max_sync_messages: 0,
        is_active: true,
        is_public: true,
      },
    }),
    prisma.subscriptionPlan.create({
      data: {
        name: 'Starter',
        slug: 'starter',
        description: 'Untuk UMKM dan bisnis kecil.',
        price: 99000,
        currency: 'IDR',
        billing_period: 'MONTHLY',
        max_instances: 2,
        max_contacts: 1000,
        max_messages_per_day: 100,
        trial_days: 7,
        features: ['2 WhatsApp Instances', '1,000 Contacts', '100 Messages/day', 'Webhook + Auto-Reply', 'API Access', 'Email Support'],
        allow_history_sync: true,
        max_sync_messages: 5000,
        is_active: true,
        is_public: true,
      },
    }),
    prisma.subscriptionPlan.create({
      data: {
        name: 'Pro',
        slug: 'pro',
        description: 'Untuk bisnis menengah dengan kebutuhan tinggi.',
        price: 299000,
        currency: 'IDR',
        billing_period: 'MONTHLY',
        max_instances: 5,
        max_contacts: 10000,
        max_messages_per_day: 500,
        trial_days: 14,
        features: ['5 WhatsApp Instances', '10,000 Contacts', '500 Messages/day', 'Webhook + Auto-Reply', 'Full API Access', 'Broadcast', 'Priority Support', 'CRM Integration'],
        allow_history_sync: true,
        max_sync_messages: 50000,
        is_active: true,
        is_public: true,
      },
    }),
    prisma.subscriptionPlan.create({
      data: {
        name: 'Enterprise',
        slug: 'enterprise',
        description: 'Untuk perusahaan besar dengan kebutuhan custom.',
        price: 999000,
        currency: 'IDR',
        billing_period: 'MONTHLY',
        max_instances: 20,
        max_contacts: 100000,
        max_messages_per_day: 2000,
        trial_days: 14,
        features: ['20 WhatsApp Instances', '100,000 Contacts', '2,000 Messages/day', 'Webhook + Auto-Reply', 'Full API Access', 'Broadcast', 'Dedicated Support', 'CRM Integration', 'Custom Webhook Headers', 'SLA 99.9%'],
        allow_history_sync: true,
        max_sync_messages: 0, // 0 = unlimited
        is_active: true,
        is_public: true,
      },
    }),
  ]);

  console.log('\n=== PLANS CREATED ===');
  plans.forEach(p => console.log(`  ${p.name} (${p.slug}) - IDR ${p.price}/bulan | max_instances: ${p.max_instances} | max_msg/day: ${p.max_messages_per_day}`));

  // Find Pro plan
  const proPlan = plans.find(p => p.slug === 'pro')!;

  // Update adisyahadi01 org to Pro plan + ACTIVE
  const user = await prisma.user.findFirst({
    where: { email: 'adisyahadi01@gmail.com' },
    select: { organization_id: true, full_name: true },
  });

  if (user) {
    const org = await prisma.organization.update({
      where: { id: user.organization_id },
      data: {
        subscription_plan_id: proPlan.id,
        subscription_status: 'ACTIVE',
      },
      select: {
        name: true,
        subscription_status: true,
        subscription_plan: { select: { name: true, price: true } },
      },
    });
    console.log(`\n=== USER UPGRADED ===`);
    console.log(`  User: ${user.full_name}`);
    console.log(`  Org: ${org.name}`);
    console.log(`  Plan: ${org.subscription_plan?.name}`);
    console.log(`  Status: ${org.subscription_status}`);
  } else {
    console.log('User adisyahadi01@gmail.com not found');
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
