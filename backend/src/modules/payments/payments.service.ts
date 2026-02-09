/**
 * Payments Module - Service Layer
 * @module payments/service
 */

import prisma from '../../config/database';
import { Prisma, PaymentMethod, InvoiceStatus, PrismaClient } from '@prisma/client';

// Transaction client type
type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;
import {
  PaymentMethodValue,
  UpdatePaymentMethodConfigInput,
  CreateMidtransTransactionInput,
  MidtransNotification,
  PaymentMethodConfigResponse,
  MidtransTransactionResponse,
  PaymentStatusResponse,
  MidtransConfig,
  generateMidtransOrderId,
  verifyMidtransSignature,
  mapMidtransStatusToInvoiceStatus,
  getMidtransApiUrl,
  formatMidtransAmount,
} from './payments.schema';
import logger from '../../config/logger';

// ============================================
// PAYMENT METHOD CONFIG MANAGEMENT
// ============================================

/**
 * Get all payment method configs
 */
export async function getAllPaymentMethodConfigs(): Promise<PaymentMethodConfigResponse[]> {
  const configs = await prisma.paymentMethodConfig.findMany({
    orderBy: { method: 'asc' },
  });

  return configs.map(transformPaymentMethodConfigResponse);
}

/**
 * Get enabled payment method configs
 */
export async function getEnabledPaymentMethods(): Promise<PaymentMethodConfigResponse[]> {
  const configs = await prisma.paymentMethodConfig.findMany({
    where: { is_enabled: true },
    orderBy: { method: 'asc' },
  });

  return configs.map(transformPaymentMethodConfigResponse);
}

/**
 * Get payment method config by method
 */
export async function getPaymentMethodConfig(
  method: PaymentMethodValue
): Promise<PaymentMethodConfigResponse | null> {
  const config = await prisma.paymentMethodConfig.findUnique({
    where: { method: method as PaymentMethod },
  });

  if (!config) {
    return null;
  }

  return transformPaymentMethodConfigResponse(config);
}

/**
 * Update payment method config
 */
export async function updatePaymentMethodConfig(
  method: PaymentMethodValue,
  data: UpdatePaymentMethodConfigInput
): Promise<PaymentMethodConfigResponse> {
  // Check if config exists, if not create it
  const existing = await prisma.paymentMethodConfig.findUnique({
    where: { method: method as PaymentMethod },
  });

  if (!existing) {
    // Create new config
    const created = await prisma.paymentMethodConfig.create({
      data: {
        method: method as PaymentMethod,
        display_name: data.display_name || method.replace(/_/g, ' '),
        description: data.description || null,
        is_enabled: data.is_enabled ?? false,
        bank_name: data.bank_name || null,
        account_number: data.account_number || null,
        account_holder: data.account_holder || null,
        config_data: data.config_data === null || data.config_data === undefined 
          ? Prisma.JsonNull 
          : data.config_data,
      },
    });

    return transformPaymentMethodConfigResponse(created);
  }

  const updateData: Prisma.PaymentMethodConfigUpdateInput = {};

  if (data.is_enabled !== undefined) updateData.is_enabled = data.is_enabled;
  if (data.display_name !== undefined) updateData.display_name = data.display_name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.bank_name !== undefined) updateData.bank_name = data.bank_name;
  if (data.account_number !== undefined) updateData.account_number = data.account_number;
  if (data.account_holder !== undefined) updateData.account_holder = data.account_holder;
  if (data.config_data !== undefined) {
    updateData.config_data = data.config_data === null ? Prisma.JsonNull : data.config_data;
  }

  const updated = await prisma.paymentMethodConfig.update({
    where: { method: method as PaymentMethod },
    data: updateData,
  });

  return transformPaymentMethodConfigResponse(updated);
}

/**
 * Initialize default payment method configs
 */
