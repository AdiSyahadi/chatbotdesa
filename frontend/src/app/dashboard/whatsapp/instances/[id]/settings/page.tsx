"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useInstance,
  useUpdateInstance,
  useDeleteInstance,
  useWebhooks,
  useCreateWebhook,
  useDeleteWebhook,
  useTestWebhook,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Save, Trash2, RefreshCw, Webhook, Shield, Plus, Send } from "lucide-react";
import { toast } from "sonner";

interface InstanceSettings {
  name: string;
  auto_reconnect: boolean;
  read_receipts: boolean;
}

interface WebhookTarget {
  id: string;
  instance_id: string;
  label: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
}

const WEBHOOK_EVENTS = [
  { value: "message.received", label: "Pesan Diterima" },
  { value: "message.sent", label: "Pesan Terkirim" },
  { value: "message.delivered", label: "Pesan Terdelivery" },
  { value: "message.read", label: "Pesan Dibaca" },
  { value: "message.failed", label: "Pesan Gagal" },
  { value: "connection.connected", label: "Terkoneksi" },
  { value: "connection.disconnected", label: "Terputus" },
  { value: "qr.updated", label: "QR Code Update" },
];

export default function InstanceSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const instanceId = params.id as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [settings, setSettings] = useState<InstanceSettings | null>(null);

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [formLabel, setFormLabel] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetDialogOpen, setDeleteTargetDialogOpen] = useState(false);

  const { data: instanceData, isLoading, refetch } = useInstance(instanceId);
  const updateMutation = useUpdateInstance();
  const deleteMutation = useDeleteInstance();

  const { data: webhookData, refetch: refetchWebhooks } = useWebhooks({ instanceId });
  const createWebhookMutation = useCreateWebhook();
  const deleteWebhookMutation = useDeleteWebhook();
  const testWebhookMutation = useTestWebhook();

  const instance = instanceData?.data;
  const webhookTargets: WebhookTarget[] = webhookData?.data || [];

  useEffect(() => {
    if (instance && !settings) {
      setSettings({
        name: instance.name || "",
        auto_reconnect: instance.auto_reconnect ?? true,
        read_receipts: instance.read_receipts ?? true,
      });
    }
  }, [instance, settings]);

  const handleChange = <K extends keyof InstanceSettings>(key: K, value: InstanceSettings[K]) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!settings) return;
    try {
      await updateMutation.mutateAsync({ instanceId, data: settings as unknown as Record<string, unknown> });
      setHasChanges(false);
    } catch { /* handled by mutation */ }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(instanceId);
      router.push("/dashboard/whatsapp/instances");
    } catch { /* handled by mutation */ }
  };

  const toggleEvent = (evt: string) =>
    setFormEvents((prev) => prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt]);

  const resetWebhookForm = () => { setFormLabel(""); setFormUrl(""); setFormEvents([]); };

  const handleAddTarget = async () => {
    if (!formLabel || !formUrl || formEvents.length === 0) return;
    try {
      await createWebhookMutation.mutateAsync({ instance_id: instanceId, label: formLabel, url: formUrl, events: formEvents });
      setAddDialogOpen(false);
      resetWebhookForm();
      refetchWebhooks();
    } catch { /* handled by mutation */ }
  };

  const handleDeleteTarget = async () => {
    if (!deleteTargetId) return;
    try {
      await deleteWebhookMutation.mutateAsync(deleteTargetId);
      setDeleteTargetDialogOpen(false);
      setDeleteTargetId(null);
      refetchWebhooks();
    } catch { /* handled by mutation */ }
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
          <p className="text-muted-foreground mb-4">The instance you&apos;re looking for doesn&apos;t exist.</p>
          <Link href="/dashboard/whatsapp/instances">
            <Button><ArrowLeft className="mr-2 h-4 w-4" />Back to Instances</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/whatsapp/instances/${instanceId}`}>
            <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Instance Settings</h1>
            <p className="text-muted-foreground">{instance.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending || !hasChanges}>
            {updateMutation.isPending ? <Spinner size="sm" className="mr-2" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="webhook">Webhook</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />General Settings</CardTitle>
              <CardDescription>Configure the basic settings for this instance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Instance Name</Label>
                <Input id="name" placeholder="e.g., Customer Support" value={settings.name} onChange={(e) => handleChange("name", e.target.value)} />
                <p className="text-xs text-muted-foreground">A friendly name to identify this instance</p>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Read Receipts</Label>
                  <p className="text-xs text-muted-foreground">Send read receipts for incoming messages</p>
                </div>
                <Switch checked={settings.read_receipts} onCheckedChange={(c) => handleChange("read_receipts", c)} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto Reconnect</Label>
                  <p className="text-xs text-muted-foreground">Automatically reconnect when connection is lost</p>
                </div>
                <Switch checked={settings.auto_reconnect} onCheckedChange={(c) => handleChange("auto_reconnect", c)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="webhook" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Webhook className="h-5 w-5" />Webhook Targets</CardTitle>
                  <CardDescription>Kirim event ke satu atau lebih endpoint secara bersamaan</CardDescription>
                </div>
                <Button size="sm" onClick={() => setAddDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Tambah Target</Button>
              </div>
            </CardHeader>
            <CardContent>
              {webhookTargets.length === 0 ? (
                <div className="text-center py-10">
                  <Webhook className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Belum ada webhook target. Klik &quot;Tambah Target&quot; untuk menambah.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {webhookTargets.map((target) => (
                    <div key={target.id} className="flex items-start justify-between p-3 border rounded-lg">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{target.label}</span>
                          <Badge variant="secondary" className={target.is_active ? "bg-green-100 text-green-700 text-xs" : "bg-gray-100 text-gray-500 text-xs"}>
                            {target.is_active ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono truncate">{target.url}</p>
                        <div className="flex flex-wrap gap-1 pt-1">
                          {target.events.slice(0, 3).map((evt) => (
                            <Badge key={evt} variant="outline" className="text-xs">{evt.split(".")[1] || evt}</Badge>
                          ))}
                          {target.events.length > 3 && <Badge variant="outline" className="text-xs">+{target.events.length - 3}</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 ml-3 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Test webhook" disabled={testWebhookMutation.isPending} onClick={() => testWebhookMutation.mutate(target.id)}>
                          <Send className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Hapus target" onClick={() => { setDeleteTargetId(target.id); setDeleteTargetDialogOpen(true); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6">
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2"><Trash2 className="h-5 w-5" />Danger Zone</CardTitle>
              <CardDescription>Irreversible actions that affect your instance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Delete Instance</p>
                  <p className="text-sm text-muted-foreground">Permanently delete this instance and all associated data</p>
                </div>
                <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Tambah Webhook Target</DialogTitle>
            <DialogDescription>Tambah endpoint yang akan menerima event dari instance ini</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="wt-label">Label</Label>
              <Input id="wt-label" placeholder="Contoh: CRM Dashboard, Chatbot" value={formLabel} onChange={(e) => setFormLabel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wt-url">Webhook URL</Label>
              <Input id="wt-url" placeholder="https://example.com/webhook" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Events</Label>
              <div className="grid grid-cols-2 gap-2">
                {WEBHOOK_EVENTS.map((event) => (
                  <div key={event.value} className="flex items-center space-x-2">
                    <Checkbox id={`wt-${event.value}`} checked={formEvents.includes(event.value)} onCheckedChange={() => toggleEvent(event.value)} />
                    <label htmlFor={`wt-${event.value}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{event.label}</label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialogOpen(false); resetWebhookForm(); }}>Batal</Button>
            <Button onClick={handleAddTarget} disabled={createWebhookMutation.isPending || !formLabel || !formUrl || formEvents.length === 0}>
              {createWebhookMutation.isPending && <Spinner size="sm" className="mr-2" />}Tambah
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTargetDialogOpen} onOpenChange={setDeleteTargetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Webhook Target</DialogTitle>
            <DialogDescription>Apakah Anda yakin ingin menghapus webhook target ini? Event tidak akan lagi dikirim ke URL tersebut.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTargetDialogOpen(false); setDeleteTargetId(null); }}>Batal</Button>
            <Button variant="destructive" onClick={handleDeleteTarget} disabled={deleteWebhookMutation.isPending}>
              {deleteWebhookMutation.isPending && <Spinner size="sm" className="mr-2" />}Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Instance</DialogTitle>
            <DialogDescription>Are you sure you want to delete this instance? This action cannot be undone and will remove all associated data.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Spinner size="sm" className="mr-2" />}Delete Instance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}