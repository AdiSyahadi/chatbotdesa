/**
 * Invoices Module - Service Layer
 * @module invoices/service
 */

import prisma from '../../config/database';
import { Prisma, InvoiceStatus, PaymentMethod, PrismaClient } from '@prisma/client';
import { AppError } from '../../types';
import {
  CreateInvoiceInput,
  UpdateInvoiceInput,
  SubmitPaymentProofInput,
  VerifyPaymentInput,
  ListInvoicesQuery,
  AdminListInvoicesQuery,
  InvoiceResponse,
  InvoiceListResponse,
  InvoiceStats,
  InvoiceStatusValue,
  PaymentMethodValue,
  generateInvoiceNumber,
  calculateInvoiceAmounts,
  calculateDueDate,
} from './invoices.schema';

// Transaction client type
type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

// Invoice select type for statistics
interface InvoiceStatItem {
  status: InvoiceStatus;
  total_amount: Prisma.Decimal;
  currency: string;
}

// ============================================
// INVOICE MANAGEMENT
// ============================================

/**
 * Create a new invoice
 */
export async function createInvoice(
  organizationId: string,
  data: CreateInvoiceInput
): Promise<InvoiceResponse> {
  // Calculate amounts
  const amounts = calculateInvoiceAmounts(data.amount, data.include_tax);
  
  // Get invoice sequence for today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayInvoiceCount = await prisma.invoice.count({
    where: {
      created_at: {
        gte: today,
      },
    },
  });

  const invoiceNumber = generateInvoiceNumber(todayInvoiceCount + 1);

  const invoice = await prisma.invoice.create({
    data: {
      organization_id: organizationId,
      subscription_id: data.subscription_id || null,
      invoice_number: invoiceNumber,
      amount: amounts.amount,
      currency: data.currency,
      tax_amount: amounts.tax_amount,
      total_amount: amounts.total_amount,
      status: 'PENDING',
      payment_method: data.payment_method as PaymentMethod,
      due_date: calculateDueDate(data.due_days),
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      subscription: {
        include: {
          plan: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return transformInvoiceResponse(invoice);
}

/**
 * Create subscription invoice (internal - called when subscription is created/renewed)
 */
export async function createSubscriptionInvoice(
  organizationId: string,
  subscriptionId: string,
  amount: number,
  currency: string,
  paymentMethod: PaymentMethodValue = 'MANUAL_TRANSFER'
): Promise<InvoiceResponse> {
  const amounts = calculateInvoiceAmounts(amount, true);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayInvoiceCount = await prisma.invoice.count({
    where: {
      created_at: {
        gte: today,
      },
    },
  });

  const invoiceNumber = generateInvoiceNumber(todayInvoiceCount + 1);

  const invoice = await prisma.invoice.create({
    data: {
      organization_id: organizationId,
      subscription_id: subscriptionId,
      invoice_number: invoiceNumber,
      amount: amounts.amount,
      currency: currency,
      tax_amount: amounts.tax_amount,
      total_amount: amounts.total_amount,
      status: 'PENDING',
      payment_method: paymentMethod as PaymentMethod,
      due_date: calculateDueDate(7),
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      subscription: {
        include: {
          plan: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return transformInvoiceResponse(invoice);
}

/**
 * Get invoice by ID
 */
export async function getInvoiceById(
  invoiceId: string,
  organizationId?: string
): Promise<InvoiceResponse | null> {
  const where: Prisma.InvoiceWhereInput = { id: invoiceId };
  
  if (organizationId) {
    where.organization_id = organizationId;
  }

  const invoice = await prisma.invoice.findFirst({
    where,
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      subscription: {
        include: {
          plan: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!invoice) {
    return null;
  }

  return transformInvoiceResponse(invoice);
}

/**
 * Get invoice by invoice number
 */
export async function getInvoiceByNumber(invoiceNumber: string): Promise<InvoiceResponse | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { invoice_number: invoiceNumber },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      subscription: {
        include: {
          plan: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!invoice) {
    return null;
  }

  return transformInvoiceResponse(invoice);
}

/**
 * List invoices for an organization
 */
export async function listInvoices(
  organizationId: string,
  query: ListInvoicesQuery
): Promise<InvoiceListResponse> {
  const where: Prisma.InvoiceWhereInput = {
    organization_id: organizationId,
  };

  if (query.status) {
    where.status = query.status as InvoiceStatus;
  }

  if (query.payment_method) {
    where.payment_method = query.payment_method as PaymentMethod;
  }

  if (query.from_date || query.to_date) {
    where.created_at = {};
    if (query.from_date) {
      where.created_at.gte = new Date(query.from_date);
    }
    if (query.to_date) {
      where.created_at.lte = new Date(query.to_date);
    }
  }

  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      include: {
        subscription: {
          include: {
            plan: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        [query.sort_by]: query.sort_order,
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return {
    invoices: invoices.map(transformInvoiceResponse),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      total_pages: Math.ceil(total / query.limit),
    },
  };
}

/**
 * Admin: List all invoices
 */
export async function adminListInvoices(query: AdminListInvoicesQuery): Promise<InvoiceListResponse> {
  const where: Prisma.InvoiceWhereInput = {};

  if (query.organization_id) {
    where.organization_id = query.organization_id;
  }

  if (query.status) {
    where.status = query.status as InvoiceStatus;
  }

  if (query.payment_method) {
    where.payment_method = query.payment_method as PaymentMethod;
  }

  if (query.from_date || query.to_date) {
    where.created_at = {};
    if (query.from_date) {
      where.created_at.gte = new Date(query.from_date);
    }
    if (query.to_date) {
      where.created_at.lte = new Date(query.to_date);
    }
  }

  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        subscription: {
          include: {
            plan: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        [query.sort_by]: query.sort_order,
      },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return {
    invoices: invoices.map(transformInvoiceResponse),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      total_pages: Math.ceil(total / query.limit),
    },
  };
}

/**
 * Update invoice
 */
export async function updateInvoice(
  invoiceId: string,
  organizationId: string | null,
  data: UpdateInvoiceInput
): Promise<InvoiceResponse> {
  const where: Prisma.InvoiceWhereInput = { id: invoiceId };
  
  if (organizationId) {
    where.organization_id = organizationId;
  }

  const existingInvoice = await prisma.invoice.findFirst({ where });

  if (!existingInvoice) {
    throw new AppError('Invoice not found', 404, 'INVOICE_001');
  }

  const updateData: Prisma.InvoiceUpdateInput = {};

  if (data.status !== undefined) {
    updateData.status = data.status as InvoiceStatus;
    if (data.status === 'PAID') {
      updateData.paid_at = new Date();
    }
  }

  if (data.payment_notes !== undefined) {
    updateData.payment_notes = data.payment_notes;
  }

  if (data.due_date !== undefined) {
    updateData.due_date = new Date(data.due_date);
  }

  const invoice = await prisma.invoice.update({
    where: { id: invoiceId },
    data: updateData,
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      subscription: {
        include: {
          plan: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return transformInvoiceResponse(invoice);
}

/**
 * Submit payment proof (user)
 */
export async function submitPaymentProof(
  invoiceId: string,
  organizationId: string,
  data: SubmitPaymentProofInput
): Promise<InvoiceResponse> {
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      organization_id: organizationId,
    },
  });

  if (!invoice) {
    throw new AppError('Invoice not found', 404, 'INVOICE_001');
  }

  if (invoice.status !== 'PENDING') {
    throw new AppError('Can only submit payment proof for pending invoices', 400, 'INVOICE_002');
  }

  if (invoice.payment_method !== 'MANUAL_TRANSFER') {
    throw new AppError('Payment proof is only required for manual transfers', 400, 'INVOICE_002');
  }

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      payment_proof_url: data.payment_proof_url,
      payment_notes: data.payment_notes || null,
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      subscription: {
        include: {
          plan: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return transformInvoiceResponse(updated);
}

/**
 * Verify payment (admin)
 */
export async function verifyPayment(
  invoiceId: string,
  data: VerifyPaymentInput
): Promise<InvoiceResponse> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      subscription: true,
    },
  });

  if (!invoice) {
    throw new AppError('Invoice not found', 404, 'INVOICE_001');
  }

  if (invoice.status !== 'PENDING') {
    throw new AppError('Can only verify pending invoices', 400, 'INVOICE_002');
  }

  // Update invoice and potentially subscription status
  const updated = await prisma.$transaction(async (tx: TransactionClient) => {
    const inv = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: data.status as InvoiceStatus,
        payment_notes: data.payment_notes || invoice.payment_notes,
        paid_at: data.status === 'PAID' ? new Date() : null,
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        subscription: {
          include: {
            plan: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // If payment is verified and there's a subscription, update subscription status
    if (data.status === 'PAID' && invoice.subscription_id) {
      await tx.subscription.update({
        where: { id: invoice.subscription_id },
        data: {
          status: 'ACTIVE',
        },
      });

      // Also update organization status
      await tx.organization.update({
        where: { id: invoice.organization_id },
        data: {
          subscription_status: 'ACTIVE',
        },
      });
    }

    return inv;
  });

  return transformInvoiceResponse(updated);
}

/**
 * Cancel invoice
 */
export async function cancelInvoice(
  invoiceId: string,
  organizationId: string | null
): Promise<InvoiceResponse> {
  const where: Prisma.InvoiceWhereInput = { id: invoiceId };
  
  if (organizationId) {
    where.organization_id = organizationId;
  }

  const invoice = await prisma.invoice.findFirst({ where });

  if (!invoice) {
    throw new AppError('Invoice not found', 404, 'INVOICE_001');
  }

  if (invoice.status !== 'PENDING') {
    throw new AppError('Can only cancel pending invoices', 400, 'INVOICE_002');
  }

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: 'CANCELED',
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      subscription: {
        include: {
          plan: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return transformInvoiceResponse(updated);
}

/**
 * Get invoice statistics for organization
 */
export async function getInvoiceStats(organizationId?: string): Promise<InvoiceStats> {
  const where: Prisma.InvoiceWhereInput = {};
  
  if (organizationId) {
    where.organization_id = organizationId;
  }

  const [
    totalInvoices,
    pendingCount,
    paidCount,
    failedCount,
    allInvoices,
  ] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.count({ where: { ...where, status: 'PENDING' } }),
    prisma.invoice.count({ where: { ...where, status: 'PAID' } }),
    prisma.invoice.count({ where: { ...where, status: 'FAILED' } }),
    prisma.invoice.findMany({
      where,
      select: {
        status: true,
        total_amount: true,
        currency: true,
      },
    }),
  ]);

  // Calculate revenue (only paid invoices)
  const totalRevenue = (allInvoices as InvoiceStatItem[])
    .filter((inv: InvoiceStatItem) => inv.status === 'PAID')
    .reduce((sum: number, inv: InvoiceStatItem) => sum + Number(inv.total_amount), 0);

  // Calculate pending amount
  const pendingAmount = (allInvoices as InvoiceStatItem[])
    .filter((inv: InvoiceStatItem) => inv.status === 'PENDING')
    .reduce((sum: number, inv: InvoiceStatItem) => sum + Number(inv.total_amount), 0);

  return {
    total_invoices: totalInvoices,
    pending_count: pendingCount,
    paid_count: paidCount,
    failed_count: failedCount,
    total_revenue: totalRevenue,
    pending_amount: pendingAmount,
    currency: 'IDR', // Default currency
  };
}

/**
 * Get pending invoices that need admin attention (have payment proof)
 */
export async function getPendingVerification(): Promise<InvoiceResponse[]> {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: 'PENDING',
      payment_method: 'MANUAL_TRANSFER',
      payment_proof_url: {
        not: null,
      },
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      subscription: {
        include: {
          plan: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      created_at: 'asc',
    },
  });

  return invoices.map(transformInvoiceResponse);
}

/**
 * Get overdue invoices
 */
export async function getOverdueInvoices(): Promise<InvoiceResponse[]> {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: 'PENDING',
      due_date: {
        lt: new Date(),
      },
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      subscription: {
        include: {
          plan: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      due_date: 'asc',
    },
  });

  return invoices.map(transformInvoiceResponse);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Transform invoice to response format
 */
function transformInvoiceResponse(invoice: any): InvoiceResponse {
  const response: InvoiceResponse = {
    id: invoice.id,
    organization_id: invoice.organization_id,
    subscription_id: invoice.subscription_id,
    invoice_number: invoice.invoice_number,
    amount: Number(invoice.amount),
    currency: invoice.currency,
    tax_amount: Number(invoice.tax_amount),
    total_amount: Number(invoice.total_amount),
    status: invoice.status as InvoiceStatusValue,
    payment_method: invoice.payment_method as PaymentMethodValue,
    paid_at: invoice.paid_at,
    payment_proof_url: invoice.payment_proof_url,
    payment_notes: invoice.payment_notes,
    midtrans_order_id: invoice.midtrans_order_id,
    midtrans_transaction_id: invoice.midtrans_transaction_id,
    midtrans_payment_type: invoice.midtrans_payment_type,
    due_date: invoice.due_date,
    created_at: invoice.created_at,
    updated_at: invoice.updated_at,
  };

  if (invoice.organization) {
    response.organization = {
      id: invoice.organization.id,
      name: invoice.organization.name,
      email: invoice.organization.email,
    };
  }

  if (invoice.subscription) {
    response.subscription = {
      id: invoice.subscription.id,
      plan_id: invoice.subscription.plan_id,
      plan: invoice.subscription.plan
        ? {
            id: invoice.subscription.plan.id,
            name: invoice.subscription.plan.name,
          }
        : undefined,
    };
  }

  return response;
}
