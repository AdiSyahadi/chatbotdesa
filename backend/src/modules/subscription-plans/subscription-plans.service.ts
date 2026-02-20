/**
 * Subscription Plans Module - Service Layer
 * @module subscription-plans/service
 */

import prisma from '../../config/database';
import { Prisma, BillingPeriod, SubscriptionStatus, PrismaClient } from '@prisma/client';
import { AppError } from '../../types';
import {
  CreatePlanInput,
  UpdatePlanInput,
  ListPlansQuery,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  ChangePlanInput,
  PlanResponse,
  SubscriptionResponse,
  SubscriptionUsage,
  SubscriptionStatusValue,
  calculatePeriodEnd,
  calculateProratedAmount,
  BillingPeriodValue,
} from './subscription-plans.schema';

// Transaction client type
type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

// ============================================
// PLAN MANAGEMENT
// ============================================

/**
 * Create a new subscription plan
 */
export async function createPlan(data: CreatePlanInput): Promise<PlanResponse> {
  // Check if slug already exists
  const existingPlan = await prisma.subscriptionPlan.findUnique({
    where: { slug: data.slug },
  });

  if (existingPlan) {
    throw new AppError('Plan with this slug already exists', 409, 'PLAN_002');
  }

  const plan = await prisma.subscriptionPlan.create({
    data: {
      name: data.name,
      slug: data.slug,
      description: data.description || null,
      price: data.price,
      currency: data.currency,
      billing_period: data.billing_period as BillingPeriod,
      max_instances: data.max_instances,
      max_contacts: data.max_contacts,
      max_messages_per_day: data.max_messages_per_day,
      features: data.features,
      allow_history_sync: data.allow_history_sync,
      max_sync_messages: data.max_sync_messages,
      trial_days: data.trial_days,
      is_active: data.is_active,
      is_public: data.is_public,
    },
  });

  return transformPlanResponse(plan);
}

/**
 * Get all subscription plans
 */
export async function listPlans(query: ListPlansQuery): Promise<PlanResponse[]> {
  const where: Prisma.SubscriptionPlanWhereInput = {};

  if (query.is_active !== undefined) {
    where.is_active = query.is_active;
  }

  if (query.is_public !== undefined) {
    where.is_public = query.is_public;
  }

  if (query.billing_period) {
    where.billing_period = query.billing_period as BillingPeriod;
  }

  const orderBy: Prisma.SubscriptionPlanOrderByWithRelationInput = {
    [query.sort_by]: query.sort_order,
  };

  const plans = await prisma.subscriptionPlan.findMany({
    where,
    orderBy,
  });

  return plans.map(transformPlanResponse);
}

/**
 * Get public subscription plans (for pricing page)
 */
export async function listPublicPlans(): Promise<PlanResponse[]> {
  const plans = await prisma.subscriptionPlan.findMany({
    where: {
      is_active: true,
      is_public: true,
    },
    orderBy: {
      price: 'asc',
    },
  });

  return plans.map(transformPlanResponse);
}

/**
 * Get a subscription plan by ID
 */
export async function getPlanById(planId: string): Promise<PlanResponse | null> {
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
  });

  if (!plan) {
    return null;
  }

  return transformPlanResponse(plan);
}

/**
 * Get a subscription plan by slug
 */
export async function getPlanBySlug(slug: string): Promise<PlanResponse | null> {
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { slug },
  });

  if (!plan) {
    return null;
  }

  return transformPlanResponse(plan);
}

/**
 * Update a subscription plan
 */
