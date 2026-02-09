export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const APP_NAME = "WhatsApp SaaS";
export const APP_DESCRIPTION = "WhatsApp API untuk Bisnis Anda";

export const ROUTES = {
  // Public routes
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  FORGOT_PASSWORD: "/forgot-password",
  VERIFY_EMAIL: "/verify-email",
  
  // Dashboard routes
  DASHBOARD: "/dashboard",
  WHATSAPP_INSTANCES: "/dashboard/whatsapp/instances",
  WHATSAPP_MESSAGES: "/dashboard/whatsapp/messages",
  WHATSAPP_BROADCAST: "/dashboard/whatsapp/broadcast",
  CONTACTS: "/dashboard/contacts",
  WEBHOOKS: "/dashboard/webhooks",
  API_KEYS: "/dashboard/api-keys",
  API_DOCS: "/dashboard/docs",
  TEAM: "/dashboard/team",
  BILLING: "/dashboard/billing",
  SETTINGS: "/dashboard/settings",
  
  // Admin routes
  ADMIN: "/admin",
  ADMIN_ORGANIZATIONS: "/admin/organizations",
  ADMIN_USERS: "/admin/users",
  ADMIN_PLANS: "/admin/plans",
  ADMIN_INVOICES: "/admin/invoices",
  ADMIN_INSTANCES: "/admin/instances",
  ADMIN_HEALTH: "/admin/health",
  ADMIN_AUDIT: "/admin/audit",
  ADMIN_SETTINGS: "/admin/settings",
} as const;

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ORG_OWNER: "ORG_OWNER",
  ORG_ADMIN: "ORG_ADMIN",
  ORG_MEMBER: "ORG_MEMBER",
} as const;

export const INSTANCE_STATUS = {
  DISCONNECTED: "DISCONNECTED",
  CONNECTING: "CONNECTING",
  QR_READY: "QR_READY",
  CONNECTED: "CONNECTED",
  BANNED: "BANNED",
} as const;

export const MESSAGE_STATUS = {
  PENDING: "PENDING",
  SENT: "SENT",
  DELIVERED: "DELIVERED",
  READ: "READ",
  FAILED: "FAILED",
} as const;

export const INVOICE_STATUS = {
  PENDING: "PENDING",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED",
  EXPIRED: "EXPIRED",
} as const;

export const BILLING_PERIOD = {
  MONTHLY: "MONTHLY",
  QUARTERLY: "QUARTERLY",
  YEARLY: "YEARLY",
} as const;
