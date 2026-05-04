"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  useInstances, 
  useCreateInstance, 
  useDeleteInstance,
  useConnectInstance,
  useDisconnectInstance 
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreVertical,
  QrCode,
  Settings,
  Trash2,
  Plug,
  Unplug,
  MessageSquare,
  RefreshCw,
  LayoutGrid,
  List,
  Info,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = "grid" | "list";

interface Instance {
  id: string;
  name: string;
  phone_number?: string;
  wa_display_name?: string;
  status: string;
  health_score?: number;
  daily_message_count?: number;
  daily_limit?: number;
  warming_phase?: string;
  account_age_days?: number;
  created_at: string;
}

const warmingPhaseLabel: Record<string, string> = {
  DAY_1_3: 'Hari 1-3',
  DAY_4_7: 'Hari 4-7',
  DAY_8_14: 'Hari 8-14',
  DAY_15_PLUS: 'Matang',
};

const warmingPhaseInfo: Record<string, { limit: number; next: string }> = {
  DAY_1_3: { limit: 100, next: 'Naik ke 300/hari di hari ke-4' },
  DAY_4_7: { limit: 300, next: 'Naik ke 600/hari di hari ke-8' },
  DAY_8_14: { limit: 600, next: 'Naik ke 1.000/hari di hari ke-15' },
  DAY_15_PLUS: { limit: 1000, next: 'Limit maksimal tercapai' },
};

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  CONNECTED: { label: "Connected", color: "text-green-700", bgColor: "bg-green-100" },
  DISCONNECTED: { label: "Disconnected", color: "text-gray-700", bgColor: "bg-gray-100" },
  CONNECTING: { label: "Connecting", color: "text-yellow-700", bgColor: "bg-yellow-100" },
  QR_READY: { label: "Scan QR", color: "text-blue-700", bgColor: "bg-blue-100" },
  BANNED: { label: "Banned", color: "text-red-700", bgColor: "bg-red-100" },
};

