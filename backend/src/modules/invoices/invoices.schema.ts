/**
 * Invoices Module - Validation Schemas
 * @module invoices/schemas
 */

import { z } from 'zod';

// ============================================
// ENUMS & CONSTANTS
// ============================================

export const INVOICE_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELED'] as const;
export type InvoiceStatusValue = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = [
  'MANUAL_TRANSFER',
  'MIDTRANS_BANK_TRANSFER',
  'MIDTRANS_CREDIT_CARD',
  'MIDTRANS_GOPAY',
  'MIDTRANS_OVO',
  'MIDTRANS_QRIS',
] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodValue, string> = {
  MANUAL_TRANSFER: 'Bank Transfer (Manual)',
  MIDTRANS_BANK_TRANSFER: 'Bank Transfer (Midtrans)',
  MIDTRANS_CREDIT_CARD: 'Credit Card',
  MIDTRANS_GOPAY: 'GoPay',
  MIDTRANS_OVO: 'OVO',
  MIDTRANS_QRIS: 'QRIS',
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatusValue, string> = {
  PENDING: 'Pending Payment',
  PAID: 'Paid',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  CANCELED: 'Canceled',
};

// Default tax rate (PPN Indonesia 11%)
export const DEFAULT_TAX_RATE = 0.11;

// Invoice number prefix
export const INVOICE_PREFIX = 'INV';

// Due date days from creation
export const DEFAULT_DUE_DAYS = 7;

// ============================================
// INVOICE SCHEMAS
// ============================================

/**
 * Create invoice schema
 */
export const createInvoiceSchema = z.object({
  subscription_id: z.string().uuid('Invalid subscription ID').optional(),
  amount: z.number().min(0, 'Amount must be non-negative'),
  currency: z.string().length(3).default('IDR'),
  description: z.string().max(500).optional(),
  include_tax: z.boolean().default(true),
  due_days: z.number().int().min(1).max(30).default(DEFAULT_DUE_DAYS),
  payment_method: z.enum(PAYMENT_METHODS).default('MANUAL_TRANSFER'),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

/**
 * Update invoice schema
 */
export const updateInvoiceSchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  payment_notes: z.string().max(1000).optional().nullable(),
  due_date: z.string().datetime().optional(),
});

export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

/**
 * Submit payment proof schema
 */
export const submitPaymentProofSchema = z.object({
  payment_proof_url: z.string().url('Invalid URL').max(2048),
  payment_notes: z.string().max(1000).optional(),
});

export type SubmitPaymentProofInput = z.infer<typeof submitPaymentProofSchema>;

/**
 * Verify payment schema (admin)
 */
export const verifyPaymentSchema = z.object({
  status: z.enum(['PAID', 'FAILED']),
  payment_notes: z.string().max(1000).optional(),
});

export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

/**
 * List invoices query schema
 */
export const listInvoicesQuerySchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  payment_method: z.enum(PAYMENT_METHODS).optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sort_by: z.enum(['created_at', 'due_date', 'amount', 'status']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

/**
 * Admin list invoices query (all organizations)
 */
export const adminListInvoicesQuerySchema = listInvoicesQuerySchema.extend({
  organization_id: z.string().uuid().optional(),
});

export type AdminListInvoicesQuery = z.infer<typeof adminListInvoicesQuerySchema>;

// ============================================
// RESPONSE TYPES
// ============================================

export interface InvoiceResponse {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  invoice_number: string;
  amount: number;
  currency: string;
  tax_amount: number;
  total_amount: number;
  status: InvoiceStatusValue;
  payment_method: PaymentMethodValue;
  paid_at: Date | null;
  payment_proof_url: string | null;
  payment_notes: string | null;
  midtrans_order_id: string | null;
  midtrans_transaction_id: string | null;
  midtrans_payment_type: string | null;
  due_date: Date;
  created_at: Date;
  updated_at: Date;
  organization?: {
    id: string;
    name: string;
    email: string | null;
  };
  subscription?: {
    id: string;
    plan_id: string;
    plan?: {
      id: string;
      name: string;
    };
  };
}

export interface InvoiceListResponse {
  invoices: InvoiceResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface InvoiceStats {
  total_invoices: number;
  pending_count: number;
  paid_count: number;
  failed_count: number;
  total_revenue: number;
  pending_amount: number;
  currency: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate invoice number
 * Format: INV-YYYYMMDD-XXXXX (e.g., INV-20240115-00001)
 */
export function generateInvoiceNumber(sequence: number): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const seq = String(sequence).padStart(5, '0');
  
  return `${INVOICE_PREFIX}-${year}${month}${day}-${seq}`;
}

/**
 * Calculate invoice amounts
 */
export function calculateInvoiceAmounts(
  baseAmount: number,
  includeTax: boolean = true,
  taxRate: number = DEFAULT_TAX_RATE
): {
  amount: number;
  tax_amount: number;
  total_amount: number;
} {
  const amount = Math.round(baseAmount);
  const tax_amount = includeTax ? Math.round(amount * taxRate) : 0;
  const total_amount = amount + tax_amount;

  return { amount, tax_amount, total_amount };
}

/**
 * Calculate due date
 */
export function calculateDueDate(dueDays: number = DEFAULT_DUE_DAYS): Date {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueDays);
  dueDate.setHours(23, 59, 59, 999);
  return dueDate;
}

/**
 * Check if invoice is overdue
 */
export function isOverdue(dueDate: Date, status: InvoiceStatusValue): boolean {
  if (status !== 'PENDING') return false;
  return new Date() > new Date(dueDate);
}

/**
 * Format invoice amount for display
 */
export function formatInvoiceAmount(amount: number, currency: string): string {
  const formatter = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return formatter.format(amount);
}

/**
 * Get days until due
 */
export function getDaysUntilDue(dueDate: Date): number {
  const now = new Date();
  const due = new Date(dueDate);
  const diffTime = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}
