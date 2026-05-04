"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useInstance,
  useInstanceQr,
  useConnectInstance,
  useDisconnectInstance,
  useDeleteInstance,
  useSyncStatus,
  useUpdateSyncSettings,
  useRePairForSync,
  useStopSync,
  useResumeSync,
  useClearSyncData,
} from "@/hooks/use-queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  QrCode,
  MessageSquare,
  Users,
  Webhook,
  Settings,
  Plug,
  Unplug,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Phone,
  Calendar,
  Activity,
  History,
  AlertTriangle,
  Square,
  Play,
  TrendingUp,
} from "lucide-react";
import { cn, formatDate, copyToClipboard } from "@/lib/utils";
import { toast } from "sonner";
import type { HistorySyncStatus } from "@/types";

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  CONNECTED: { label: "Connected", color: "text-green-700", bgColor: "bg-green-100" },
  DISCONNECTED: { label: "Disconnected", color: "text-gray-700", bgColor: "bg-gray-100" },
  CONNECTING: { label: "Connecting", color: "text-yellow-700", bgColor: "bg-yellow-100" },
  QR_READY: { label: "Scan QR", color: "text-blue-700", bgColor: "bg-blue-100" },
  BANNED: { label: "Banned", color: "text-red-700", bgColor: "bg-red-100" },
  ERROR: { label: "Error", color: "text-red-700", bgColor: "bg-red-100" },
};