export default function InstancesPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [instanceToDelete, setInstanceToDelete] = useState<string | null>(null);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [newInstanceWebhook, setNewInstanceWebhook] = useState("");

  const { data, isLoading, refetch } = useInstances();
  const createMutation = useCreateInstance();
  const deleteMutation = useDeleteInstance();
  const connectMutation = useConnectInstance();
  const disconnectMutation = useDisconnectInstance();

  const instances: Instance[] = data?.data || [];

  const handleCreate = async () => {
    if (!newInstanceName.trim()) return;
    
    try {
      await createMutation.mutateAsync({
        name: newInstanceName.trim(),
        webhook_url: newInstanceWebhook.trim() || undefined,
      });
      setCreateDialogOpen(false);
      setNewInstanceName("");
      setNewInstanceWebhook("");
    } catch {
      // Error handled by mutation
    }
  };

  const handleDelete = async () => {
    if (!instanceToDelete) return;
    
    try {
      await deleteMutation.mutateAsync(instanceToDelete);
      setDeleteDialogOpen(false);
      setInstanceToDelete(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleConnect = async (id: string) => {
    try {
      await connectMutation.mutateAsync(id);
    } catch {
      // Error handled by mutation onError
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await disconnectMutation.mutateAsync(id);
    } catch {
      // Error handled by mutation onError
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp Instances</h1>
          <p className="text-muted-foreground">
            Manage your WhatsApp connections
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <div className="flex border rounded-lg">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Instance
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create WhatsApp Instance</DialogTitle>
                <DialogDescription>
                  Create a new WhatsApp instance to connect your device.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Instance Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., CS Support"
                    value={newInstanceName}
                    onChange={(e) => setNewInstanceName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="webhook">Webhook URL (optional)</Label>
                  <Input
                    id="webhook"
                    placeholder="https://your-server.com/webhook"
                    value={newInstanceWebhook}
                    onChange={(e) => setNewInstanceWebhook(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending || !newInstanceName.trim()}
                >
                  {createMutation.isPending && (
                    <Spinner size="sm" className="mr-2" />
                  )}
                  Create Instance
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Warming phase info banner — show if any instance is not yet at max phase */}
      {instances.some((i) => i.warming_phase && i.warming_phase !== 'DAY_15_PLUS') && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">
                  Sistem Warming — Limit pesan naik otomatis
                </p>
                <p className="text-sm text-muted-foreground">
                  Untuk menjaga keamanan nomor WhatsApp Anda, limit pengiriman dinaikkan bertahap secara otomatis. Tidak perlu tindakan apapun.
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <TrendingUp className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm text-foreground">Hari 1-3: <strong>100</strong>/hari</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-sm text-foreground">Hari 4-7: <strong>300</strong>/hari</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-sm text-foreground">Hari 8-14: <strong>600</strong>/hari</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-sm text-foreground">Hari 15+: <strong>1.000</strong>/hari</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instances list/grid */}
      {isLoading ? (
        <div className={cn(
          "grid gap-4",
          viewMode === "grid" ? "md:grid-cols-2 lg:grid-cols-3" : ""
        )}>
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : instances.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No instances yet</h3>
            <p className="text-muted-foreground mb-4 text-center max-w-sm">
              Create your first WhatsApp instance to start sending messages.
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Instance
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {instances.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              onConnect={() => handleConnect(instance.id)}
              onDisconnect={() => handleDisconnect(instance.id)}
              onDelete={() => {
                setInstanceToDelete(instance.id);
                setDeleteDialogOpen(true);
              }}
            />
          ))}
        </div>
      ) : (
        <Card>
          <div className="divide-y">
            {instances.map((instance) => (
              <InstanceRow
                key={instance.id}
                instance={instance}
                onConnect={() => handleConnect(instance.id)}
                onDisconnect={() => handleDisconnect(instance.id)}
                onDelete={() => {
                  setInstanceToDelete(instance.id);
                  setDeleteDialogOpen(true);
                }}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Instance</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this instance? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setInstanceToDelete(null);
              }}
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
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface InstanceCardProps {
  instance: Instance;
  onConnect: () => void;
  onDisconnect: () => void;
  onDelete: () => void;
}

function InstanceCard({ instance, onConnect, onDisconnect, onDelete }: InstanceCardProps) {
  const status = statusConfig[instance.status] || statusConfig.DISCONNECTED;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{instance.name}</CardTitle>
          <CardDescription>
            {instance.phone_number || "Not connected"}
            {instance.wa_display_name ? ` • ${instance.wa_display_name}` : ""}
          </CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/whatsapp/instances/${instance.id}`}>
                <QrCode className="mr-2 h-4 w-4" />
                View QR Code
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/whatsapp/instances/${instance.id}/settings`}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {instance.status === "CONNECTED" ? (
              <DropdownMenuItem onClick={onDisconnect}>
                <Unplug className="mr-2 h-4 w-4" />
                Disconnect
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onConnect}>
                <Plug className="mr-2 h-4 w-4" />
                Connect
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <Badge className={cn(status.bgColor, status.color, "border-0")}>
            <span
              className={cn(
                "mr-1.5 h-2 w-2 rounded-full",
                instance.status === "CONNECTED" && "bg-green-500",
                instance.status === "DISCONNECTED" && "bg-gray-400",
                instance.status === "CONNECTING" && "bg-yellow-500 animate-pulse",
                instance.status === "QR_READY" && "bg-blue-500",
                instance.status === "BANNED" && "bg-red-500"
              )}
            />
            {status.label}
          </Badge>
          {instance.warming_phase && (
            <div className="text-right">
              <span className="text-xs text-muted-foreground">
                {warmingPhaseLabel[instance.warming_phase] ?? instance.warming_phase}
              </span>
              {instance.warming_phase !== 'DAY_15_PLUS' && warmingPhaseInfo[instance.warming_phase] && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  {warmingPhaseInfo[instance.warming_phase].next}
                </p>
              )}
            </div>
          )}
          {instance.status === "QR_READY" && (
            <Link href={`/dashboard/whatsapp/instances/${instance.id}`}>
              <Button size="sm">
                <QrCode className="mr-2 h-4 w-4" />
                Scan QR
              </Button>
            </Link>
          )}
        </div>

        {/* Health score bar */}
        {instance.health_score !== undefined && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Health</span>
              <span
                className={cn(
                  instance.health_score >= 70 ? 'text-green-600' :
                  instance.health_score >= 40 ? 'text-yellow-600' : 'text-red-600'
                )}
              >
                {instance.health_score}/100
              </span>
            </div>
            <Progress
              value={instance.health_score}
              className={cn(
                'h-1.5',
                instance.health_score >= 70 ? '[&>div]:bg-green-500' :
                instance.health_score >= 40 ? '[&>div]:bg-yellow-500' : '[&>div]:bg-red-500'
              )}
            />
          </div>
        )}

        {/* Daily message usage */}
        {instance.daily_limit !== undefined && (
          <p className="text-xs text-muted-foreground">
            Pesan hari ini:{' '}
            <span className="font-medium text-foreground">
              {instance.daily_message_count ?? 0} / {instance.daily_limit}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function InstanceRow({ instance, onConnect, onDisconnect, onDelete }: InstanceCardProps) {
  const status = statusConfig[instance.status] || statusConfig.DISCONNECTED;

  return (
    <div className="flex items-center justify-between p-4">
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "h-3 w-3 rounded-full",
            instance.status === "CONNECTED" && "bg-green-500",
            instance.status === "DISCONNECTED" && "bg-gray-400",
            instance.status === "CONNECTING" && "bg-yellow-500 animate-pulse",
            instance.status === "QR_READY" && "bg-blue-500",
            instance.status === "BANNED" && "bg-red-500"
          )}
        />
        <div>
          <p className="font-medium">{instance.name}</p>
          <p className="text-sm text-muted-foreground">
            {instance.phone_number || "Not connected"}
            {instance.wa_display_name ? ` • ${instance.wa_display_name}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Badge className={cn(status.bgColor, status.color, "border-0")}>
          {status.label}
        </Badge>
        {instance.health_score !== undefined && (
          <span
            className={cn(
              'text-xs font-medium',
              instance.health_score >= 70 ? 'text-green-600' :
              instance.health_score >= 40 ? 'text-yellow-600' : 'text-red-600'
            )}
          >
            ♥ {instance.health_score}
          </span>
        )}
        {instance.daily_limit !== undefined && (
          <span className="text-xs text-muted-foreground">
            {instance.daily_message_count ?? 0}/{instance.daily_limit} msg
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/whatsapp/instances/${instance.id}`}>
                <QrCode className="mr-2 h-4 w-4" />
                View QR Code
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/whatsapp/instances/${instance.id}/settings`}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {instance.status === "CONNECTED" ? (
              <DropdownMenuItem onClick={onDisconnect}>
                <Unplug className="mr-2 h-4 w-4" />
                Disconnect
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onConnect}>
                <Plug className="mr-2 h-4 w-4" />
                Connect
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
