import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import Cookies from "js-cookie";
import { API_BASE_URL } from "./constants";
import type { ApiResponse } from "@/types";

// Create axios instance
const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

// Request interceptor - add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = Cookies.get("accessToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiResponse<unknown>>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 Unauthorized - try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = Cookies.get("refreshToken");
        if (refreshToken) {
          const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
            refresh_token: refreshToken,
          });

          const { accessToken, refreshToken: newRefreshToken } = response.data.data;

          Cookies.set("accessToken", accessToken, { 
            expires: 1, // 1 day for access token cookie
            sameSite: "strict" 
          });
          Cookies.set("refreshToken", newRefreshToken, { 
            expires: 7, // 7 days for refresh token cookie
            sameSite: "strict" 
          });

          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed - clear tokens and redirect to login
        Cookies.remove("accessToken");
        Cookies.remove("refreshToken");
        
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        
        return Promise.reject(refreshError);
      }
    }

    // Extract backend error message so callers see meaningful errors
    // instead of generic "Request failed with status code 400"
    const backendMessage = error.response?.data?.error?.message;
    if (backendMessage) {
      return Promise.reject(new Error(backendMessage));
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: async (email: string, password: string) => {
    const response = await api.post("/auth/login", { email, password });
    return response.data;
  },

  register: async (data: {
    email: string;
    password: string;
    full_name: string;
    organization_name: string;
    phone?: string;
  }) => {
    const response = await api.post("/auth/register", data);
    return response.data;
  },

  logout: async () => {
    const response = await api.post("/auth/logout");
    return response.data;
  },

  refreshToken: async (refreshToken: string) => {
    const response = await api.post("/auth/refresh", { refresh_token: refreshToken });
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get("/auth/me");
    return response.data;
  },

  forgotPassword: async (email: string) => {
    const response = await api.post("/auth/forgot-password", { email });
    return response.data;
  },

  resetPassword: async (token: string, password: string) => {
    const response = await api.post("/auth/reset-password", { token, password });
    return response.data;
  },

  verifyEmail: async (token: string) => {
    const response = await api.post("/auth/verify-email", { token });
    return response.data;
  },
};

// Broadcasts API
export const broadcastsApi = {
  getAll: async (params?: { page?: number; limit?: number; status?: string; instanceId?: string }) => {
    const response = await api.get("/broadcasts", { params });
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/broadcasts/${id}`);
    return response.data;
  },

  create: async (data: {
    name: string;
    instance_id: string;
    message_type: string;
    message_content: Record<string, unknown>;
    scheduled_at?: string;
  }) => {
    const response = await api.post("/broadcasts", data);
    return response.data;
  },

  update: async (id: string, data: {
    name?: string;
    message_type?: string;
    message_content?: Record<string, unknown>;
    scheduled_at?: string;
  }) => {
    const response = await api.patch(`/broadcasts/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/broadcasts/${id}`);
    return response.data;
  },

  start: async (id: string) => {
    const response = await api.post(`/broadcasts/${id}/start`);
    return response.data;
  },

  pause: async (id: string) => {
    const response = await api.post(`/broadcasts/${id}/pause`);
    return response.data;
  },

  resume: async (id: string) => {
    const response = await api.post(`/broadcasts/${id}/resume`);
    return response.data;
  },

  cancel: async (id: string) => {
    const response = await api.post(`/broadcasts/${id}/cancel`);
    return response.data;
  },

  getRecipients: async (id: string, params?: { page?: number; limit?: number }) => {
    const response = await api.get(`/broadcasts/${id}/recipients`, { params });
    return response.data;
  },

  addRecipients: async (id: string, data: { phone_numbers: string[] }) => {
    const response = await api.post(`/broadcasts/${id}/recipients`, data);
    return response.data;
  },

  addRecipientsFromContacts: async (id: string, data: { contact_ids: string[] }) => {
    const response = await api.post(`/broadcasts/${id}/recipients/from-contacts`, data);
    return response.data;
  },

  addRecipientsFromTags: async (id: string, data: { tags: string[] }) => {
    const response = await api.post(`/broadcasts/${id}/recipients/from-tags`, data);
    return response.data;
  },

  getStats: async () => {
    const response = await api.get("/broadcasts/stats");
    return response.data;
  },
};

// WhatsApp Instances API
export const instancesApi = {
  getAll: async (params?: { page?: number; limit?: number }) => {
    const response = await api.get("/whatsapp/instances", { params });
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/whatsapp/instances/${id}`);
    return response.data;
  },

  create: async (data: { name: string; webhook_url?: string }) => {
    const response = await api.post("/whatsapp/instances", data);
    return response.data;
  },

  update: async (id: string, data: { name?: string; webhook_url?: string }) => {
    const response = await api.patch(`/whatsapp/instances/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/whatsapp/instances/${id}`);
    return response.data;
  },

  getQrCode: async (id: string) => {
    const response = await api.get(`/whatsapp/instances/${id}/qr`);
    return response.data;
  },

  connect: async (id: string) => {
    const response = await api.post(`/whatsapp/instances/${id}/connect`);
    return response.data;
  },

  disconnect: async (id: string) => {
    const response = await api.post(`/whatsapp/instances/${id}/disconnect`);
    return response.data;
  },

  getStatus: async (id: string) => {
    const response = await api.get(`/whatsapp/instances/${id}/status`);
    return response.data;
  },
};

