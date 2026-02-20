"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { toast } from "sonner";
import { CreditCard, Building, Wallet, QrCode, Banknote, RefreshCw, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface PaymentMethodConfig {
  id: string;
  method: string;
  is_enabled: boolean;
  display_name: string;
  description?: string;
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

  const openEdit = (method: PaymentMethodConfig) => {
    setFormData({
      display_name: method.display_name || "",
      description: method.description || "",
      bank_name: method.bank_name || "",
      account_number: method.account_number || "",
      account_holder: method.account_holder || "",
    });
    setEditDialog({ open: true, method });
  };

  const handleSave = () => {
    if (!editDialog.method) return;
    updateMutation.mutate({
      method: editDialog.method.method,
      data: {
        ...formData,
        is_enabled: editDialog.method.is_enabled,
      },
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
                  {method.method.startsWith("MIDTRANS_") && (
                    <Link href="/dashboard/admin/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-1">
                      <Settings className="h-3 w-3" />
                      Konfigurasi API key di Settings
                    </Link>
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
            {editDialog.method?.method.startsWith("MIDTRANS_") && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted p-3 rounded-lg">
                <Settings className="h-3 w-3" />
                <span>Konfigurasi API key Midtrans ada di <Link href="/dashboard/admin/settings" className="text-primary underline">Settings</Link></span>
              </div>
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
