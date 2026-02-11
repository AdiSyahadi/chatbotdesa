import prisma from '../src/config/database';

async function main() {
  const enterprise = await prisma.subscriptionPlan.findFirst({ where: { slug: 'enterprise' } });
  if (!enterprise) {
    console.log('Enterprise plan not found!');
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email: 'adisyahadi41@gmail.com' },
    select: { organization_id: true, full_name: true }
  });
  if (!user) {
    console.log('User not found!');
    process.exit(1);
  }

  const org = await prisma.organization.update({
    where: { id: user.organization_id },
    data: {
      subscription_plan_id: enterprise.id,
      subscription_status: 'ACTIVE',
    },
    select: {
      name: true,
      subscription_status: true,
      subscription_plan: {
        select: {
          name: true,
          price: true,
          max_instances: true,
          max_contacts: true,
          max_messages_per_day: true,
        }
      }
    }
  });

  console.log(`User: ${user.full_name}`);
  console.log(`Org: ${org.name}`);
  console.log(`Plan: ${org.subscription_plan?.name}`);
  console.log(`Status: ${org.subscription_status}`);
  console.log(`Max Instances: ${org.subscription_plan?.max_instances}`);
  console.log(`Max Contacts: ${org.subscription_plan?.max_contacts}`);
  console.log(`Max Messages/day: ${org.subscription_plan?.max_messages_per_day}`);
  console.log(`Price: IDR ${org.subscription_plan?.price}/bulan`);
  process.exit(0);
}

main();