export async function initializePaymentMethodConfigs(): Promise<void> {
  const defaultConfigs: Array<{
    method: PaymentMethod;
    display_name: string;
    description: string;
    is_enabled: boolean;
  }> = [
    {
      method: 'MANUAL_TRANSFER',
      display_name: 'Bank Transfer (Manual)',
      description: 'Manual bank transfer with payment proof verification',
      is_enabled: true,
    },
    {
      method: 'MIDTRANS_BANK_TRANSFER',
      display_name: 'Virtual Account (Midtrans)',
      description: 'Automatic bank transfer via Virtual Account',
      is_enabled: false,
    },
    {
      method: 'MIDTRANS_CREDIT_CARD',
      display_name: 'Credit Card',
      description: 'Pay with Visa, Mastercard, or JCB',
      is_enabled: false,
    },
    {
      method: 'MIDTRANS_GOPAY',
      display_name: 'GoPay',
      description: 'Pay with GoPay e-wallet',
      is_enabled: false,
    },
    {
      method: 'MIDTRANS_OVO',
      display_name: 'OVO',
      description: 'Pay with OVO e-wallet',
      is_enabled: false,
    },
    {
      method: 'MIDTRANS_QRIS',
      display_name: 'QRIS',
      description: 'Scan QR code to pay',
      is_enabled: false,
    },
  ];

  for (const config of defaultConfigs) {
    await prisma.paymentMethodConfig.upsert({
      where: { method: config.method },
      create: config,
      update: {}, // Don't update if exists
    });
  }

  logger.info('Payment method configs initialized');
}

// ============================================
// MANUAL TRANSFER
// ============================================

/**
 * Get manual transfer bank details
 */
export async function getManualTransferDetails(): Promise<{
  bank_name: string;
  account_number: string;
  account_holder: string;
} | null> {
  const config = await prisma.paymentMethodConfig.findUnique({
    where: { method: 'MANUAL_TRANSFER' },
  });

  if (!config || !config.is_enabled) {
    return null;
  }

  if (!config.bank_name || !config.account_number || !config.account_holder) {
    return null;
  }

  return {
    bank_name: config.bank_name,
    account_number: config.account_number,
    account_holder: config.account_holder,
  };
}

// ============================================
// MIDTRANS INTEGRATION
// ============================================

/**
 * Get Midtrans config
 */
export async function getMidtransConfig(): Promise<MidtransConfig | null> {
  // Check any Midtrans payment method for config
  const config = await prisma.paymentMethodConfig.findFirst({
    where: {
      method: {
        in: [
          'MIDTRANS_BANK_TRANSFER',
          'MIDTRANS_CREDIT_CARD',
          'MIDTRANS_GOPAY',
          'MIDTRANS_OVO',
          'MIDTRANS_QRIS',
        ],
      },
      is_enabled: true,
    },
  });

  if (!config || !config.config_data) {
    return null;
  }

  const configData = config.config_data as Record<string, any>;

  if (!configData.server_key || !configData.client_key) {
    return null;
  }

  return {
    server_key: configData.server_key,
    client_key: configData.client_key,
    is_production: configData.is_production || false,
    merchant_id: configData.merchant_id,
    enabled_payment_types: configData.enabled_payment_types || ['bank_transfer', 'gopay', 'qris'],
  };
}

/**
 * Create Midtrans Snap transaction
 */
