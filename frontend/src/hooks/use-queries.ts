import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  instancesApi, 
  messagesApi, 
  contactsApi, 
  webhooksApi, 
  apiKeysApi,
  billingApi,
  invoicesApi,
  teamApi,
  adminApi,
  broadcastsApi
} from "@/lib/api";
import { toast } from "sonner";

// Query keys
export const queryKeys = {
  // WhatsApp
  instances: ["instances"] as const,
  instance: (id: string) => ["instances", id] as const,
  instanceQr: (id: string) => ["instances", id, "qr"] as const,
  instanceStatus: (id: string) => ["instances", id, "status"] as const,
  
  // Messages
  messages: (params?: Record<string, unknown>) => ["messages", params] as const,
  message: (id: string) => ["messages", id] as const,
  
  // Broadcasts
  broadcasts: (params?: Record<string, unknown>) => ["broadcasts", params] as const,
  broadcast: (id: string) => ["broadcasts", id] as const,
  broadcastRecipients: (id: string, params?: Record<string, unknown>) => ["broadcasts", id, "recipients", params] as const,
  broadcastStats: ["broadcasts", "stats"] as const,
  
  // Contacts
  contacts: (params?: Record<string, unknown>) => ["contacts", params] as const,
  contact: (id: string) => ["contacts", id] as const,
  
  // Webhooks
  webhooks: (params?: Record<string, unknown>) => ["webhooks", params] as const,
  webhook: (id: string) => ["webhooks", id] as const,
  webhookLogs: (id: string) => ["webhooks", id, "logs"] as const,
  
  // API Keys
  apiKeys: ["apiKeys"] as const,
  
  // Billing
  plans: ["plans"] as const,
  subscription: ["subscription"] as const,
  usage: ["usage"] as const,
  
  // Invoices
  invoices: (params?: Record<string, unknown>) => ["invoices", params] as const,
  invoice: (id: string) => ["invoices", id] as const,
  invoiceStats: ["invoiceStats"] as const,
  
  // Team
  teamMembers: ["teamMembers"] as const,
  
  // Admin
  adminStats: ["admin", "stats"] as const,
  adminOrganizations: (params?: Record<string, unknown>) => ["admin", "organizations", params] as const,
  adminOrganization: (id: string) => ["admin", "organizations", id] as const,
  adminUsers: (params?: Record<string, unknown>) => ["admin", "users", params] as const,
  adminInstances: (params?: Record<string, unknown>) => ["admin", "instances", params] as const,
  adminInvoices: (params?: Record<string, unknown>) => ["admin", "invoices", params] as const,
  systemHealth: ["admin", "health"] as const,
  auditLogs: (params?: Record<string, unknown>) => ["admin", "auditLogs", params] as const,
};

// ============ INSTANCES HOOKS ============

export function useInstances(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.instances,
    queryFn: () => instancesApi.getAll(params),
  });
}

export function useInstance(id: string) {
  return useQuery({
    queryKey: queryKeys.instance(id),
    queryFn: () => instancesApi.getById(id),
    enabled: !!id,
  });
}

export function useInstanceQr(id: string) {
  return useQuery({
    queryKey: queryKeys.instanceQr(id),
    queryFn: () => instancesApi.getQrCode(id),
    enabled: !!id,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

export function useInstanceStatus(id: string) {
  return useQuery({
    queryKey: queryKeys.instanceStatus(id),
    queryFn: () => instancesApi.getStatus(id),
    enabled: !!id,
    refetchInterval: 5000, // Refetch every 5 seconds
  });
}

export function useCreateInstance() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { name: string; webhook_url?: string }) => 
      instancesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instances });
      toast.success("Instance berhasil dibuat");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal membuat instance");
    },
  });
}

export function useUpdateInstance() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ instanceId, data }: { instanceId: string; data: Record<string, unknown> }) => 
      instancesApi.update(instanceId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instances });
      queryClient.invalidateQueries({ queryKey: queryKeys.instance(variables.instanceId) });
      toast.success("Instance berhasil diupdate");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal mengupdate instance");
    },
  });
}

export function useDeleteInstance() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => instancesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instances });
      toast.success("Instance berhasil dihapus");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal menghapus instance");
    },
  });
}

export function useConnectInstance() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => instancesApi.connect(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instance(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.instanceStatus(id) });
      toast.success("Menghubungkan instance...");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal menghubungkan instance");
    },
  });
}