// Messages API
export const messagesApi = {
  getAll: async (params?: { 
    page?: number; 
    limit?: number; 
    instanceId?: string;
    status?: string;
    direction?: string;
    source?: string;
  }) => {
    const response = await api.get("/whatsapp/messages", { params });
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/whatsapp/messages/${id}`);
    return response.data;
  },

  deleteMany: async (ids: string[]) => {
    const response = await api.delete("/whatsapp/messages", { data: { ids } });
    return response.data;
  },

  send: async (data: {
    instance_id: string;
    to: string;
    type: string;
    content: string | Record<string, unknown>;
    media_url?: string;
  }) => {
    const response = await api.post("/whatsapp/messages/send", data);
    return response.data;
  },
};

// Contacts API
export const contactsApi = {
  getAll: async (params?: { page?: number; limit?: number; search?: string; tags?: string[] }) => {
    const response = await api.get("/contacts", { params });
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/contacts/${id}`);
    return response.data;
  },

  create: async (data: { 
    instance_id?: string;
    phone_number?: string;
    phone?: string; 
    name?: string; 
    email?: string;
    tags?: string[] 
  }) => {
    const response = await api.post("/contacts", data);
    return response.data;
  },

  update: async (id: string, data: { phone?: string; name?: string; tags?: string[] }) => {
    const response = await api.patch(`/contacts/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/contacts/${id}`);
    return response.data;
  },

  import: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post("/contacts/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },
};

// Webhooks API — uses multi-target system (/webhooks/targets)
export const webhooksApi = {
  getAll: async (params?: { page?: number; limit?: number; instanceId?: string }) => {
    const response = await api.get("/webhooks/targets", {
      params: { instance_id: params?.instanceId },
    });
    // Wrap in pagination-compatible shape
    const data = response.data.data || [];
    return {
      data,
      pagination: { total: data.length, page: 1, limit: data.length, total_pages: 1 },
    };
  },

  getById: async (id: string) => {
    const response = await api.get(`/webhooks/${id}`);
    return response.data;
  },

  create: async (data: { instance_id: string; label: string; url: string; events: string[] }) => {
    const response = await api.post("/webhooks/targets", data);
    return response.data;
  },

  update: async (id: string, data: { label?: string; url?: string; events?: string[]; is_active?: boolean }) => {
    const response = await api.patch(`/webhooks/targets/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/webhooks/targets/${id}`);
    return response.data;
  },

  test: async (id: string) => {
    const response = await api.post(`/webhooks/targets/${id}/test`);
    return response.data;
  },

  getLogs: async (id: string, params?: { page?: number; limit?: number }) => {
    const response = await api.get(`/webhooks/${id}/logs`, { params });
    return response.data;
  },
};

