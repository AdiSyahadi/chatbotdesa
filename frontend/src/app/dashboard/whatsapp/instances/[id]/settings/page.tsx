"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useInstance, useUpdateInstance, useDeleteInstance } from "@/hooks/use-queries";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  Save, 
  Trash2, 
  RefreshCw,
  Webhook,
  Bell,
  Shield,
} from "lucide-react";
import { toast } from "sonner";

interface InstanceSettings {
  name: string;
  webhook_url: string;
  webhook_events: {
    message_received: boolean;
    message_sent: boolean;
    message_delivered: boolean;
    message_read: boolean;
    connection_update: boolean;
    qr_update: boolean;
  };
  auto_reconnect: boolean;
  read_receipts: boolean;
}

export default function InstanceSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const instanceId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [settings, setSettings] = useState<InstanceSettings | null>(null);

  const { data: instanceData, isLoading, refetch } = useInstance(instanceId);
  const updateMutation = useUpdateInstance();
  const deleteMutation = useDeleteInstance();

  const instance = instanceData?.data;

  // Initialize settings when instance loads
  useEffect(() => {
    if (instance && !settings) {
      // Convert array format from backend to object format for UI
      const defaultEvents = {
        message_received: true,
        message_sent: true,
        message_delivered: false,
        message_read: false,
        connection_update: true,
        qr_update: true,
      };
      
      let webhookEvents = defaultEvents;
      if (instance.webhook_events) {
        if (Array.isArray(instance.webhook_events)) {
          // Backend stores as array: ['message.received', 'message.sent', ...]
          const eventMap: Record<string, string> = {
            'message.received': 'message_received',
            'message.sent': 'message_sent',
            'message.delivered': 'message_delivered',
            'message.read': 'message_read',
            'connection.update': 'connection_update',
            'qr.update': 'qr_update',
            // Also support old format
            'message': 'message_received',
            'status': 'message_sent',
            'connection': 'connection_update',
            'qr': 'qr_update',
          };
          webhookEvents = {
            message_received: false,
            message_sent: false,
            message_delivered: false,
            message_read: false,
            connection_update: false,
            qr_update: false,
          };
          (instance.webhook_events as string[]).forEach((evt: string) => {
            const uiKey = eventMap[evt];
            if (uiKey && uiKey in webhookEvents) {
              (webhookEvents as any)[uiKey] = true;
            }
          });
        } else {
          // Already object format
          webhookEvents = instance.webhook_events as any;
        }
      }

      setSettings({
        name: instance.name || "",
        webhook_url: instance.webhook_url || "",
        webhook_events: webhookEvents,
        auto_reconnect: instance.auto_reconnect ?? true,
        read_receipts: instance.read_receipts ?? true,
      });
    }
  }, [instance, settings]);

  const handleChange = <K extends keyof InstanceSettings>(
    key: K,
    value: InstanceSettings[K]
  ) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setHasChanges(true);
  };

  const handleWebhookEventChange = (event: string, value: boolean) => {
    if (!settings) return;
    setSettings({
      ...settings,
      webhook_events: {
        ...settings.webhook_events,
        [event]: value,
      },
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!settings) return;
    
    try {
      await updateMutation.mutateAsync({
        instanceId,
        data: settings as unknown as Record<string, unknown>,
      });
      setHasChanges(false);
      toast.success("Settings saved successfully");
    } catch {
      // Error handled by mutation
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

  if (isLoading) {
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

  if (!instance || !settings) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/whatsapp/instances/${instanceId}`}>
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Instance Settings</h1>
            <p className="text-muted-foreground">{instance.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || !hasChanges}
          >
            {updateMutation.isPending ? (
              <Spinner size="sm" className="mr-2" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Settings */}
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="webhook">Webhook</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                General Settings
              </CardTitle>
              <CardDescription>
                Configure the basic settings for this instance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Instance Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Customer Support"
                  value={settings.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  A friendly name to identify this instance
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Read Receipts</Label>
                  <p className="text-xs text-muted-foreground">
                    Send read receipts for incoming messages
                  </p>
                </div>
                <Switch
                  checked={settings.read_receipts}
                  onCheckedChange={(checked) => handleChange("read_receipts", checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto Reconnect</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically reconnect when connection is lost
                  </p>
                </div>
                <Switch
                  checked={settings.auto_reconnect}
                  onCheckedChange={(checked) => handleChange("auto_reconnect", checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhook" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="h-5 w-5" />
                Webhook Configuration
              </CardTitle>
              <CardDescription>
                Configure webhooks to receive real-time events
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="webhook_url">Webhook URL</Label>
                <Input
                  id="webhook_url"
                  type="url"
                  placeholder="https://your-server.com/webhook"
                  value={settings.webhook_url}
                  onChange={(e) => handleChange("webhook_url", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  URL where events will be sent via POST request
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Webhook Events
                  </Label>
                  <p className="text-xs text-muted-foreground mb-4">
                    Select which events to send to your webhook
                  </p>
                </div>

                <div className="space-y-4 pl-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Message Received</Label>
                      <p className="text-xs text-muted-foreground">
                        When a new message is received
                      </p>
                    </div>
                    <Switch
                      checked={settings.webhook_events.message_received}
                      onCheckedChange={(checked) =>
                        handleWebhookEventChange("message_received", checked)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Message Sent</Label>
                      <p className="text-xs text-muted-foreground">
                        When a message is sent successfully
                      </p>
                    </div>
                    <Switch
                      checked={settings.webhook_events.message_sent}
                      onCheckedChange={(checked) =>
                        handleWebhookEventChange("message_sent", checked)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Message Delivered</Label>
                      <p className="text-xs text-muted-foreground">
                        When a message is delivered
                      </p>
                    </div>
                    <Switch
                      checked={settings.webhook_events.message_delivered}
                      onCheckedChange={(checked) =>
                        handleWebhookEventChange("message_delivered", checked)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Message Read</Label>
                      <p className="text-xs text-muted-foreground">
                        When a message is read by recipient
                      </p>
                    </div>
                    <Switch
                      checked={settings.webhook_events.message_read}
                      onCheckedChange={(checked) =>
                        handleWebhookEventChange("message_read", checked)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm">Connection Update</Label>
                      <p className="text-xs text-muted-foreground">
                        When connection status changes
                      </p>
                    </div>
                    <Switch
                      checked={settings.webhook_events.connection_update}
                      onCheckedChange={(checked) =>
                        handleWebhookEventChange("connection_update", checked)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm">QR Code Update</Label>
                      <p className="text-xs text-muted-foreground">
                        When QR code is generated or updated
                      </p>
                    </div>
                    <Switch
                      checked={settings.webhook_events.qr_update}
                      onCheckedChange={(checked) =>
                        handleWebhookEventChange("qr_update", checked)
                      }
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6">
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <Trash2 className="h-5 w-5" />
                Danger Zone
              </CardTitle>
              <CardDescription>
                Irreversible actions that affect your instance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Delete Instance</p>
                  <p className="text-sm text-muted-foreground">
                    Permanently delete this instance and all associated data
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
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
              Are you sure you want to delete &quot;{instance.name}&quot;? This action cannot be undone and will remove all associated data including messages and contacts.
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
