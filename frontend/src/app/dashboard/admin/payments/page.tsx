"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { toast } from "sonner";
import { CreditCard, Building, Wallet, QrCode, Banknote, RefreshCw, AlertCircle } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface PaymentMethodConfig {
  id: string;
  method: string;
  is_enabled: boolean;
  display_name: string;
  description?: string;
  config_data?: Record<string, unknown>;
  bank_name?: string;
  account_number?: string;
  account_holder?: string;
}

const methodIcons: Record<string, React.ElementType> = {
  MANUAL_TRANSFER: Building,
  MIDTRANS_BANK_TRANSFER: Banknote,
  MIDTRANS_CREDIT_CARD: CreditCard,
  MIDTRANS_GOPAY: Wallet,
  MIDTRANS_QRIS: QrCode,
  MIDTRANS_OVO: Wallet,
};

export default function AdminPaymentsPage() {
  const queryClient = useQueryClient();
  const [editDialog, setEditDialog] = useState<{ open: boolean; method: PaymentMethodConfig | null }>({
    open: false,
    method: null,
  });
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [midtransConfig, setMidtransConfig] = useState<{ server_key: string; client_key: string; is_production: boolean }>({
    server_key: "",
    client_key: "",
    is_production: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-payment-methods"],
    queryFn: () => adminApi.getPaymentMethods(),
  });

  const initMutation = useMutation({
    mutationFn: () => adminApi.initializePaymentMethods(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payment-methods"] });
      toast.success("Payment methods initialized");
    },
    onError: () => toast.error("Gagal initialize"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ method, data }: { method: string; data: Record<string, unknown> }) =>
      adminApi.updatePaymentMethod(method, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payment-methods"] });
      toast.success("Berhasil disimpan");
      setEditDialog({ open: false, method: null });
    },
    onError: () => toast.error("Gagal menyimpan"),
  });

  const methods: PaymentMethodConfig[] = data?.data?.methods || [];

  const isMidtrans = (m: string) => m.startsWith("MIDTRANS_");

  const openEdit = (method: PaymentMethodConfig) => {
    setFormData({
      display_name: method.display_name || "",
      description: method.description || "",
      bank_name: method.bank_name || "",
      account_number: method.account_number || "",
      account_holder: method.account_holder || "",
    });
    if (isMidtrans(method.method)) {
      const cd = (method.config_data || {}) as Record<string, unknown>;
      setMidtransConfig({
        server_key: (cd.server_key as string) || "",
        client_key: (cd.client_key as string) || "",
        is_production: (cd.is_production as boolean) || false,
      });
    }
    setEditDialog({ open: true, method });
  };

  const handleSave = () => {
    if (!editDialog.method) return;
    const payload: Record<string, unknown> = {
      ...formData,
      is_enabled: editDialog.method.is_enabled,
    };
    if (isMidtrans(editDialog.method.method)) {
      payload.config_data = {
        server_key: midtransConfig.server_key || undefined,
        client_key: midtransConfig.client_key || undefined,
        is_production: midtransConfig.is_production,
      };
    }
    updateMutation.mutate({
      method: editDialog.method.method,
      data: payload,
    });
  };

  const toggleMethod = (method: PaymentMethodConfig) => {
    updateMutation.mutate({
      method: method.method,
      data: { is_enabled: !method.is_enabled },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Payment Configuration</h1>
          <p className="text-muted-foreground">Konfigurasi metode pembayaran SaaS</p>
        </div>
        {methods.length === 0 && (
          <Button onClick={() => initMutation.mutate()} disabled={initMutation.isPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${initMutation.isPending ? "animate-spin" : ""}`} />
            Initialize Methods
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : methods.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Belum ada metode pembayaran dikonfigurasi</p>
            <p className="text-sm mt-2">Klik &quot;Initialize Methods&quot; untuk membuat konfigurasi default</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {methods.map((method) => {
            const Icon = methodIcons[method.method] || CreditCard;
            return (
              <Card key={method.id} className={!method.is_enabled ? "opacity-60" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-base">{method.display_name}</CardTitle>
                        <p className="text-xs text-muted-foreground">{method.method.replace(/_/g, " ")}</p>
                      </div>
                    </div>
                    <Switch
                      checked={method.is_enabled}
                      onCheckedChange={() => toggleMethod(method)}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  {method.description && (
                    <p className="text-sm text-muted-foreground mb-3">{method.description}</p>
                  )}
                  {method.method === "MANUAL_TRANSFER" && method.bank_name && (
                    <div className="text-sm space-y-1 rounded-lg bg-muted p-3">
                      <div>Bank: <strong>{method.bank_name}</strong></div>
                      <div>No. Rek: <strong>{method.account_number}</strong></div>
                      <div>Atas Nama: <strong>{method.account_holder}</strong></div>
                    </div>
                  )}
                  {isMidtrans(method.method) && (
                    <div className="mb-1">
                      {(method.config_data as Record<string, unknown> | undefined)?.server_key ? (
                        <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-xs">
                          ✓ Configured
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50 text-xs">
                          ⚠ Belum Dikonfigurasi
                        </Badge>
                      )}
                    </div>
                  )}
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => openEdit(method)}>
                    Edit Konfigurasi
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => !open && setEditDialog({ open: false, method: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editDialog.method?.display_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Display Name</Label>
              <Input value={formData.display_name || ""} onChange={(e) => setFormData({ ...formData, display_name: e.target.value })} />
            </div>
            <div>
              <Label>Deskripsi</Label>
              <Input value={formData.description || ""} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </div>
            {editDialog.method?.method === "MANUAL_TRANSFER" && (
              <>
                <div>
                  <Label>Nama Bank</Label>
                  <Input value={formData.bank_name || ""} onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })} />
                </div>
                <div>
                  <Label>Nomor Rekening</Label>
                  <Input value={formData.account_number || ""} onChange={(e) => setFormData({ ...formData, account_number: e.target.value })} />
                </div>
                <div>
                  <Label>Atas Nama</Label>
                  <Input value={formData.account_holder || ""} onChange={(e) => setFormData({ ...formData, account_holder: e.target.value })} />
                </div>
              </>
            )}
            {editDialog.method && isMidtrans(editDialog.method.method) && (
              <>
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-3">Midtrans Configuration</p>
                  <div className="space-y-3">
                    <div>
                      <Label>Server Key</Label>
                      <Input
                        type="password"
                        value={midtransConfig.server_key}
                        onChange={(e) => setMidtransConfig({ ...midtransConfig, server_key: e.target.value })}
                        placeholder="SB-Mid-server-..."
                      />
                    </div>
                    <div>
                      <Label>Client Key</Label>
                      <Input
                        value={midtransConfig.client_key}
                        onChange={(e) => setMidtransConfig({ ...midtransConfig, client_key: e.target.value })}
                        placeholder="SB-Mid-client-..."
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Production Mode</Label>
                      <Switch
                        checked={midtransConfig.is_production}
                        onCheckedChange={(v) => setMidtransConfig({ ...midtransConfig, is_production: v })}
                      />
                    </div>
                    {!midtransConfig.server_key && (
                      <div className="flex items-center gap-2 text-xs text-yellow-600 bg-yellow-50 p-2 rounded">
                        <AlertCircle className="h-3 w-3" />
                        <span>Server key belum dikonfigurasi. Payment Midtrans tidak akan berfungsi.</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false, method: null })}>
              Batal
            </Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