export function useDisconnectInstance() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => instancesApi.disconnect(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.instance(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.instanceStatus(id) });
      toast.success("Instance terputus");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal memutuskan instance");
    },
  });
}

// ============ MESSAGES HOOKS ============

export function useMessages(params?: { 
  page?: number; 
  limit?: number; 
  instanceId?: string;
  status?: string;
  direction?: string;
}) {
  return useQuery({
    queryKey: queryKeys.messages(params),
    queryFn: () => messagesApi.getAll(params),
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: {
      instance_id: string;
      to: string;
      type: string;
      content: string | { text?: string; caption?: string; url?: string };
      media_url?: string;
    }) => messagesApi.send(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      toast.success("Pesan berhasil dikirim");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal mengirim pesan");
    },
  });
}

// ============ BROADCASTS HOOKS ============

export function useBroadcasts(params?: { page?: number; limit?: number; status?: string; instanceId?: string }) {
  return useQuery({
    queryKey: queryKeys.broadcasts(params),
    queryFn: () => broadcastsApi.getAll(params),
  });
}

export function useBroadcast(id: string) {
  return useQuery({
    queryKey: queryKeys.broadcast(id),
    queryFn: () => broadcastsApi.getById(id),
    enabled: !!id,
  });
}

export function useBroadcastRecipients(id: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.broadcastRecipients(id, params),
    queryFn: () => broadcastsApi.getRecipients(id, params),
    enabled: !!id,
  });
}

export function useBroadcastStats() {
  return useQuery({
    queryKey: queryKeys.broadcastStats,
    queryFn: () => broadcastsApi.getStats(),
  });
}

export function useCreateBroadcast() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: {
      name: string;
      instance_id: string;
      message_type: string;
      message_content: Record<string, unknown>;
      scheduled_at?: string;
    }) => broadcastsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      toast.success("Broadcast berhasil dibuat");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal membuat broadcast");
    },
  });
}

export function useUpdateBroadcast() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; message_type?: string; message_content?: Record<string, unknown>; scheduled_at?: string } }) => 
      broadcastsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      toast.success("Broadcast berhasil diperbarui");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal memperbarui broadcast");
    },
  });
}

export function useDeleteBroadcast() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => broadcastsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      toast.success("Broadcast berhasil dihapus");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal menghapus broadcast");
    },
  });
}

export function useStartBroadcast() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => broadcastsApi.start(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      toast.success("Broadcast dimulai");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal memulai broadcast");
    },
  });
}

export function usePauseBroadcast() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => broadcastsApi.pause(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      toast.success("Broadcast dijeda");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal menjeda broadcast");
    },
  });
}

export function useResumeBroadcast() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => broadcastsApi.resume(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      toast.success("Broadcast dilanjutkan");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal melanjutkan broadcast");
    },
  });
}

export function useCancelBroadcast() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => broadcastsApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      toast.success("Broadcast dibatalkan");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal membatalkan broadcast");
    },
  });
}

export function useAddBroadcastRecipients() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, phoneNumbers }: { id: string; phoneNumbers: string[] }) => 
      broadcastsApi.addRecipients(id, { phone_numbers: phoneNumbers }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
      toast.success("Penerima berhasil ditambahkan");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal menambahkan penerima");
    },
  });
}

// ============ CONTACTS HOOKS ============

export function useContacts(params?: { page?: number; limit?: number; search?: string; instanceId?: string }) {
  return useQuery({
    queryKey: queryKeys.contacts(params),
    queryFn: () => contactsApi.getAll(params),
  });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: queryKeys.contact(id),
    queryFn: () => contactsApi.getById(id),
    enabled: !!id,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { 
      instance_id: string; 
      phone_number: string; 
      name?: string; 
      email?: string;
      tags?: string[] 
    }) => contactsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Kontak berhasil ditambahkan");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal menambahkan kontak");
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { phone?: string; name?: string; tags?: string[] } }) => 
      contactsApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.contact(variables.id) });
      toast.success("Kontak berhasil diupdate");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal mengupdate kontak");
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => contactsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Kontak berhasil dihapus");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal menghapus kontak");
    },
  });
}

// ============ WEBHOOKS HOOKS ============

export function useWebhooks(params?: { page?: number; limit?: number; instanceId?: string }) {
  return useQuery({
    queryKey: queryKeys.webhooks(params),
    queryFn: () => webhooksApi.getAll(params),
  });
}

