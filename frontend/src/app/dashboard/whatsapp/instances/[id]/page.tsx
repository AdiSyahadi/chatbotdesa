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
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  CONNECTED: { label: "Connected", color: "text-green-700", bgColor: "bg-green-100" },
  DISCONNECTED: { label: "Disconnected", color: "text-gray-700", bgColor: "bg-gray-100" },
  CONNECTING: { label: "Connecting", color: "text-yellow-700", bgColor: "bg-yellow-100" },
  QR_READY: { label: "Scan QR", color: "text-blue-700", bgColor: "bg-blue-100" },
  BANNED: { label: "Banned", color: "text-red-700", bgColor: "bg-red-100" },
};

export default function InstanceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const instanceId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: instanceData, isLoading: instanceLoading, refetch: refetchInstance } = useInstance(instanceId);
  const { data: qrData, isLoading: qrLoading, refetch: refetchQR } = useInstanceQr(instanceId);
  const connectMutation = useConnectInstance();
  const disconnectMutation = useDisconnectInstance();
  const deleteMutation = useDeleteInstance();

  const instance = instanceData?.data;
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

  // Auto-refresh QR code when needed
  useEffect(() => {
    if (instance?.status === "QR_READY") {
      const interval = setInterval(() => {
        refetchQR();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [instance?.status, refetchQR]);

  const handleConnect = async () => {
    await connectMutation.mutateAsync(instanceId);
  };

  const handleDisconnect = async () => {
    await disconnectMutation.mutateAsync(instanceId);
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(instanceId);
      router.push("/dashboard/whatsapp/instances");
    } catch {
      // Error handled by mutation
    }
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(instanceId);
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
                    instance.status === "BANNED" && "bg-red-500"
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
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="qr">QR Code</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-4">
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
                  {instance.messages_today || 0}
                </div>
              </CardContent>
            </Card>
          </div>

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
              ) : instance.status === "CONNECTING" ? (
                <div className="text-center">
                  <Spinner size="lg" className="mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Connecting...</h3>
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
    </div>
  );
}