// API Keys API
export const apiKeysApi = {
  getAll: async () => {
    const response = await api.get("/api-keys");
    return response.data;
  },

  create: async (data: { name: string; permissions: string[]; expires_at?: string }) => {
    const response = await api.post("/api-keys", data);
    return response.data;
  },

  revoke: async (id: string) => {
    const response = await api.delete(`/api-keys/${id}`);
    return response.data;
  },
};

// Billing API
export const billingApi = {
  getPlans: async () => {
    // Use public endpoint — /billing/plans requires SUPER_ADMIN (403 for regular users)
    const response = await api.get("/billing/plans/public");
    return response.data;
  },

  getSubscription: async () => {
    const response = await api.get("/billing/subscription");
    return response.data;
  },

  getUsage: async () => {
    const response = await api.get("/billing/subscription/usage");
    return response.data;
  },

  subscribe: async (planId: string) => {
    const response = await api.post("/billing/subscribe", { plan_id: planId });
    return response.data;
  },

  cancelSubscription: async () => {
    const response = await api.post("/billing/subscription/cancel");
    return response.data;
  },

  startCheckout: async (data: { plan_id: string }) => {
    const response = await api.post("/billing/checkout", data);
    return response.data;
  },
};

// Invoices API
export const invoicesApi = {
  getAll: async (params?: { page?: number; limit?: number; status?: string }) => {
    const response = await api.get("/invoices", { params });
    return response.data;
  },

  getById: async (id: string) => {
    const response = await api.get(`/invoices/${id}`);
    return response.data;
  },

  getStats: async () => {
    const response = await api.get("/invoices/stats");
    return response.data;
  },

  uploadProof: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append("proof", file);
    const response = await api.post(`/invoices/${id}/upload-proof`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },
};

// Team/Users API
export const teamApi = {
  getMembers: async () => {
    const response = await api.get("/users");
    return response.data;
  },

  inviteMember: async (data: { email: string; role: string }) => {
    const response = await api.post("/users/invite", data);
    return response.data;
  },

  updateMember: async (id: string, data: { role?: string; is_active?: boolean }) => {
    const response = await api.patch(`/users/${id}`, data);
    return response.data;
  },

  removeMember: async (id: string) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
  },
};

// Admin API
export const adminApi = {
  getDashboardStats: async () => {
    const response = await api.get("/admin/stats");
    return response.data;
  },

  getOrganizations: async (params?: { page?: number; limit?: number; status?: string }) => {
    const response = await api.get("/admin/organizations", { params });
    return response.data;
  },

  getOrganizationById: async (id: string) => {
    const response = await api.get(`/admin/organizations/${id}`);
    return response.data;
  },

  updateOrganization: async (id: string, data: { is_active?: boolean; subscription_status?: string; max_instances?: number; max_contacts?: number; max_messages_per_day?: number }) => {
    const response = await api.patch(`/admin/organizations/${id}`, data);
    return response.data;
  },

  assignPlanToOrg: async (id: string, plan_id: string) => {
    const response = await api.post(`/admin/organizations/${id}/assign-plan`, { plan_id });
    return response.data;
  },

  getAllUsers: async (params?: { page?: number; limit?: number }) => {
    const response = await api.get("/admin/users", { params });
    return response.data;
  },

  getUsers: async (params?: { page?: number; limit?: number; role?: string; status?: string }) => {
    const response = await api.get("/admin/users", { params });
    return response.data;
  },

  getAllInstances: async (params?: { page?: number; limit?: number; status?: string }) => {
    const response = await api.get("/admin/instances", { params });
    return response.data;
  },

  getAllInvoices: async (params?: { page?: number; limit?: number; status?: string }) => {
    const response = await api.get("/invoices/admin/all", { params });
    return response.data;
  },

  getInvoiceStats: async () => {
    const response = await api.get("/invoices/admin/stats");
    return response.data;
  },

  getPendingVerification: async () => {
    const response = await api.get("/invoices/admin/pending-verification");
    return response.data;
  },

  verifyInvoice: async (id: string, status: string, payment_notes?: string) => {
    const response = await api.post(`/invoices/admin/${id}/verify`, { status, payment_notes });
    return response.data;
  },

  getSystemHealth: async () => {
    const response = await api.get("/admin/health");
    return response.data;
  },

  getAuditLogs: async (params?: { page?: number; limit?: number }) => {
    const response = await api.get("/admin/audit-logs", { params });
    return response.data;
  },

  // Plans management (proxy to /billing/plans)
  getPlans: async () => {
    const response = await api.get("/billing/plans");
    return response.data;
  },

  createPlan: async (data: Record<string, unknown>) => {
    const response = await api.post("/billing/plans", data);
    return response.data;
  },

  updatePlan: async (id: string, data: Record<string, unknown>) => {
    const response = await api.put(`/billing/plans/${id}`, data);
    return response.data;
  },

  deletePlan: async (id: string) => {
    const response = await api.delete(`/billing/plans/${id}`);
    return response.data;
  },

  // Payment methods config (proxy to /payments/admin)
  getPaymentMethods: async () => {
    const response = await api.get("/payments/admin/methods/all");
    return response.data;
  },

  updatePaymentMethod: async (method: string, data: Record<string, unknown>) => {
    const response = await api.put(`/payments/admin/methods/${method}`, data);
    return response.data;
  },

  initializePaymentMethods: async () => {
    const response = await api.post("/payments/admin/methods/initialize");
    return response.data;
  },

  // System settings CRUD
  getSettings: async (prefix?: string) => {
    const response = await api.get("/admin/settings", { params: prefix ? { prefix } : {} });
    return response.data;
  },

  getSetting: async (key: string) => {
    const response = await api.get(`/admin/settings/${key}`);
    return response.data;
  },

  upsertSetting: async (key: string, value: unknown, description?: string) => {
    const response = await api.put(`/admin/settings/${key}`, { value, description });
    return response.data;
  },

  bulkUpsertSettings: async (settings: Array<{ key: string; value: unknown; description?: string }>) => {
    const response = await api.put("/admin/settings", { settings });
    return response.data;
  },

  deleteSetting: async (key: string) => {
    const response = await api.delete(`/admin/settings/${key}`);
    return response.data;
  },
};