export function useWebhook(id: string) {
  return useQuery({
    queryKey: queryKeys.webhook(id),
    queryFn: () => webhooksApi.getById(id),
    enabled: !!id,
  });
}

export function useWebhookLogs(id: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.webhookLogs(id),
    queryFn: () => webhooksApi.getLogs(id, params),
    enabled: !!id,
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { instance_id: string; url: string; events: string[] }) => 
      webhooksApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Webhook berhasil dibuat");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal membuat webhook");
    },
  });
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { url?: string; events?: string[]; is_active?: boolean } }) => 
      webhooksApi.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.webhook(variables.id) });
      toast.success("Webhook berhasil diupdate");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal mengupdate webhook");
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => webhooksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Webhook berhasil dihapus");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal menghapus webhook");
    },
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: (id: string) => webhooksApi.test(id),
    onSuccess: () => {
      toast.success("Test webhook dikirim");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal test webhook");
    },
  });
}

// ============ API KEYS HOOKS ============

export function useApiKeys() {
  return useQuery({
    queryKey: queryKeys.apiKeys,
    queryFn: () => apiKeysApi.getAll(),
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; permissions: string[]; expires_at?: string }) =>
      apiKeysApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys });
      toast.success("API key berhasil dibuat");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal membuat API key");
    },
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys });
      toast.success("API key berhasil dicabut");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal mencabut API key");
    },
  });
}

// ============ BILLING HOOKS ============

export function usePlans() {
  return useQuery({
    queryKey: queryKeys.plans,
    queryFn: () => billingApi.getPlans(),
  });
}

export function useSubscription() {
  return useQuery({
    queryKey: queryKeys.subscription,
    queryFn: () => billingApi.getSubscription(),
  });
}

export function useUsage() {
  return useQuery({
    queryKey: queryKeys.usage,
    queryFn: () => billingApi.getUsage(),
  });
}

export function useSubscribe() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (planId: string) => billingApi.subscribe(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.subscription });
      queryClient.invalidateQueries({ queryKey: queryKeys.usage });
      toast.success("Berlangganan berhasil");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal berlangganan");
    },
  });
}

export function useStartCheckout() {
  return useMutation({
    mutationFn: (data: { plan_id: string }) => billingApi.startCheckout(data),
    onError: (error: Error) => {
      toast.error(error.message || "Gagal memulai checkout");
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: () => billingApi.cancelSubscription(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.subscription });
      toast.success("Langganan berhasil dibatalkan");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal membatalkan langganan");
    },
  });
}

// ============ INVOICES HOOKS ============

export function useInvoices(params?: { page?: number; limit?: number; status?: string }) {
  return useQuery({
    queryKey: queryKeys.invoices(params),
    queryFn: () => invoicesApi.getAll(params),
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: queryKeys.invoice(id),
    queryFn: () => invoicesApi.getById(id),
    enabled: !!id,
  });
}

export function useInvoiceStats() {
  return useQuery({
    queryKey: queryKeys.invoiceStats,
    queryFn: () => invoicesApi.getStats(),
  });
}

// ============ TEAM HOOKS ============

export function useTeamMembers() {
  return useQuery({
    queryKey: queryKeys.teamMembers,
    queryFn: () => teamApi.getMembers(),
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: { email: string; role: string }) => teamApi.inviteMember(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers });
      toast.success("Undangan berhasil dikirim");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal mengirim undangan");
    },
  });
}

export function useUpdateMember() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { role?: string; is_active?: boolean } }) =>
      teamApi.updateMember(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers });
      toast.success("Member berhasil diupdate");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal mengupdate member");
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => teamApi.removeMember(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers });
      toast.success("Member berhasil dihapus");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal menghapus member");
    },
  });
}

// ============ ADMIN HOOKS ============

export function useAdminStats() {
  return useQuery({
    queryKey: queryKeys.adminStats,
    queryFn: () => adminApi.getDashboardStats(),
  });
}

export function useAdminOrganizations(params?: { page?: number; limit?: number; status?: string }) {
  return useQuery({
    queryKey: queryKeys.adminOrganizations(params),
    queryFn: () => adminApi.getOrganizations(params),
  });
}

export function useSystemHealth() {
  return useQuery({
    queryKey: queryKeys.systemHealth,
    queryFn: () => adminApi.getSystemHealth(),
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}