export default function InstanceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const instanceId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [rePairDialogOpen, setRePairDialogOpen] = useState(false);
  const [clearSyncDialogOpen, setClearSyncDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const { data: instanceData, isLoading: instanceLoading, refetch: refetchInstance } = useInstance(instanceId);
  const instance = instanceData?.data;
  const { data: qrData, isLoading: qrLoading, refetch: refetchQR } = useInstanceQr(instanceId, instance?.status);
  const { data: syncData, refetch: refetchSync } = useSyncStatus(instanceId);
  const connectMutation = useConnectInstance();
  const disconnectMutation = useDisconnectInstance();
  const deleteMutation = useDeleteInstance();
  const updateSyncSettingsMutation = useUpdateSyncSettings();
  const rePairMutation = useRePairForSync();
  const stopSyncMutation = useStopSync();
  const resumeSyncMutation = useResumeSync();
  const clearSyncDataMutation = useClearSyncData();

  const qr = qrData?.data;

  // Auto-refresh instance status when connecting
  useEffect(() => {
    if (instance?.status === "CONNECTING" || instance?.status === "QR_READY") {
      const interval = setInterval(() => {
        refetchInstance();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [instance?.status, refetchInstance]);

  // Immediately refetch sync status when instance becomes CONNECTED
  // This ensures the progress bar appears right away after QR scan
  useEffect(() => {
    if (instance?.status === "CONNECTED") {
      refetchSync();
    }
  }, [instance?.status, refetchSync]);

  // QR auto-refresh is handled by refetchInterval in useInstanceQr hook.
  // Do NOT use refetchQR() here — refetch() bypasses the `enabled` guard,
  // causing 400 errors when stale cached status triggers premature requests.

  const handleConnect = async () => {
    try {
      await connectMutation.mutateAsync(instanceId);
    } catch {
      // Error handled by mutation onError
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectMutation.mutateAsync(instanceId);
    } catch {
      // Error handled by mutation onError
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(instanceId);
      router.push("/dashboard/whatsapp/instances");
    } catch {
      // Error handled by mutation
    }
  };

  const handleCopyId = async () => {
    await copyToClipboard(instanceId);
    setCopied(true);
    toast.success("Instance ID copied");
    setTimeout(() => setCopied(false), 2000);
  };

  if (instanceLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!instance) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Instance not found</h3>
          <p className="text-muted-foreground mb-4">
            The instance you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link href="/dashboard/whatsapp/instances">
            <Button>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Instances
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const status = statusConfig[instance.status] || statusConfig.DISCONNECTED;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/whatsapp/instances">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{instance.name}</h1>
              <Badge className={cn(status.bgColor, status.color, "border-0")}>
                <span
                  className={cn(
                    "mr-1.5 h-2 w-2 rounded-full inline-block",
                    instance.status === "CONNECTED" && "bg-green-500",
                    instance.status === "DISCONNECTED" && "bg-gray-400",
                    instance.status === "CONNECTING" && "bg-yellow-500 animate-pulse",
                    instance.status === "QR_READY" && "bg-blue-500",
                    instance.status === "BANNED" && "bg-red-500",
                    instance.status === "ERROR" && "bg-red-500"
                  )}
                />
                {status.label}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono">{instanceId.substring(0, 8)}...</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleCopyId}
              >
                {copied ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetchInstance()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {instance.status === "CONNECTED" ? (
            <Button
              variant="outline"
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? (
                <Spinner size="sm" className="mr-2" />
              ) : (
                <Unplug className="mr-2 h-4 w-4" />
              )}
              Disconnect
            </Button>
          ) : instance.status === "CONNECTING" || instance.status === "QR_READY" ? (
            <Button variant="outline" disabled>
              <Spinner size="sm" className="mr-2" />
              {instance.status === "QR_READY" ? "Awaiting QR Scan" : "Connecting..."}
            </Button>
          ) : instance.status !== "BANNED" ? (
            <Button
              onClick={handleConnect}
              disabled={connectMutation.isPending}
            >
              {connectMutation.isPending ? (
                <Spinner size="sm" className="mr-2" />
              ) : (
                <Plug className="mr-2 h-4 w-4" />
              )}
              Connect
            </Button>
          ) : null}
          <Button
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Main content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="qr">QR Code</TabsTrigger>
          <TabsTrigger value="sync" data-value="sync">History Sync</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Sync Status Banner — visible on Overview tab */}
          {(() => {
            const sync = syncData?.data;
            const ss = sync?.status as HistorySyncStatus | undefined;
            const prog = sync?.progress;
            if (ss === 'SYNCING' && prog) {
              const pct = Math.min(95, Math.max(5, Math.round((prog.batches_received || 0) * 2.5)));
              return (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                      <span className="text-sm font-medium text-blue-800">History Sync Sedang Berjalan</span>
                    </div>
                    <span className="text-xs text-blue-600 tabular-nums">
                      {prog.messages_inserted?.toLocaleString() || 0} messages synced
                    </span>
                  </div>
                  <Progress value={pct} className="h-2" />
                  <p className="text-xs text-blue-600">
                    Buka tab <button onClick={() => setActiveTab("sync")} className="underline font-medium">History Sync</button> untuk detail lengkap.
                  </p>
                </div>
              );
            }
            if (ss === 'STOPPED') {
              return (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Square className="h-4 w-4 text-orange-500" />
                    <span className="text-sm font-medium text-orange-800">History Sync Dihentikan</span>
                    <span className="text-xs text-orange-600">({prog?.messages_inserted?.toLocaleString() || 0} messages tersimpan)</span>
                  </div>
                  <button onClick={() => setActiveTab("sync")} className="text-xs text-orange-700 underline font-medium">Lihat detail</button>
                </div>
              );
            }
            return null;
          })()}

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-5">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Status</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <Badge className={cn(status.bgColor, status.color, "border-0 text-sm")}>
                  {status.label}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Phone</CardTitle>
                <Phone className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {instance.phone_number || "-"}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Created</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-sm font-medium">
                  {formatDate(instance.created_at)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Messages Today</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {instance.daily_message_count || 0}
                  {instance.daily_limit ? (
                    <span className="text-sm font-normal text-muted-foreground"> / {instance.daily_limit}</span>
                  ) : null}
                </div>
                {instance.warming_phase && (
                  <div className="mt-1">
                    <p className="text-xs text-muted-foreground">
                      Fase: {({ DAY_1_3: 'Hari 1-3', DAY_4_7: 'Hari 4-7', DAY_8_14: 'Hari 8-14', DAY_15_PLUS: 'Matang' } as Record<string, string>)[instance.warming_phase] ?? instance.warming_phase}
                    </p>
                    {instance.warming_phase !== 'DAY_15_PLUS' && (
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">
                        {({ DAY_1_3: 'Naik ke 300/hari di hari ke-4', DAY_4_7: 'Naik ke 600/hari di hari ke-8', DAY_8_14: 'Naik ke 1.000/hari di hari ke-15' } as Record<string, string>)[instance.warming_phase]}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Health Score</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div
                  className={cn(
                    'text-2xl font-bold',
                    (instance.health_score ?? 100) >= 70 ? 'text-green-600' :
                    (instance.health_score ?? 100) >= 40 ? 'text-yellow-600' : 'text-red-600'
                  )}
                >
                  {instance.health_score ?? 100}
                  <span className="text-sm font-normal text-muted-foreground">/100</span>
                </div>
                {(instance.health_score ?? 100) < 40 && (
                  <p className="text-xs text-red-600 mt-1">Terlalu rendah — jangan kirim pesan</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Warming phase info — only show if not yet at max */}
          {instance.warming_phase && instance.warming_phase !== 'DAY_15_PLUS' && (
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <TrendingUp className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Warming Phase — Limit naik otomatis
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Nomor WhatsApp baru perlu &quot;pemanasan&quot; agar tidak diblokir oleh WhatsApp. Limit pengiriman akan naik secara otomatis tanpa perlu tindakan apapun dari Anda.
                    </p>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {[
                        { phase: 'DAY_1_3', label: 'Hari 1-3', limit: '100/hari' },
                        { phase: 'DAY_4_7', label: 'Hari 4-7', limit: '300/hari' },
                        { phase: 'DAY_8_14', label: 'Hari 8-14', limit: '600/hari' },
                        { phase: 'DAY_15_PLUS', label: 'Hari 15+', limit: '1.000/hari' },
                      ].map((p) => (
                        <div
                          key={p.phase}
                          className={cn(
                            'rounded-md p-2 text-center text-xs border',
                            instance.warming_phase === p.phase
                              ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                              : 'bg-white dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800'
                          )}
                        >
                          <div className="font-medium">{p.label}</div>
                          <div>{p.limit}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Quick actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Common actions for this instance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <Link href={`/dashboard/whatsapp/messages?instance=${instanceId}`}>
                  <Button variant="outline" className="w-full justify-start">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Send Message
                  </Button>
                </Link>
                <Link href={`/dashboard/contacts?instance=${instanceId}`}>
                  <Button variant="outline" className="w-full justify-start">
                    <Users className="mr-2 h-4 w-4" />
                    View Contacts
                  </Button>
                </Link>
                <Link href={`/dashboard/whatsapp/instances/${instanceId}/settings`}>
                  <Button variant="outline" className="w-full justify-start">
                    <Webhook className="mr-2 h-4 w-4" />
                    Webhook Config
                  </Button>
                </Link>
                <Link href={`/dashboard/whatsapp/instances/${instanceId}/settings`}>
                  <Button variant="outline" className="w-full justify-start">
                    <Settings className="mr-2 h-4 w-4" />
                    Instance Settings
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Instance details */}
          <Card>
            <CardHeader>
              <CardTitle>Instance Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Instance ID</dt>
                  <dd className="text-sm font-mono">{instance.id}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Name</dt>
                  <dd className="text-sm">{instance.name}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Phone Number</dt>
                  <dd className="text-sm">{instance.phone_number || "Not connected"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">WA Account Name</dt>
                  <dd className="text-sm">{instance.wa_display_name || "-"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Webhook URL</dt>
                  <dd className="text-sm truncate">{instance.webhook_url || "Not configured"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Created At</dt>
                  <dd className="text-sm">{formatDate(instance.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Last Updated</dt>
                  <dd className="text-sm">{formatDate(instance.updated_at)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qr" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>QR Code</CardTitle>
              <CardDescription>
                Scan this QR code with WhatsApp to connect your device
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-8">
              {instance.status === "CONNECTED" ? (
                <div className="text-center">
                  <div className="rounded-full bg-green-100 p-6 mb-4 mx-auto w-fit">
                    <Check className="h-12 w-12 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Already Connected</h3>
                  <p className="text-muted-foreground mb-4">
                    Your WhatsApp is connected with {instance.phone_number}
                    {instance.wa_display_name ? ` (${instance.wa_display_name})` : ""}
                  </p>
                </div>
              ) : instance.status === "QR_READY" && qr?.qr_code ? (
                <div className="text-center">
                  <div className="bg-white p-4 rounded-lg border mb-4 inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qr.qr_code}
                      alt="WhatsApp QR Code"
                      className="w-64 h-64"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Open WhatsApp on your phone &rarr; Settings &rarr; Linked Devices &rarr; Link a Device
                  </p>
                  <p className="text-xs text-muted-foreground">
                    QR code expires in {qr.expires_in || 60} seconds
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => refetchQR()}
                    disabled={qrLoading}
                  >
                    {qrLoading ? (
                      <Spinner size="sm" className="mr-2" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Refresh QR Code
                  </Button>
                </div>
              ) : instance.status === "CONNECTING" || (instance.status === "QR_READY" && !qr?.qr_code) ? (
                <div className="text-center">
                  <Spinner size="lg" className="mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    {instance.status === "QR_READY" ? "Loading QR Code..." : "Connecting..."}
                  </h3>
                  <p className="text-muted-foreground">
                    Please wait while we establish the connection
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="rounded-full bg-muted p-6 mb-4 mx-auto w-fit">
                    <QrCode className="h-12 w-12 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Not Connected</h3>
                  <p className="text-muted-foreground mb-4">
                    Click Connect to generate a QR code
                  </p>
                  <Button
                    onClick={handleConnect}
                    disabled={connectMutation.isPending}
                  >
                    {connectMutation.isPending ? (
                      <Spinner size="sm" className="mr-2" />
                    ) : (
                      <Plug className="mr-2 h-4 w-4" />
                    )}
                    Connect
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Sync Tab */}
        <TabsContent value="sync" className="space-y-6">
          {(() => {
            const sync = syncData?.data;
            const syncStatus: HistorySyncStatus = sync?.status || 'IDLE';
            const progress = sync?.progress;
            const settings = sync?.settings;

            const syncStatusConfig: Record<HistorySyncStatus, { label: string; color: string; bgColor: string; icon: string }> = {
              IDLE: { label: 'Idle', color: 'text-gray-700', bgColor: 'bg-gray-100', icon: '⏸' },
              SYNCING: { label: 'Syncing...', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: '🔄' },
              COMPLETED: { label: 'Completed', color: 'text-green-700', bgColor: 'bg-green-100', icon: '✅' },
              FAILED: { label: 'Failed', color: 'text-red-700', bgColor: 'bg-red-100', icon: '❌' },
              PARTIAL: { label: 'Partial', color: 'text-yellow-700', bgColor: 'bg-yellow-100', icon: '⚠️' },
              STOPPED: { label: 'Stopped', color: 'text-orange-700', bgColor: 'bg-orange-100', icon: '⏹' },
            };

            const sConfig = syncStatusConfig[syncStatus];

            // Calculate elapsed time for SYNCING status
            const getElapsedTime = () => {
              if (!progress?.started_at) return null;
              const startedAt = new Date(progress.started_at).getTime();
              const endTime = progress?.completed_at
                ? new Date(progress.completed_at).getTime()
                : Date.now();
              const elapsedSec = Math.floor((endTime - startedAt) / 1000);
              const hours = Math.floor(elapsedSec / 3600);
              const minutes = Math.floor((elapsedSec % 3600) / 60);
              const seconds = elapsedSec % 60;
              if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
              if (minutes > 0) return `${minutes}m ${seconds}s`;
              return `${seconds}s`;
            };

            // Calculate a pseudo-percentage based on messages processed
            // Since WhatsApp doesn't tell us total upfront, show an indeterminate-style progress
            // that advances based on batches received (caps at 95% until completed)
            const getSyncPercentage = () => {
              if (syncStatus === 'COMPLETED') return 100;
              if (syncStatus === 'PARTIAL') return 100;
              if (syncStatus === 'STOPPED') {
                // Show progress at the point where it was stopped
                if (!progress) return 0;
                const batches = progress.batches_received || 0;
                return Math.min(95, Math.max(5, Math.round(batches * 2.5)));
              }
              if (syncStatus !== 'SYNCING' || !progress) return 0;
              // Use batches_received to estimate progress (cap at 95%)
              // Typical sync has ~20-50 batches
              const batches = progress.batches_received || 0;
              const estimated = Math.min(95, Math.round(batches * 2.5));
              return Math.max(estimated, 5); // At least 5% when syncing starts
            };

            // Check if sync is still "alive" (received a batch within last 15s)
            const isSyncAlive = () => {
              if (syncStatus !== 'SYNCING') return false;
              if (!progress?.last_batch_at) return true; // Just started
              const lastBatch = new Date(progress.last_batch_at).getTime();
              return (Date.now() - lastBatch) < 15000;
            };

            return (
              <>
                {/* Sync Status Card with Progress */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <History className="h-5 w-5" />
                      History Sync
                    </CardTitle>
                    <CardDescription>
                      Sync chat history from WhatsApp to your database
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {/* Status Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-muted-foreground">Status:</span>
                        <Badge className={cn(sConfig.bgColor, sConfig.color, "border-0 gap-1")}>
                          {syncStatus === 'SYNCING' && <Spinner size="sm" />}
                          {sConfig.label}
                        </Badge>
                      </div>
                      {syncStatus === 'SYNCING' && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className={cn(
                            "inline-block w-2 h-2 rounded-full",
                            isSyncAlive() ? "bg-green-500 animate-pulse" : "bg-yellow-500"
                          )} />
                          {isSyncAlive() ? 'Receiving data...' : 'Waiting for next batch...'}
                        </div>
                      )}
                    </div>

                    {/* ── SYNCING STATE: Full Progress Bar ── */}
                    {syncStatus === 'SYNCING' && progress && (
                      <div className="space-y-4">
                        {/* Progress Bar */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{progress.messages_inserted?.toLocaleString() || 0} messages synced</span>
                            <span>{getElapsedTime()}</span>
                          </div>
                          <div className="relative">
                            <Progress value={getSyncPercentage()} className="h-3" />
                            {/* Indeterminate shimmer overlay */}
                            <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                              <div
                                className="h-full w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_ease-in-out_infinite]"
                                style={{
                                  animation: 'shimmer 2s ease-in-out infinite',
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Live Stats Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                          <div className="rounded-lg border bg-card p-3 text-center">
                            <p className="text-xl font-bold text-primary tabular-nums">
                              {progress.total_messages_received?.toLocaleString() || 0}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">Received</p>
                          </div>
                          <div className="rounded-lg border bg-card p-3 text-center">
                            <p className="text-xl font-bold text-green-600 tabular-nums">
                              {progress.messages_inserted?.toLocaleString() || 0}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">Inserted</p>
                          </div>
                          <div className="rounded-lg border bg-card p-3 text-center">
                            <p className="text-xl font-bold text-gray-500 tabular-nums">
                              {progress.messages_skipped_duplicate?.toLocaleString() || 0}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">Duplicates</p>
                          </div>
                          <div className="rounded-lg border bg-card p-3 text-center">
                            <p className="text-xl font-bold tabular-nums">
                              {progress.contacts_synced?.toLocaleString() || 0}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">Contacts</p>
                          </div>
                          <div className="rounded-lg border bg-card p-3 text-center">
                            <p className="text-xl font-bold text-blue-600 tabular-nums">
                              {progress.messages_per_second || 0}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">msgs/sec</p>
                          </div>
                        </div>

                        {/* Meta info */}
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          {progress.started_at && (
                            <span>Started: {formatDate(progress.started_at)}</span>
                          )}
                          {progress.batches_received && (
                            <span>Batches: {progress.batches_received}</span>
                          )}
                          {(progress.batch_errors || 0) > 0 && (
                            <span className="text-red-500">Errors: {progress.batch_errors}</span>
                          )}
                        </div>

                        {/* Info callout */}
                        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 flex items-start gap-2">
                          <Activity className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                          <p className="text-xs text-blue-700">
                            Sync sedang berjalan. WhatsApp mengirim data secara bertahap dalam beberapa batch.
                            Proses ini bisa memakan waktu 1-10 menit tergantung jumlah chat.
                            Halaman ini otomatis update setiap 2 detik.
                          </p>
                        </div>

                        {/* Stop Sync Button */}
                        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-4">
                          <div>
                            <p className="text-sm font-medium text-red-800">Stop Sync</p>
                            <p className="text-xs text-red-600">
                              Hentikan sinkronisasi. Pesan yang sudah masuk tetap tersimpan.
                            </p>
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={stopSyncMutation.isPending}
                            onClick={() => stopSyncMutation.mutate(instanceId)}
                          >
                            {stopSyncMutation.isPending ? (
                              <Spinner size="sm" className="mr-2" />
                            ) : (
                              <Square className="mr-2 h-4 w-4" />
                            )}
                            Stop
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* ── COMPLETED / PARTIAL STATE ── */}
                    {(syncStatus === 'COMPLETED' || syncStatus === 'PARTIAL') && progress && (
                      <div className="space-y-3">
                        {/* Full progress bar at 100% */}
                        <Progress value={100} className={cn("h-2", syncStatus === 'PARTIAL' ? '[&>div]:bg-yellow-500' : '[&>div]:bg-green-500')} />

                        <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Messages Synced</p>
                              <p className="font-semibold">{progress.messages_inserted?.toLocaleString() || 0}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Contacts Synced</p>
                              <p className="font-semibold">{progress.contacts_synced?.toLocaleString() || 0}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Duplicates Skipped</p>
                              <p className="font-semibold">{progress.messages_skipped_duplicate?.toLocaleString() || 0}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Errors</p>
                              <p className="font-semibold">{progress.batch_errors?.toLocaleString() || 0}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                            {sync?.last_sync_at && (
                              <span>Completed: {formatDate(sync.last_sync_at)}</span>
                            )}
                            {progress.started_at && progress.completed_at && (
                              <span>Duration: {getElapsedTime()}</span>
                            )}
                            {progress.batches_received && (
                              <span>Batches: {progress.batches_received}</span>
                            )}
                          </div>
                          {progress.quota_reached && (
                            <p className="text-xs text-yellow-600 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Quota reached ({progress.quota_used?.toLocaleString()}/{progress.quota_limit?.toLocaleString()} messages)
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── FAILED STATE ── */}
                    {syncStatus === 'FAILED' && progress && (
                      <div className="space-y-3">
                        <Progress value={100} className="h-2 [&>div]:bg-red-500" />
                        {progress.error && (
                          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                            <p className="text-sm text-red-700">{progress.error}</p>
                          </div>
                        )}
                        {progress.messages_inserted > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {progress.messages_inserted.toLocaleString()} messages were synced before the error occurred.
                          </p>
                        )}
                      </div>
                    )}

                    {/* ── IDLE STATE ── */}
                    {syncStatus === 'IDLE' && (
                      <div className="space-y-4">
                        {/* Show prominent alert when sync is enabled but needs re-pair */}
                        {sync?.needs_repair && (
                          <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 space-y-3">
                            <div className="flex items-start gap-3">
                              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-yellow-800">
                                  History sync tidak aktif
                                </p>
                                <p className="text-xs text-yellow-700">
                                  Auto-sync sudah diaktifkan, tetapi fitur ini harus diaktifkan <strong>sebelum</strong> scan QR pertama kali.
                                  Karena sudah terlanjur terhubung tanpa sync, WhatsApp tidak mengirim data history.
                                </p>
                                <p className="text-xs text-yellow-700 mt-1">
                                  Klik <strong>&quot;Re-pair &amp; Sync&quot;</strong> di bawah untuk logout, lalu scan QR ulang — history sync akan mulai otomatis.
                                </p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              className="border-yellow-400 bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                              variant="outline"
                              disabled={rePairMutation.isPending}
                              onClick={() => setRePairDialogOpen(true)}
                            >
                              {rePairMutation.isPending ? (
                                <Spinner size="sm" className="mr-2" />
                              ) : (
                                <RefreshCw className="mr-2 h-4 w-4" />
                              )}
                              Re-pair &amp; Sync Sekarang
                            </Button>
                          </div>
                        )}

                        {!sync?.needs_repair && (
                          <div className="rounded-lg bg-muted/50 p-4">
                            <p className="text-sm text-muted-foreground">
                              No sync in progress. Enable &quot;Auto-sync on connect&quot; below, then connect via QR code to start syncing.
                              Or use &quot;Re-pair &amp; Sync&quot; to force a full sync.
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── STOPPED STATE ── */}
                    {syncStatus === 'STOPPED' && (
                      <div className="space-y-4">
                        {/* Frozen progress bar */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{progress?.messages_inserted?.toLocaleString() || 0} messages synced (stopped)</span>
                            {progress?.stopped_at && (
                              <span>Stopped: {formatDate(progress.stopped_at)}</span>
                            )}
                          </div>
                          <Progress value={getSyncPercentage()} className="h-3 [&>div]:bg-orange-500" />
                        </div>

                        {/* Stats at time of stop */}
                        {progress && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="rounded-lg border bg-card p-3 text-center">
                              <p className="text-xl font-bold text-primary tabular-nums">
                                {progress.total_messages_received?.toLocaleString() || 0}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">Received</p>
                            </div>
                            <div className="rounded-lg border bg-card p-3 text-center">
                              <p className="text-xl font-bold text-green-600 tabular-nums">
                                {progress.messages_inserted?.toLocaleString() || 0}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">Inserted</p>
                            </div>
                            <div className="rounded-lg border bg-card p-3 text-center">
                              <p className="text-xl font-bold text-gray-500 tabular-nums">
                                {progress.messages_skipped_duplicate?.toLocaleString() || 0}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">Duplicates</p>
                            </div>
                            <div className="rounded-lg border bg-card p-3 text-center">
                              <p className="text-xl font-bold tabular-nums">
                                {progress.contacts_synced?.toLocaleString() || 0}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">Contacts</p>
                            </div>
                          </div>
                        )}

                        {/* Resume info + button */}
                        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 space-y-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                            <div className="space-y-1">
                              <p className="text-xs text-orange-700">
                                Sinkronisasi dihentikan oleh user. Pesan yang sudah masuk tetap tersimpan di database.
                                Klik &quot;Resume&quot; untuk melanjutkan menerima batch berikutnya dari WhatsApp (jika masih tersedia).
                                Atau gunakan &quot;Re-pair &amp; Sync&quot; untuk memulai ulang dari awal.
                              </p>
                              {instance.status !== 'CONNECTED' && (
                                <p className="text-xs text-red-600 font-medium">
                                  ⚠ Instance belum terhubung. Connect terlebih dahulu sebelum resume.
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              disabled={resumeSyncMutation.isPending || instance.status !== 'CONNECTED'}
                              onClick={() => resumeSyncMutation.mutate(instanceId)}
                            >
                              {resumeSyncMutation.isPending ? (
                                <Spinner size="sm" className="mr-2" />
                              ) : (
                                <Play className="mr-2 h-4 w-4" />
                              )}
                              Resume Sync
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Sync Settings */}
                <Card>
                  <CardHeader>
                    <CardTitle>Sync Settings</CardTitle>
                    <CardDescription>
                      Configure history sync behavior. Settings must be enabled before connecting (scanning QR) for the first time.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">Auto-sync on connect</p>
                        <p className="text-xs text-muted-foreground">Automatically sync chat history when connecting via QR code</p>
                      </div>
                      <Switch
                        checked={settings?.sync_history_on_connect || false}
                        onCheckedChange={(checked) => {
                          updateSyncSettingsMutation.mutate({
                            instanceId,
                            data: { sync_history_on_connect: checked },
                          });
                        }}
                        disabled={updateSyncSettingsMutation.isPending}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Re-pair Action */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-yellow-500" />
                      Re-pair for Full Sync
                    </CardTitle>
                    <CardDescription>
                      Disconnect and re-scan QR code to trigger a full history sync. This is a destructive action — your current session will be logged out.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      variant="outline"
                      className="border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                      disabled={
                        syncStatus === 'SYNCING' ||
                        rePairMutation.isPending ||
                        stopSyncMutation.isPending ||
                        resumeSyncMutation.isPending
                      }
                      onClick={() => setRePairDialogOpen(true)}
                    >
                      {rePairMutation.isPending ? (
                        <Spinner size="sm" className="mr-2" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Re-pair &amp; Sync
                    </Button>
                  </CardContent>
                </Card>

                {/* Clear Sync Data — only show when there is data to clear */}
                {(syncStatus === 'COMPLETED' || syncStatus === 'PARTIAL' || syncStatus === 'FAILED' || syncStatus === 'STOPPED') && progress && (progress.messages_inserted || 0) > 0 && (
                  <Card className="border-red-200">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-red-700">
                        <Trash2 className="h-5 w-5" />
                        Clear Sync Data
                      </CardTitle>
                      <CardDescription>
                        Hapus <strong>semua pesan</strong> dari database (history sync &amp; realtime).
                        Gunakan ini sebelum re-pair dengan nomor baru agar chat lama tidak tercampur.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        variant="destructive"
                        disabled={clearSyncDataMutation.isPending}
                        onClick={() => setClearSyncDialogOpen(true)}
                      >
                        {clearSyncDataMutation.isPending ? (
                          <Spinner size="sm" className="mr-2" />
                        ) : (
                          <Trash2 className="mr-2 h-4 w-4" />
                        )}
                        Clear Sync Data
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Instance Settings</CardTitle>
              <CardDescription>
                Configure your WhatsApp instance settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Settings configuration coming soon...
              </p>
              <Link href={`/dashboard/whatsapp/instances/${instanceId}/settings`}>
                <Button className="mt-4">
                  <Settings className="mr-2 h-4 w-4" />
                  Go to Full Settings
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Instance</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{instance.name}&quot;? This action cannot be undone and will remove all associated data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Spinner size="sm" className="mr-2" />
              )}
              Delete Instance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear sync data confirmation dialog */}
      <Dialog open={clearSyncDialogOpen} onOpenChange={setClearSyncDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear History Sync Data</DialogTitle>
            <DialogDescription>
              Anda akan menghapus <strong>semua pesan</strong> (history sync &amp; realtime) dari database untuk instance ini.
              Sync state akan direset ke IDLE. Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setClearSyncDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                clearSyncDataMutation.mutate(instanceId);
                setClearSyncDialogOpen(false);
              }}
              disabled={clearSyncDataMutation.isPending}
            >
              {clearSyncDataMutation.isPending && (
                <Spinner size="sm" className="mr-2" />
              )}
              Delete All Sync Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Re-pair confirmation dialog */}
      <Dialog open={rePairDialogOpen} onOpenChange={setRePairDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-pair for History Sync</DialogTitle>
            <DialogDescription>
              This will <strong>log out</strong> your current WhatsApp session. You will need to scan a new QR code to reconnect. History sync will start automatically after reconnecting.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRePairDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-yellow-600 hover:bg-yellow-700"
              onClick={() => {
                rePairMutation.mutate(instanceId);
                setRePairDialogOpen(false);
                // Auto-navigate to QR tab so user knows to click Connect + scan QR
                setActiveTab("qr");
              }}
              disabled={rePairMutation.isPending}
            >
              {rePairMutation.isPending && (
                <Spinner size="sm" className="mr-2" />
              )}
              Yes, Re-pair
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
