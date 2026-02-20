/**
 * Subscription Plans Module - Validation Schemas
 * @module subscription-plans/schemas
 */

import { z } from 'zod';

// ============================================
// ENUMS & CONSTANTS
// ============================================

export const BILLING_PERIODS = ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
export type BillingPeriodValue = (typeof BILLING_PERIODS)[number];

export const BILLING_PERIOD_DAYS: Record<BillingPeriodValue, number> = {
  MONTHLY: 30,
  QUARTERLY: 90,
  YEARLY: 365,
};

export const BILLING_PERIOD_LABELS: Record<BillingPeriodValue, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly (3 months)',
  YEARLY: 'Yearly (12 months)',
};

// Default plan features
export const DEFAULT_FEATURES = [
  'QR Code Authentication',
  'Send Text Messages',
  'Send Media Messages',
  'Webhook Integration',
  'API Access',
];

// ============================================
// PLAN SCHEMAS
// ============================================

/**
 * Create subscription plan schema
 */
export const createPlanSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must not exceed 100 characters'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(50, 'Slug must not exceed 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  description: z
    .string()
    .max(1000, 'Description must not exceed 1000 characters')
    .optional()
    .nullable(),
  price: z
    .number()
    .min(0, 'Price must be non-negative')
    .max(100000000, 'Price exceeds maximum'),
  currency: z
    .string()
    .length(3, 'Currency must be 3 characters (e.g., IDR, USD)')
    .default('IDR'),
  billing_period: z.enum(BILLING_PERIODS).default('MONTHLY'),
  max_instances: z
    .number()
    .int('Must be integer')
    .min(1, 'Must have at least 1 instance')
    .max(100, 'Max 100 instances')
    .default(1),
  max_contacts: z
    .number()
    .int('Must be integer')
    .min(100, 'Must have at least 100 contacts')
    .max(1000000, 'Max 1M contacts')
    .default(1000),
  max_messages_per_day: z
    .number()
    .int('Must be integer')
    .min(10, 'Must have at least 10 messages')
    .max(1000000, 'Max 1M messages')
    .default(100),
  features: z
    .array(z.string().max(255))
    .max(50, 'Max 50 features')
    .optional()
    .default(DEFAULT_FEATURES),
  allow_history_sync: z.boolean().default(false),
  max_sync_messages: z
    .number()
    .int('Must be integer')
    .min(0, 'Must be non-negative')
    .max(100000, 'Max 100k messages')
    .default(1000),
  trial_days: z
    .number()
    .int('Must be integer')
    .min(0, 'Trial days must be non-negative')
    .max(90, 'Max 90 trial days')
    .default(7),
  is_active: z.boolean().default(true),
  is_public: z.boolean().default(true),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;

/**
 * Update subscription plan schema
 */
export const updatePlanSchema = createPlanSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
);

export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

/**
 * List plans query schema
 */
export const listPlansQuerySchema = z.object({
  is_active: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  is_public: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  billing_period: z.enum(BILLING_PERIODS).optional(),
  sort_by: z
    .enum(['price', 'name', 'created_at', 'max_instances'])
    .default('price'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
});

export type ListPlansQuery = z.infer<typeof listPlansQuerySchema>;

// ============================================
// SUBSCRIPTION SCHEMAS
// ============================================

export const SUBSCRIPTION_STATUSES = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED'] as const;
export type SubscriptionStatusValue = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * Create subscription schema
 */
export const createSubscriptionSchema = z.object({
  plan_id: z.string().uuid('Invalid plan ID'),
  billing_period: z.enum(BILLING_PERIODS).optional(), // Override plan's default
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

/**
 * Update subscription schema
 */
export const updateSubscriptionSchema = z.object({
  cancel_at_period_end: z.boolean().optional(),
});

export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

/**
 * Change plan schema
 */
export const changePlanSchema = z.object({
  new_plan_id: z.string().uuid('Invalid plan ID'),
  billing_period: z.enum(BILLING_PERIODS).optional(),
});

export type ChangePlanInput = z.infer<typeof changePlanSchema>;

// ============================================
// RESPONSE TYPES
// ============================================

export interface PlanResponse {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  currency: string;
  billing_period: BillingPeriodValue;
  max_instances: number;
  max_contacts: number;
  max_messages_per_day: number;
  features: string[];
  trial_days: number;
  is_active: boolean;
  is_public: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SubscriptionResponse {
  id: string;
  organization_id: string;
  plan_id: string;
  status: SubscriptionStatusValue;
  current_period_start: Date;
  current_period_end: Date;
  cancel_at_period_end: boolean;
  canceled_at: Date | null;
  price: number;
  currency: string;
  billing_period: BillingPeriodValue;
  created_at: Date;
  updated_at: Date;
  plan?: PlanResponse;
}

export interface SubscriptionUsage {
  instances: {
    used: number;
    max: number;
    remaining: number;
  };
  contacts: {
    used: number;
    max: number;
    remaining: number;
  };
  messages_today: {
    used: number;
    max: number;
    remaining: number;
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate subscription period end date
 */
export function calculatePeriodEnd(startDate: Date, billingPeriod: BillingPeriodValue): Date {
  const endDate = new Date(startDate);
  const days = BILLING_PERIOD_DAYS[billingPeriod];
  endDate.setDate(endDate.getDate() + days);
  return endDate;
}

/**
 * Calculate prorated amount for plan change
 */
export function calculateProratedAmount(
  currentPlan: { price: number; billing_period: BillingPeriodValue },
  newPlan: { price: number; billing_period: BillingPeriodValue },
  daysRemaining: number
): number {
  const currentDailyRate = Number(currentPlan.price) / BILLING_PERIOD_DAYS[currentPlan.billing_period];
  const newDailyRate = Number(newPlan.price) / BILLING_PERIOD_DAYS[newPlan.billing_period];
  
  const unusedCredit = currentDailyRate * daysRemaining;
  const newCharge = newDailyRate * daysRemaining;
  
  const proratedAmount = newCharge - unusedCredit;
  
  // Return at least 0 (don't give negative charge)
  return Math.max(0, Math.round(proratedAmount));
}

/**
 * Check if subscription is expiring soon (within 7 days)
 */
export function isExpiringSoon(periodEnd: Date): boolean {
  const now = new Date();
  const daysUntilExpiry = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
}

/**
 * Format price for display
 */
export function formatPrice(price: number, currency: string): string {
  const formatter = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return formatter.format(price);
}