// Uploads API
export const uploadsApi = {
  upload: async (file: File, type?: 'image' | 'document' | 'video' | 'audio') => {
    const formData = new FormData();
    formData.append('file', file);
    if (type) {
      formData.append('type', type);
    }
    const response = await api.post('/uploads', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  uploadMultiple: async (files: FileList | File[]) => {
    const formData = new FormData();
    Array.from(files).forEach((file) => {
      formData.append('files', file);
    });
    const response = await api.post('/uploads/multiple', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  delete: async (filename: string) => {
    const response = await api.delete(`/uploads/${filename}`);
    return response.data;
  },
};

// ============================================
// HISTORY SYNC API
// ============================================
export const syncApi = {
  /** Get sync status for an instance (dashboard JWT auth) */
  getSyncStatus: async (instanceId: string) => {
    const response = await api.get(`/whatsapp/instances/${instanceId}/sync-status`);
    return response.data;
  },

  /** Update sync settings for an instance (dashboard JWT auth) */
  updateSyncSettings: async (instanceId: string, data: { sync_history_on_connect?: boolean }) => {
    const response = await api.patch(`/whatsapp/instances/${instanceId}/sync-settings`, data);
    return response.data;
  },

  /** Re-pair instance for full history sync (dashboard JWT auth) */
  rePairForSync: async (instanceId: string) => {
    const response = await api.post(`/whatsapp/instances/${instanceId}/re-pair`);
    return response.data;
  },

  /** Clear all history sync data for an instance (dashboard JWT auth) */
  clearSyncData: async (instanceId: string) => {
    const response = await api.delete(`/whatsapp/instances/${instanceId}/sync-data`);
    return response.data;
  },

  /** Stop history sync for an instance (dashboard JWT auth) */
  stopSync: async (instanceId: string) => {
    const response = await api.post(`/whatsapp/instances/${instanceId}/sync-control`, { action: 'stop' });
    return response.data;
  },

  /** Resume history sync for an instance (dashboard JWT auth) */
  resumeSync: async (instanceId: string) => {
    const response = await api.post(`/whatsapp/instances/${instanceId}/sync-control`, { action: 'resume' });
    return response.data;
  },
};

export default api;