export async function updatePlan(planId: string, data: UpdatePlanInput): Promise<PlanResponse> {
  // Check if plan exists
  const existingPlan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
  });

  if (!existingPlan) {
    throw new AppError('Plan not found', 404, 'PLAN_001');
  }

  // If updating slug, check for duplicates
  if (data.slug && data.slug !== existingPlan.slug) {
    const duplicateSlug = await prisma.subscriptionPlan.findUnique({
      where: { slug: data.slug },
    });

    if (duplicateSlug) {
      throw new AppError('Plan with this slug already exists', 409, 'PLAN_002');
    }
  }

  const updateData: Prisma.SubscriptionPlanUpdateInput = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.slug !== undefined) updateData.slug = data.slug;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.price !== undefined) updateData.price = data.price;
  if (data.currency !== undefined) updateData.currency = data.currency;
  if (data.billing_period !== undefined) updateData.billing_period = data.billing_period as BillingPeriod;
  if (data.max_instances !== undefined) updateData.max_instances = data.max_instances;
  if (data.max_contacts !== undefined) updateData.max_contacts = data.max_contacts;
  if (data.max_messages_per_day !== undefined) updateData.max_messages_per_day = data.max_messages_per_day;
  if (data.features !== undefined) updateData.features = data.features;
  if (data.allow_history_sync !== undefined) updateData.allow_history_sync = data.allow_history_sync;
  if (data.max_sync_messages !== undefined) updateData.max_sync_messages = data.max_sync_messages;
  if (data.trial_days !== undefined) updateData.trial_days = data.trial_days;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;
  if (data.is_public !== undefined) updateData.is_public = data.is_public;

  const plan = await prisma.subscriptionPlan.update({
    where: { id: planId },
    data: updateData,
  });

  return transformPlanResponse(plan);
}

/**
 * Delete a subscription plan
 */
export async function deletePlan(planId: string): Promise<void> {
  // Check if plan exists
  const existingPlan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
    include: {
      subscriptions: {
        where: {
          status: {
            in: ['ACTIVE', 'TRIAL'],
          },
        },
      },
    },
  });

  if (!existingPlan) {
    throw new AppError('Plan not found', 404, 'PLAN_001');
  }

  // Prevent deletion if there are active subscriptions
  if (existingPlan.subscriptions.length > 0) {
    throw new AppError(
      `Cannot delete plan with ${existingPlan.subscriptions.length} active subscription(s). Deactivate the plan instead.`,
      400,
      'PLAN_003'
    );
  }

  await prisma.subscriptionPlan.delete({
    where: { id: planId },
  });
}

/**
 * Get plan statistics
 */
export async function getPlanStats(): Promise<{
  total_plans: number;
  active_plans: number;
  public_plans: number;
  total_subscriptions: number;
  subscriptions_by_plan: { plan_id: string; plan_name: string; count: number }[];
}> {
  const [
    totalPlans,
    activePlans,
    publicPlans,
    totalSubscriptions,
    subscriptionsByPlan,
  ] = await Promise.all([
    prisma.subscriptionPlan.count(),
    prisma.subscriptionPlan.count({ where: { is_active: true } }),
    prisma.subscriptionPlan.count({ where: { is_public: true } }),
    prisma.subscription.count({ where: { status: { in: ['ACTIVE', 'TRIAL'] } } }),
    prisma.subscriptionPlan.findMany({
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            subscriptions: {
              where: { status: { in: ['ACTIVE', 'TRIAL'] } },
            },
          },
        },
      },
    }),
  ]);

  return {
    total_plans: totalPlans,
    active_plans: activePlans,
    public_plans: publicPlans,
    total_subscriptions: totalSubscriptions,
    subscriptions_by_plan: subscriptionsByPlan.map((p: { id: string; name: string; _count: { subscriptions: number } }) => ({
      plan_id: p.id,
      plan_name: p.name,
      count: p._count.subscriptions,
    })),
  };
}

// ============================================
// SUBSCRIPTION MANAGEMENT
// ============================================

/**
 * Create a subscription for an organization
 */
