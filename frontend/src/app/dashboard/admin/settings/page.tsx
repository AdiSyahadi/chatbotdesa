"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { toast } from "sonner";
import {
  Settings,
  CreditCard,
  Save,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Server,
} from "lucide-react";

interface SystemSetting {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();

  // Midtrans form state
  const [midtrans, setMidtrans] = useState({
    server_key: "",
    client_key: "",
    is_production: false,
    merchant_id: "",
  });
  const [showServerKey, setShowServerKey] = useState(false);
  const [midtransDirty, setMidtransDirty] = useState(false);

  // Load all settings
  const { data, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => adminApi.getSettings(),
  });

  const settings: SystemSetting[] = data?.data?.settings || [];

  // Populate Midtrans form from settings
  useEffect(() => {
    if (settings.length > 0) {
      const map: Record<string, unknown> = {};
      for (const s of settings) {
        if (s.key.startsWith("midtrans.")) {
          map[s.key.replace("midtrans.", "")] = s.value;
        }
      }
      setMidtrans({
        server_key: (map.server_key as string) || "",
        client_key: (map.client_key as string) || "",
        is_production: (map.is_production as boolean) || false,
        merchant_id: (map.merchant_id as string) || "",
      });
      setMidtransDirty(false);
    }
  }, [settings.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (payload: Array<{ key: string; value: unknown; description?: string }>) =>
      adminApi.bulkUpsertSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
      toast.success("Pengaturan berhasil disimpan");
      setMidtransDirty(false);
    },
    onError: () => toast.error("Gagal menyimpan pengaturan"),
  });

  const handleSaveMidtrans = () => {
    saveMutation.mutate([
      { key: "midtrans.server_key", value: midtrans.server_key, description: "Midtrans Server Key" },
      { key: "midtrans.client_key", value: midtrans.client_key, description: "Midtrans Client Key" },
      { key: "midtrans.is_production", value: midtrans.is_production, description: "Midtrans Production Mode" },
      { key: "midtrans.merchant_id", value: midtrans.merchant_id, description: "Midtrans Merchant ID" },
    ]);
  };

  const updateMidtrans = (field: string, value: unknown) => {
    setMidtrans((prev) => ({ ...prev, [field]: value }));
    setMidtransDirty(true);
  };

  const midtransConfigured = !!(midtrans.server_key && midtrans.client_key);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Konfigurasi sistem SaaS</p>
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Konfigurasi sistem dan integrasi</p>
      </div>

      <Tabs defaultValue="payment-gateway" className="space-y-4">
        <TabsList>
          <TabsTrigger value="payment-gateway" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Payment Gateway
          </TabsTrigger>
          <TabsTrigger value="general" className="gap-2">
            <Server className="h-4 w-4" />
            General
          </TabsTrigger>
        </TabsList>

        {/* ============== PAYMENT GATEWAY TAB ============== */}
        <TabsContent value="payment-gateway" className="space-y-4">
          {/* Midtrans Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Midtrans
                  </CardTitle>
                  <CardDescription>
                    Konfigurasi API key Midtrans untuk payment gateway otomatis (Bank Transfer, GoPay, QRIS, OVO, Credit Card)
                  </CardDescription>
                </div>
                {midtransConfigured ? (
                  <Badge className="bg-green-100 text-green-700 border-green-300">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Configured
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Belum Dikonfigurasi
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Server Key */}
              <div className="space-y-2">
                <Label htmlFor="midtrans-server-key">Server Key</Label>
                <div className="relative">
                  <Input
                    id="midtrans-server-key"
                    type={showServerKey ? "text" : "password"}
                    value={midtrans.server_key}
                    onChange={(e) => updateMidtrans("server_key", e.target.value)}
                    placeholder="SB-Mid-server-..."
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowServerKey(!showServerKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showServerKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Server key digunakan untuk autentikasi API Midtrans dari backend. Jangan bagikan ke publik.
                </p>
              </div>

              {/* Client Key */}
              <div className="space-y-2">
                <Label htmlFor="midtrans-client-key">Client Key</Label>
                <Input
                  id="midtrans-client-key"
                  value={midtrans.client_key}
                  onChange={(e) => updateMidtrans("client_key", e.target.value)}
                  placeholder="SB-Mid-client-..."
                />
                <p className="text-xs text-muted-foreground">
                  Client key digunakan untuk Snap.js di frontend.
                </p>
              </div>

              {/* Merchant ID */}
              <div className="space-y-2">
                <Label htmlFor="midtrans-merchant-id">Merchant ID (opsional)</Label>
                <Input
                  id="midtrans-merchant-id"
                  value={midtrans.merchant_id}
                  onChange={(e) => updateMidtrans("merchant_id", e.target.value)}
                  placeholder="G0123456789"
                />
              </div>

              {/* Production Mode */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label>Production Mode</Label>
                  <p className="text-xs text-muted-foreground">
                    {midtrans.is_production
                      ? "Menggunakan API production Midtrans (transaksi nyata)"
                      : "Menggunakan API sandbox Midtrans (untuk testing)"}
                  </p>
                </div>
                <Switch
                  checked={midtrans.is_production}
                  onCheckedChange={(v) => updateMidtrans("is_production", v)}
                />
              </div>

              {/* Warning for no keys */}
              {!midtransConfigured && (
                <div className="flex items-start gap-2 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Midtrans belum dikonfigurasi</p>
                    <p className="text-xs mt-1">
                      Masukkan Server Key dan Client Key dari dashboard Midtrans untuk mengaktifkan payment gateway otomatis.
                      Dapatkan key di <span className="font-mono">dashboard.midtrans.com</span>
                    </p>
                  </div>
                </div>
              )}

              {/* Save button */}
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleSaveMidtrans}
                  disabled={saveMutation.isPending || !midtransDirty}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saveMutation.isPending ? "Menyimpan..." : "Simpan Midtrans Config"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============== GENERAL TAB ============== */}
        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                General Settings
              </CardTitle>
              <CardDescription>
                Pengaturan umum sistem (email, branding, dll)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 text-center text-muted-foreground">
              <Server className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">
                Pengaturan umum akan tersedia di versi selanjutnya.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
