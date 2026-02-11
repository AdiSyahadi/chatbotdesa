// Auth types
export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  organizationId: string;
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = "SUPER_ADMIN" | "ORG_OWNER" | "ORG_ADMIN" | "ORG_MEMBER";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  fullName: string;
  organizationName: string;
  phone?: string;
}

export interface AuthResponse {
  user: User;
  organization: Organization;
  accessToken: string;
  refreshToken: string;
}

// WhatsApp Instance types
export interface WhatsAppInstance {
  id: string;
  name: string;
  phoneNumber?: string;
  status: InstanceStatus;
  isActive: boolean;
  qrCode?: string;
  healthScore: number;
  messagesPerDay: number;
  maxMessagesPerDay: number;
  webhookUrl?: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export type InstanceStatus = "DISCONNECTED" | "CONNECTING" | "QR_READY" | "CONNECTED" | "BANNED";

export interface CreateInstanceRequest {
  name: string;
  webhookUrl?: string;
}

// Message types
export interface Message {
  id: string;
  instanceId: string;
  to: string;
  from?: string;
  type: MessageType;
  content: string;
  mediaUrl?: string;
  mediaType?: string;
  status: MessageStatus;
  direction: MessageDirection;
  source?: MessageSource;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  errorMessage?: string;
  createdAt: string;
}

export type MessageType = "TEXT" | "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO" | "LOCATION" | "CONTACT" | "STICKER" | "REACTION" | "POLL" | "UNKNOWN";
export type MessageStatus = "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";
export type MessageDirection = "INCOMING" | "OUTGOING";
export type MessageSource = "REALTIME" | "HISTORY_SYNC" | "MANUAL_IMPORT";

export interface SendMessageRequest {
  instanceId: string;
  to: string;
  type: MessageType;
  content: string;
  mediaUrl?: string;
}

// Contact types
export interface Contact {
  id: string;
  phone: string;
  name?: string;
  tags: string[];
  metadata?: Record<string, unknown>;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactRequest {
  phone: string;
  name?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// Webhook types
export interface Webhook {
  id: string;
  instanceId: string;
  url: string;
  events: string[];
  isActive: boolean;
  secretKey?: string;
  createdAt: string;
  updatedAt: string;
}

// API Key types
export interface ApiKey {
  id: string;
  name: string;
  key: string;
  permissions: string[];
  lastUsedAt?: string;
  expiresAt?: string;
  organizationId: string;
  createdAt: string;
}

// Billing types
export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description?: string;
  price: number;
  currency: string;
  billingPeriod: BillingPeriod;
  maxInstances: number;
  maxContacts: number;
  maxMessagesPerDay: number;
  features: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
}

export type BillingPeriod = "MONTHLY" | "QUARTERLY" | "YEARLY";

export interface Subscription {
  id: string;
  organizationId: string;
  planId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  createdAt: string;
}

export type SubscriptionStatus = "ACTIVE" | "CANCELLED" | "EXPIRED" | "SUSPENDED" | "TRIAL";

export interface Invoice {
  id: string;
  invoiceNumber: string;
  organizationId: string;
  subscriptionId?: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  dueDate: string;
  paidAt?: string;
  paymentMethod?: string;
  paymentProofUrl?: string;
  createdAt: string;
}

export type InvoiceStatus = "PENDING" | "PAID" | "CANCELLED" | "REFUNDED" | "EXPIRED";

export interface UsageStats {
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

// Pagination
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// History Sync types
export type HistorySyncStatus = "IDLE" | "SYNCING" | "COMPLETED" | "FAILED" | "PARTIAL";

export interface SyncProgress {
  total_messages_received: number;
  messages_inserted: number;
  messages_skipped_duplicate: number;
  contacts_synced: number;
  batch_errors: number;
  percentage: number;
  batches_received?: number;
  last_batch_at?: string;
  messages_per_second?: number;
  started_at?: string;
  completed_at?: string;
  error?: string;
  quota_reached?: boolean;
  quota_limit?: number;
  quota_used?: number;
}

export interface SyncSettings {
  sync_history_on_connect: boolean;
}

export interface SyncSettingsInput {
  sync_history_on_connect?: boolean;
}

export interface SyncStatusResponse {
  status: HistorySyncStatus;
  progress: SyncProgress | null;
  settings: SyncSettings;
  last_sync_at: string | null;
}

// Dashboard Stats
export interface DashboardStats {
  activeInstances: number;
  totalInstances: number;
  messagesToday: number;
  totalContacts: number;
  webhookCalls: number;
}

// Admin types
export interface AdminOrganization extends Organization {
  owner: User;
  subscription?: Subscription;
  instanceCount: number;
  userCount: number;
}

export interface SystemHealth {
  status: "healthy" | "degraded" | "unhealthy";
  database: {
    status: string;
    latency: number;
  };
  redis: {
    status: string;
    latency: number;
  };
  whatsapp: {
    connectedInstances: number;
    totalInstances: number;
  };
}