export async function createSubscription(
  organizationId: string,
  data: CreateSubscriptionInput
): Promise<SubscriptionResponse> {
  // Check if organization exists
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (!organization) {
    throw new AppError('Organization not found', 404, 'PLAN_001');
  }

  // Check if plan exists and is active
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: data.plan_id },
  });

  if (!plan) {
    throw new AppError('Plan not found', 404, 'PLAN_001');
  }

  if (!plan.is_active) {
    throw new AppError('Plan is not active', 400, 'PLAN_003');
  }

  // Check if organization already has an active subscription
  const existingSubscription = await prisma.subscription.findFirst({
    where: {
      organization_id: organizationId,
      status: { in: ['ACTIVE', 'TRIAL'] },
    },
  });

  if (existingSubscription) {
    throw new AppError('Organization already has an active subscription. Use change plan instead.', 409, 'PLAN_002');
  }

  const billingPeriod = (data.billing_period || plan.billing_period) as BillingPeriod;
  const periodStart = new Date();
  const periodEnd = calculatePeriodEnd(periodStart, billingPeriod as BillingPeriodValue);

  // Determine if this is a trial or active subscription
  const isTrial = plan.trial_days > 0;
  const trialEndsAt = isTrial
    ? new Date(periodStart.getTime() + plan.trial_days * 24 * 60 * 60 * 1000)
    : null;

  // Create subscription using transaction
  const subscription = await prisma.$transaction(async (tx: TransactionClient) => {
    const sub = await tx.subscription.create({
      data: {
        organization_id: organizationId,
        plan_id: data.plan_id,
        status: isTrial ? 'TRIAL' : 'ACTIVE',
        current_period_start: periodStart,
        current_period_end: isTrial ? trialEndsAt! : periodEnd,
        price: plan.price,
        currency: plan.currency,
        billing_period: billingPeriod,
      },
      include: {
        plan: true,
      },
    });

    // Update organization with plan limits and status
    await tx.organization.update({
      where: { id: organizationId },
      data: {
        subscription_plan_id: plan.id,
        subscription_status: isTrial ? 'TRIAL' : 'ACTIVE',
        trial_ends_at: trialEndsAt,
        max_instances: plan.max_instances,
        max_contacts: plan.max_contacts,
        max_messages_per_day: plan.max_messages_per_day,
      },
    });

    return sub;
  });

  return transformSubscriptionResponse(subscription);
}

/**
 * Get organization's current subscription
 */
export async function getSubscription(organizationId: string): Promise<SubscriptionResponse | null> {
  const subscription = await prisma.subscription.findFirst({
    where: {
      organization_id: organizationId,
      status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] },
    },
    include: {
      plan: true,
    },
    orderBy: {
      created_at: 'desc',
    },
  });

  if (!subscription) {
    return null;
  }

  return transformSubscriptionResponse(subscription);
}

/**
 * Get organization's subscription history
 */
export async function getSubscriptionHistory(organizationId: string): Promise<SubscriptionResponse[]> {
  const subscriptions = await prisma.subscription.findMany({
    where: { organization_id: organizationId },
    include: {
      plan: true,
    },
    orderBy: {
      created_at: 'desc',
    },
  });

  return subscriptions.map(transformSubscriptionResponse);
}

/**
 * Update subscription
 */
export async function updateSubscription(
  subscriptionId: string,
  organizationId: string,
  data: UpdateSubscriptionInput
): Promise<SubscriptionResponse> {
  const subscription = await prisma.subscription.findFirst({
    where: {
      id: subscriptionId,
      organization_id: organizationId,
    },
    include: {
      plan: true,
    },
  });

  if (!subscription) {
    throw new AppError('Subscription not found', 404, 'PLAN_001');
  }

  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      cancel_at_period_end: data.cancel_at_period_end,
      canceled_at: data.cancel_at_period_end ? new Date() : null,
    },
    include: {
      plan: true,
    },
  });

  return transformSubscriptionResponse(updated);
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(
  subscriptionId: string,
  organizationId: string,
  immediate: boolean = false
): Promise<SubscriptionResponse> {
  const subscription = await prisma.subscription.findFirst({
    where: {
      id: subscriptionId,
      organization_id: organizationId,
      status: { in: ['ACTIVE', 'TRIAL'] },
    },
  });

  if (!subscription) {
    throw new AppError('Active subscription not found', 404, 'PLAN_001');
  }

  if (immediate) {
    // Immediately cancel
    const updated = await prisma.$transaction(async (tx: TransactionClient) => {
      const sub = await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: 'CANCELED',
          canceled_at: new Date(),
        },
        include: {
          plan: true,
        },
      });

      // Update organization status
      await tx.organization.update({
        where: { id: organizationId },
        data: {
          subscription_status: 'CANCELED',
        },
      });

      return sub;
    });

    return transformSubscriptionResponse(updated);
  } else {
    // Cancel at period end
    const updated = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        cancel_at_period_end: true,
        canceled_at: new Date(),
      },
      include: {
        plan: true,
      },
    });

    return transformSubscriptionResponse(updated);
  }
}