export async function createMidtransTransaction(
  invoiceId: string,
  organizationId: string,
  data: CreateMidtransTransactionInput
): Promise<MidtransTransactionResponse> {
  // Get invoice
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      organization_id: organizationId,
      status: 'PENDING',
    },
    include: {
      organization: true,
    },
  });

  if (!invoice) {
    throw new Error('Invoice not found or is not pending');
  }

  // Get Midtrans config
  const midtransConfig = await getMidtransConfig();

  if (!midtransConfig) {
    throw new Error('Midtrans is not configured. Please contact administrator.');
  }

  // Generate order ID
  const orderId = generateMidtransOrderId(invoiceId);

  // Prepare transaction data
  const transactionData = {
    transaction_details: {
      order_id: orderId,
      gross_amount: formatMidtransAmount(Number(invoice.total_amount)),
    },
    customer_details: {
      email: invoice.organization.email || undefined,
      first_name: invoice.organization.name,
    },
    item_details: [
      {
        id: invoice.id,
        price: formatMidtransAmount(Number(invoice.total_amount)),
        quantity: 1,
        name: `Invoice ${invoice.invoice_number}`,
      },
    ],
    enabled_payments: [data.payment_type],
  };

  // If bank transfer, add bank option
  if (data.payment_type === 'bank_transfer' && data.bank) {
    (transactionData as any).bank_transfer = {
      bank: data.bank,
    };
  }

  // Call Midtrans API
  const apiUrl = getMidtransApiUrl(midtransConfig.is_production);
  const authString = Buffer.from(`${midtransConfig.server_key}:`).toString('base64');

  try {
    const response = await fetch(`${apiUrl}/v2/charge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Basic ${authString}`,
      },
      body: JSON.stringify(transactionData),
    });

    const result = await response.json();

    if (!response.ok) {
      logger.error('Midtrans API error:', result);
      throw new Error(result.status_message || 'Failed to create Midtrans transaction');
    }

    // Update invoice with Midtrans order ID
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        midtrans_order_id: orderId,
        payment_method: mapPaymentTypeToMethod(data.payment_type),
      },
    });

    return {
      token: result.token || '',
      redirect_url: result.redirect_url || '',
      order_id: orderId,
      payment_type: data.payment_type,
    };
  } catch (error) {
    logger.error('Midtrans transaction error:', error);
    throw error;
  }
}

/**
 * Create Midtrans Snap token (for frontend popup)
 */
