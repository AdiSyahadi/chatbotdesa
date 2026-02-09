/**
 * Payments Module - Validation Schemas
 * @module payments/schemas
 */

import { z } from 'zod';

// ============================================
// ENUMS & CONSTANTS
// ============================================

export const PAYMENT_METHODS = [
  'MANUAL_TRANSFER',
  'MIDTRANS_BANK_TRANSFER',
  'MIDTRANS_CREDIT_CARD',
  'MIDTRANS_GOPAY',
  'MIDTRANS_OVO',
  'MIDTRANS_QRIS',
] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

export const MIDTRANS_PAYMENT_TYPES: Record<PaymentMethodValue, string | null> = {
  MANUAL_TRANSFER: null,
  MIDTRANS_BANK_TRANSFER: 'bank_transfer',
  MIDTRANS_CREDIT_CARD: 'credit_card',
  MIDTRANS_GOPAY: 'gopay',
  MIDTRANS_OVO: 'ovo',
  MIDTRANS_QRIS: 'qris',
};

export const MIDTRANS_TRANSACTION_STATUSES = [
  'capture',
  'settlement',
  'pending',
  'deny',
  'cancel',
  'expire',
  'failure',
  'refund',
  'partial_refund',
  'authorize',
] as const;
export type MidtransTransactionStatus = (typeof MIDTRANS_TRANSACTION_STATUSES)[number];

// Bank options for manual transfer
export const BANK_OPTIONS = [
  { code: 'BCA', name: 'Bank Central Asia' },
  { code: 'BNI', name: 'Bank Negara Indonesia' },
  { code: 'BRI', name: 'Bank Rakyat Indonesia' },
  { code: 'MANDIRI', name: 'Bank Mandiri' },
  { code: 'CIMB', name: 'CIMB Niaga' },
  { code: 'PERMATA', name: 'Permata Bank' },
  { code: 'BSI', name: 'Bank Syariah Indonesia' },
] as const;

// ============================================
// PAYMENT CONFIG SCHEMAS
// ============================================

/**
 * Manual transfer bank account config schema
 */
export const bankAccountConfigSchema = z.object({
  bank_name: z.string().min(1).max(100),
  account_number: z.string().min(1).max(50),
  account_holder: z.string().min(1).max(255),
  is_enabled: z.boolean().default(true),
});

export type BankAccountConfig = z.infer<typeof bankAccountConfigSchema>;

/**
 * Midtrans config schema
 */
export const midtransConfigSchema = z.object({
  server_key: z.string().min(1, 'Server key is required'),
  client_key: z.string().min(1, 'Client key is required'),
  is_production: z.boolean().default(false),
  merchant_id: z.string().optional(),
  enabled_payment_types: z.array(z.string()).default(['bank_transfer', 'gopay', 'qris']),
});

export type MidtransConfig = z.infer<typeof midtransConfigSchema>;

/**
 * Update payment method config schema
 */
export const updatePaymentMethodConfigSchema = z.object({
  is_enabled: z.boolean().optional(),
  display_name: z.string().max(100).optional(),
  description: z.string().max(1000).optional(),
  bank_name: z.string().max(100).optional().nullable(),
  account_number: z.string().max(50).optional().nullable(),
  account_holder: z.string().max(255).optional().nullable(),
  config_data: z.record(z.any()).optional().nullable(),
});

export type UpdatePaymentMethodConfigInput = z.infer<typeof updatePaymentMethodConfigSchema>;

// ============================================
// PAYMENT TRANSACTION SCHEMAS
// ============================================

/**
 * Create Midtrans transaction schema
 */
export const createMidtransTransactionSchema = z.object({
  invoice_id: z.string().uuid('Invalid invoice ID'),
  payment_type: z.enum([
    'bank_transfer',
    'credit_card',
    'gopay',
    'ovo',
    'qris',
  ]),
  bank: z.enum(['bca', 'bni', 'bri', 'mandiri', 'cimb', 'permata']).optional(),
});

export type CreateMidtransTransactionInput = z.infer<typeof createMidtransTransactionSchema>;

/**
 * Midtrans webhook notification schema
 */
export const midtransNotificationSchema = z.object({
  transaction_time: z.string(),
  transaction_status: z.enum(MIDTRANS_TRANSACTION_STATUSES),
  transaction_id: z.string(),
  status_message: z.string(),
  status_code: z.string(),
  signature_key: z.string(),
  payment_type: z.string(),
  order_id: z.string(),
  merchant_id: z.string().optional(),
  gross_amount: z.string(),
  fraud_status: z.string().optional(),
  currency: z.string().optional(),
});

export type MidtransNotification = z.infer<typeof midtransNotificationSchema>;

// ============================================
// RESPONSE TYPES
// ============================================

export interface PaymentMethodConfigResponse {
  id: string;
  method: PaymentMethodValue;
  is_enabled: boolean;
  display_name: string;
  description: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  config_data: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
}

export interface MidtransTransactionResponse {
  token: string;
  redirect_url: string;
  order_id: string;
  payment_type: string;
}

export interface MidtransBankTransferResponse {
  order_id: string;
  payment_type: string;
  bank: string;
  va_number: string; // Virtual Account number
  gross_amount: number;
  expiry_time: string;
}

export interface MidtransQrisResponse {
  order_id: string;
  qr_code_url: string;
  gross_amount: number;
  expiry_time: string;
}

export interface PaymentStatusResponse {
  invoice_id: string;
  status: string;
  payment_method: string;
  amount: number;
  currency: string;
  paid_at: Date | null;
  midtrans_details?: {
    order_id: string;
    transaction_id: string;
    payment_type: string;
    transaction_status: string;
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate Midtrans order ID
 * Format: ORDER-{invoiceId}-{timestamp}
 */
export function generateMidtransOrderId(invoiceId: string): string {
  const timestamp = Date.now();
  return `ORDER-${invoiceId.substring(0, 8)}-${timestamp}`;
}

/**
 * Verify Midtrans signature
 */
export function verifyMidtransSignature(
  orderId: string,
  statusCode: string,
  grossAmount: string,
  serverKey: string,
  signatureKey: string
): boolean {
  const crypto = require('crypto');
  const hash = crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');
  
  return hash === signatureKey;
}

/**
 * Map Midtrans status to invoice status
 */
export function mapMidtransStatusToInvoiceStatus(
  midtransStatus: MidtransTransactionStatus
): 'PENDING' | 'PAID' | 'FAILED' | 'CANCELED' | 'REFUNDED' {
  switch (midtransStatus) {
    case 'capture':
    case 'settlement':
      return 'PAID';
    case 'deny':
    case 'failure':
      return 'FAILED';
    case 'cancel':
    case 'expire':
      return 'CANCELED';
    case 'refund':
    case 'partial_refund':
      return 'REFUNDED';
    case 'pending':
    case 'authorize':
    default:
      return 'PENDING';
  }
}

/**
 * Get Midtrans API base URL
 */
export function getMidtransApiUrl(isProduction: boolean): string {
  return isProduction
    ? 'https://api.midtrans.com'
    : 'https://api.sandbox.midtrans.com';
}

/**
 * Get Midtrans Snap URL
 */
export function getMidtransSnapUrl(isProduction: boolean): string {
  return isProduction
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js';
}

/**
 * Format amount for Midtrans (must be integer, no decimals)
 */
export function formatMidtransAmount(amount: number): number {
  return Math.round(amount);
}