/**
 * Change subscription plan
 */
export async function changePlan(
  organizationId: string,
  data: ChangePlanInput
): Promise<{
  subscription: SubscriptionResponse;
  proration: {
    amount: number;
    days_remaining: number;
    credit: number;
    charge: number;
  };
}> {
  // Get current subscription
  const currentSubscription = await prisma.subscription.findFirst({
    where: {
      organization_id: organizationId,
      status: { in: ['ACTIVE', 'TRIAL'] },
    },
    include: {
      plan: true,
    },
  });

  if (!currentSubscription) {
    throw new AppError('No active subscription found', 404, 'PLAN_001');
  }

  // Get new plan
  const newPlan = await prisma.subscriptionPlan.findUnique({
    where: { id: data.new_plan_id },
  });

  if (!newPlan) {
    throw new AppError('New plan not found', 404, 'PLAN_001');
  }

  if (!newPlan.is_active) {
    throw new AppError('New plan is not active', 400, 'PLAN_003');
  }

  if (currentSubscription.plan_id === data.new_plan_id) {
    throw new AppError('Already subscribed to this plan', 400, 'PLAN_004');
  }

  // Calculate proration
  const now = new Date();
  const periodEnd = new Date(currentSubscription.current_period_end);
  const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  const billingPeriod = (data.billing_period || newPlan.billing_period) as BillingPeriod;
  const proratedAmount = calculateProratedAmount(
    {
      price: Number(currentSubscription.price),
      billing_period: currentSubscription.billing_period as BillingPeriodValue,
    },
    {
      price: Number(newPlan.price),
      billing_period: billingPeriod as BillingPeriodValue,
    },
    daysRemaining
  );

  // Update subscription
  const updated = await prisma.$transaction(async (tx: TransactionClient) => {
    // Mark old subscription as canceled
    await tx.subscription.update({
      where: { id: currentSubscription.id },
      data: {
        status: 'CANCELED',
        canceled_at: new Date(),
      },
    });

    // Create new subscription
    const newSubscription = await tx.subscription.create({
      data: {
        organization_id: organizationId,
        plan_id: newPlan.id,
        status: 'ACTIVE',
        current_period_start: now,
        current_period_end: calculatePeriodEnd(now, billingPeriod as BillingPeriodValue),
        price: newPlan.price,
        currency: newPlan.currency,
        billing_period: billingPeriod,
      },
      include: {
        plan: true,
      },
    });

    // Update organization
    await tx.organization.update({
      where: { id: organizationId },
      data: {
        subscription_plan_id: newPlan.id,
        subscription_status: 'ACTIVE',
        max_instances: newPlan.max_instances,
        max_contacts: newPlan.max_contacts,
        max_messages_per_day: newPlan.max_messages_per_day,
      },
    });

    return newSubscription;
  });

  return {
    subscription: transformSubscriptionResponse(updated),
    proration: {
      amount: proratedAmount,
      days_remaining: daysRemaining,
      credit: Math.round(
        (Number(currentSubscription.price) / BILLING_PERIOD_DAYS[currentSubscription.billing_period as BillingPeriodValue]) *
          daysRemaining
      ),
      charge: Math.round(
        (Number(newPlan.price) / BILLING_PERIOD_DAYS[billingPeriod as BillingPeriodValue]) * daysRemaining
      ),
    },
  };
}