export async function createMidtransSnapToken(
  invoiceId: string,
  organizationId: string
): Promise<{ token: string; redirect_url: string }> {
  // Get invoice
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      organization_id: organizationId,
      status: 'PENDING',
    },
    include: {
      organization: true,
    },
  });

  if (!invoice) {
    throw new Error('Invoice not found or is not pending');
  }

  // Get Midtrans config
  const midtransConfig = await getMidtransConfig();

  if (!midtransConfig) {
    throw new Error('Midtrans is not configured. Please contact administrator.');
  }

  // Generate order ID
  const orderId = generateMidtransOrderId(invoiceId);

  // Prepare transaction data
  const transactionData = {
    transaction_details: {
      order_id: orderId,
      gross_amount: formatMidtransAmount(Number(invoice.total_amount)),
    },
    customer_details: {
      email: invoice.organization.email || undefined,
      first_name: invoice.organization.name,
    },
    item_details: [
      {
        id: invoice.id,
        price: formatMidtransAmount(Number(invoice.total_amount)),
        quantity: 1,
        name: `Invoice ${invoice.invoice_number}`,
      },
    ],
    callbacks: {
      finish: `${process.env.FRONTEND_URL || ''}/payment/finish?order_id=${orderId}`,
      error: `${process.env.FRONTEND_URL || ''}/payment/error?order_id=${orderId}`,
      pending: `${process.env.FRONTEND_URL || ''}/payment/pending?order_id=${orderId}`,
    },
  };

  // Call Midtrans Snap API
  const apiUrl = midtransConfig.is_production
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
  
  const authString = Buffer.from(`${midtransConfig.server_key}:`).toString('base64');

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Basic ${authString}`,
      },
      body: JSON.stringify(transactionData),
    });

    const result = await response.json();

    if (!response.ok) {
      logger.error('Midtrans Snap API error:', result);
      throw new Error(result.error_messages?.[0] || 'Failed to create Midtrans Snap token');
    }

    // Update invoice with Midtrans order ID
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        midtrans_order_id: orderId,
      },
    });

    return {
      token: result.token,
      redirect_url: result.redirect_url,
    };
  } catch (error) {
    logger.error('Midtrans Snap token error:', error);
    throw error;
  }
}

/**
 * Handle Midtrans webhook notification
 */
export async function handleMidtransNotification(
  notification: MidtransNotification
): Promise<void> {
  // Get Midtrans config for signature verification
  const midtransConfig = await getMidtransConfig();

  if (!midtransConfig) {
    throw new Error('Midtrans is not configured');
  }

  // Verify signature
  const isValidSignature = verifyMidtransSignature(
    notification.order_id,
    notification.status_code,
    notification.gross_amount,
    midtransConfig.server_key,
    notification.signature_key
  );

  if (!isValidSignature) {
    logger.warn('Invalid Midtrans signature for order:', notification.order_id);
    throw new Error('Invalid signature');
  }

  // Find invoice by Midtrans order ID
  const invoice = await prisma.invoice.findFirst({
    where: { midtrans_order_id: notification.order_id },
    include: { subscription: true },
  });

  if (!invoice) {
    logger.warn('Invoice not found for Midtrans order:', notification.order_id);
    throw new Error('Invoice not found');
  }

  // Map Midtrans status to invoice status
  const newStatus = mapMidtransStatusToInvoiceStatus(notification.transaction_status);

  // Update invoice
  await prisma.$transaction(async (tx: TransactionClient) => {
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: newStatus as InvoiceStatus,
        midtrans_transaction_id: notification.transaction_id,
        midtrans_payment_type: notification.payment_type,
        paid_at: newStatus === 'PAID' ? new Date() : null,
        payment_notes: `Midtrans: ${notification.status_message}`,
      },
    });

    // If payment successful and has subscription, update subscription status
    if (newStatus === 'PAID' && invoice.subscription_id) {
      await tx.subscription.update({
        where: { id: invoice.subscription_id },
        data: { status: 'ACTIVE' },
      });

      await tx.organization.update({
        where: { id: invoice.organization_id },
        data: { subscription_status: 'ACTIVE' },
      });
    }
  });

  logger.info(
    `Midtrans notification processed: Order ${notification.order_id}, Status: ${notification.transaction_status}`
  );
}

/**
 * Get payment status
 */
export async function getPaymentStatus(
  invoiceId: string,
  organizationId?: string
): Promise<PaymentStatusResponse> {
  const where: Prisma.InvoiceWhereInput = { id: invoiceId };
  
  if (organizationId) {
    where.organization_id = organizationId;
  }

  const invoice = await prisma.invoice.findFirst({ where });

  if (!invoice) {
    throw new Error('Invoice not found');
  }

  const response: PaymentStatusResponse = {
    invoice_id: invoice.id,
    status: invoice.status,
    payment_method: invoice.payment_method,
    amount: Number(invoice.total_amount),
    currency: invoice.currency,
    paid_at: invoice.paid_at,
  };

  if (invoice.midtrans_order_id) {
    response.midtrans_details = {
      order_id: invoice.midtrans_order_id,
      transaction_id: invoice.midtrans_transaction_id || '',
      payment_type: invoice.midtrans_payment_type || '',
      transaction_status: invoice.status,
    };
  }

  return response;
}

/**
 * Check Midtrans transaction status
 */
export async function checkMidtransStatus(orderId: string): Promise<any> {
  const midtransConfig = await getMidtransConfig();

  if (!midtransConfig) {
    throw new Error('Midtrans is not configured');
  }

  const apiUrl = getMidtransApiUrl(midtransConfig.is_production);
  const authString = Buffer.from(`${midtransConfig.server_key}:`).toString('base64');

  const response = await fetch(`${apiUrl}/v2/${orderId}/status`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${authString}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.status_message || 'Failed to check Midtrans status');
  }

  return result;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Transform payment method config to response format
 */
function transformPaymentMethodConfigResponse(config: any): PaymentMethodConfigResponse {
  return {
    id: config.id,
    method: config.method as PaymentMethodValue,
    is_enabled: config.is_enabled,
    display_name: config.display_name,
    description: config.description,
    bank_name: config.bank_name,
    account_number: config.account_number,
    account_holder: config.account_holder,
    config_data: config.config_data as Record<string, any> | null,
    created_at: config.created_at,
    updated_at: config.updated_at,
  };
}

/**
 * Map Midtrans payment type to PaymentMethod enum
 */
function mapPaymentTypeToMethod(paymentType: string): PaymentMethod {
  switch (paymentType) {
    case 'bank_transfer':
      return 'MIDTRANS_BANK_TRANSFER';
    case 'credit_card':
      return 'MIDTRANS_CREDIT_CARD';
    case 'gopay':
      return 'MIDTRANS_GOPAY';
    case 'ovo':
      return 'MIDTRANS_OVO';
    case 'qris':
      return 'MIDTRANS_QRIS';
    default:
      return 'MANUAL_TRANSFER';
  }
}
