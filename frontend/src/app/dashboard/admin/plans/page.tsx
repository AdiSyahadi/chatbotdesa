"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Shield, ToggleLeft, ToggleRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Plan {
  id: string;
  name: string;
  slug: string;
  description?: string;
  price: string;
  currency: string;
  billing_period: string;
  max_instances: number;
  max_contacts: number;
  max_messages_per_day: number;
  allow_history_sync: boolean;
  trial_days: number;
  is_active: boolean;
  is_public: boolean;
  created_at: string;
}

export default function AdminPlansPage() {
  const queryClient = useQueryClient();
  const [editDialog, setEditDialog] = useState<{ open: boolean; plan: Plan | null }>({
    open: false,
    plan: null,
  });
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    billing_period: "MONTHLY",
    max_instances: 1,
    max_contacts: 1000,
    max_messages_per_day: 100,
    allow_history_sync: false,
    trial_days: 7,
    is_active: true,
    is_public: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => adminApi.getPlans(),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => adminApi.createPlan(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      toast.success("Plan berhasil dibuat");
      setEditDialog({ open: false, plan: null });
    },
    onError: () => toast.error("Gagal membuat plan"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      adminApi.updatePlan(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      toast.success("Plan berhasil diupdate");
      setEditDialog({ open: false, plan: null });
    },
    onError: () => toast.error("Gagal update plan"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deletePlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-plans"] });
      toast.success("Plan berhasil dihapus");
    },
    onError: () => toast.error("Gagal hapus plan"),
  });

  const plans: Plan[] = data?.data?.plans || data?.data || [];

  const openCreate = () => {
    setFormData({
      name: "",
      description: "",
      price: "",
      billing_period: "MONTHLY",
      max_instances: 1,
      max_contacts: 1000,
      max_messages_per_day: 100,
      allow_history_sync: false,
      trial_days: 7,
      is_active: true,
      is_public: true,
    });
    setEditDialog({ open: true, plan: null });
  };

  const openEdit = (plan: Plan) => {
    setFormData({
      name: plan.name,
      description: plan.description || "",
      price: plan.price.toString(),
      billing_period: plan.billing_period,
      max_instances: plan.max_instances,
      max_contacts: plan.max_contacts,
      max_messages_per_day: plan.max_messages_per_day,
      allow_history_sync: plan.allow_history_sync,
      trial_days: plan.trial_days,
      is_active: plan.is_active,
      is_public: plan.is_public,
    });
    setEditDialog({ open: true, plan });
  };

  const generateSlug = (name: string) =>
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

  const handleSave = () => {
    const slug = editDialog.plan
      ? editDialog.plan.slug
      : generateSlug(formData.name);
    const payload = {
      ...formData,
      slug,
      price: parseFloat(formData.price) || 0,
    };
    if (editDialog.plan) {
      updateMutation.mutate({ id: editDialog.plan.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Subscription Plans</h1>
          <p className="text-muted-foreground">Kelola paket langganan SaaS</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Buat Plan Baru
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Belum ada subscription plan</p>
            <Button className="mt-4" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Buat Plan Pertama
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <Card key={plan.id} className={!plan.is_active ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">{plan.slug}</p>
                  </div>
                  <div className="flex gap-1">
                    {plan.is_active ? (
                      <Badge className="bg-accent/20 text-primary">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                    {plan.is_public && <Badge variant="outline">Public</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-2xl font-bold">
                  {plan.currency} {Number(plan.price).toLocaleString("id-ID")}
                  <span className="text-sm font-normal text-muted-foreground">
                    /{plan.billing_period.toLowerCase()}
                  </span>
                </div>
                {plan.description && (
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Instances: <strong>{plan.max_instances}</strong></div>
                  <div>Contacts: <strong>{plan.max_contacts.toLocaleString()}</strong></div>
                  <div>Msg/day: <strong>{plan.max_messages_per_day.toLocaleString()}</strong></div>
                  <div>Trial: <strong>{plan.trial_days} hari</strong></div>
                  <div>History Sync: <strong>{plan.allow_history_sync ? "Ya" : "Tidak"}</strong></div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(plan)}>
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (confirm(`Hapus plan "${plan.name}"?`)) {
                        deleteMutation.mutate(plan.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => !open && setEditDialog({ open: false, plan: null })}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editDialog.plan ? "Edit Plan" : "Buat Plan Baru"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nama Plan</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Basic, Pro, Enterprise" />
            </div>
            <div>
              <Label>Deskripsi</Label>
              <Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Deskripsi plan..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Harga (IDR)</Label>
                <Input type="number" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} />
              </div>
              <div>
                <Label>Billing Period</Label>
                <select
                  className="w-full p-2 border rounded-md"
                  value={formData.billing_period}
                  onChange={(e) => setFormData({ ...formData, billing_period: e.target.value })}
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Max Instances</Label>
                <Input type="number" value={formData.max_instances} onChange={(e) => setFormData({ ...formData, max_instances: parseInt(e.target.value) || 1 })} />
              </div>
              <div>
                <Label>Max Contacts</Label>
                <Input type="number" value={formData.max_contacts} onChange={(e) => setFormData({ ...formData, max_contacts: parseInt(e.target.value) || 1000 })} />
              </div>
              <div>
                <Label>Msg/Day</Label>
                <Input type="number" value={formData.max_messages_per_day} onChange={(e) => setFormData({ ...formData, max_messages_per_day: parseInt(e.target.value) || 100 })} />
              </div>
            </div>
            <div>
              <Label>Trial Days</Label>
              <Input type="number" value={formData.trial_days} onChange={(e) => setFormData({ ...formData, trial_days: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="flex items-center justify-between">
              <Label>History Sync</Label>
              <Switch checked={formData.allow_history_sync} onCheckedChange={(v) => setFormData({ ...formData, allow_history_sync: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Aktif</Label>
              <Switch checked={formData.is_active} onCheckedChange={(v) => setFormData({ ...formData, is_active: v })} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Publik</Label>
              <Switch checked={formData.is_public} onCheckedChange={(v) => setFormData({ ...formData, is_public: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog({ open: false, plan: null })}>
              Batal
            </Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