const BILLING_PERIOD_DAYS: Record<string, number> = {
  MONTHLY: 30,
  QUARTERLY: 90,
  YEARLY: 365,
};

/**
 * Get subscription usage
 */
export async function getSubscriptionUsage(organizationId: string): Promise<SubscriptionUsage> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      whatsapp_instances: {
        where: { deleted_at: null },
      },
    },
  });

  if (!organization) {
    throw new AppError('Organization not found', 404, 'PLAN_001');
  }

  // Get contact count
  const contactCount = await prisma.contact.count({
    where: {
      instance: {
        organization_id: organizationId,
      },
    },
  });

  // Get today's message count
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const messageCount = await prisma.message.count({
    where: {
      instance: {
        organization_id: organizationId,
      },
      direction: 'OUTGOING',
      created_at: {
        gte: todayStart,
      },
    },
  });

  return {
    instances: {
      used: organization.whatsapp_instances.length,
      max: organization.max_instances,
      remaining: Math.max(0, organization.max_instances - organization.whatsapp_instances.length),
    },
    contacts: {
      used: contactCount,
      max: organization.max_contacts,
      remaining: Math.max(0, organization.max_contacts - contactCount),
    },
    messages_today: {
      used: messageCount,
      max: organization.max_messages_per_day,
      remaining: Math.max(0, organization.max_messages_per_day - messageCount),
    },
  };
}

/**
 * Renew subscription (internal - called by scheduler)
 */
export async function renewSubscription(subscriptionId: string): Promise<SubscriptionResponse> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      plan: true,
    },
  });

  if (!subscription) {
    throw new AppError('Subscription not found', 404, 'PLAN_001');
  }

  if (subscription.cancel_at_period_end) {
    throw new AppError('Subscription is set to cancel at period end', 400, 'PLAN_003');
  }

  const newPeriodStart = subscription.current_period_end;
  const newPeriodEnd = calculatePeriodEnd(newPeriodStart, subscription.billing_period as BillingPeriodValue);

  const updated = await prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      current_period_start: newPeriodStart,
      current_period_end: newPeriodEnd,
      status: 'ACTIVE',
    },
    include: {
      plan: true,
    },
  });

  return transformSubscriptionResponse(updated);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Transform plan to response format
 */
function transformPlanResponse(plan: any): PlanResponse {
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    description: plan.description,
    price: Number(plan.price),
    currency: plan.currency,
    billing_period: plan.billing_period as BillingPeriodValue,
    max_instances: plan.max_instances,
    max_contacts: plan.max_contacts,
    max_messages_per_day: plan.max_messages_per_day,
    features: (plan.features as string[]) || [],
    trial_days: plan.trial_days,
    is_active: plan.is_active,
    is_public: plan.is_public,
    created_at: plan.created_at,
    updated_at: plan.updated_at,
  };
}

/**
 * Transform subscription to response format
 */
function transformSubscriptionResponse(subscription: any): SubscriptionResponse {
  const response: SubscriptionResponse = {
    id: subscription.id,
    organization_id: subscription.organization_id,
    plan_id: subscription.plan_id,
    status: subscription.status as SubscriptionStatusValue,
    current_period_start: subscription.current_period_start,
    current_period_end: subscription.current_period_end,
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: subscription.canceled_at,
    price: Number(subscription.price),
    currency: subscription.currency,
    billing_period: subscription.billing_period as BillingPeriodValue,
    created_at: subscription.created_at,
    updated_at: subscription.updated_at,
  };

  if (subscription.plan) {
    response.plan = transformPlanResponse(subscription.plan);
  }

  return response;
}
