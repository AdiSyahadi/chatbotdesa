"use client";

import { useState } from "react";
import { useWebhooks, useInstances, useCreateWebhook, useUpdateWebhook, useDeleteWebhook, useTestWebhook } from "@/hooks/use-queries";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  RefreshCw,
  Webhook,
  Filter,
  MoreHorizontal,
  Pencil,
  Trash2,
  Send,
  CheckCircle,
  XCircle,
  Globe,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

interface WebhookType {
  id: string;
  instance_id: string;
  instance_name?: string;
  label: string;
  url: string;
  events: string[];
  is_active: boolean;
  secret?: string;
  last_triggered_at?: string;
  created_at: string;
}

interface Instance {
  id: string;
  name: string;
  status: string;
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

export default function WebhooksPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [webhookToEdit, setWebhookToEdit] = useState<WebhookType | null>(null);
  const [webhookToDelete, setWebhookToDelete] = useState<string | null>(null);
  const [filterInstanceId, setFilterInstanceId] = useState("__all__");
  const [page, setPage] = useState(1);

  // Form state
  const [formInstanceId, setFormInstanceId] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);

  const { data: instancesData } = useInstances();
  const { data, isLoading, refetch } = useWebhooks({
    page,
    limit: 20,
    instanceId: filterInstanceId === "__all__" ? undefined : filterInstanceId,
  });

  const createMutation = useCreateWebhook();
  const updateMutation = useUpdateWebhook();
  const deleteMutation = useDeleteWebhook();
  const testMutation = useTestWebhook();

  const instances: Instance[] = instancesData?.data || [];
  const webhooks: WebhookType[] = data?.data || [];
  const pagination = data?.pagination;

  const handleCreate = async () => {
    if (!formInstanceId || !formLabel || !formUrl || formEvents.length === 0) return;

    try {
      await createMutation.mutateAsync({
        instance_id: formInstanceId,
        label: formLabel,
        url: formUrl,
        events: formEvents,
      });
      setCreateDialogOpen(false);
      resetForm();
    } catch {
      // Error handled by mutation
    }
  };

  const handleEdit = async () => {
    if (!webhookToEdit || !formUrl || formEvents.length === 0) return;

    try {
      await updateMutation.mutateAsync({
        id: webhookToEdit.id,
        data: {
          label: formLabel || undefined,
          url: formUrl,
          events: formEvents,
        },
      });
      setEditDialogOpen(false);
      setWebhookToEdit(null);
      resetForm();
    } catch {
      // Error handled by mutation
    }
  };

  const handleDelete = async () => {
    if (!webhookToDelete) return;
    try {
      await deleteMutation.mutateAsync(webhookToDelete);
      setDeleteDialogOpen(false);
      setWebhookToDelete(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleToggleActive = async (webhook: WebhookType) => {
    try {
      await updateMutation.mutateAsync({
        id: webhook.id,
        data: { is_active: !webhook.is_active },
      });
    } catch {
      // Error handled by mutation
    }
  };

  const openEditDialog = (webhook: WebhookType) => {
    setWebhookToEdit(webhook);
    setFormLabel(webhook.label || "");
    setFormUrl(webhook.url);
    setFormEvents(webhook.events);
    setEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormInstanceId("");
    setFormLabel("");
    setFormUrl("");
    setFormEvents([]);
  };

  const toggleEvent = (event: string) => {
    setFormEvents((prev) =>
      prev.includes(event)
        ? prev.filter((e) => e !== event)
        : [...prev, event]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Webhooks</h1>
          <p className="text-muted-foreground">
            Kelola webhook untuk menerima notifikasi real-time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={instances.length === 0}>
                <Plus className="mr-2 h-4 w-4" />
                Tambah Webhook
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Tambah Webhook Baru</DialogTitle>
                <DialogDescription>
                  Tambah webhook untuk menerima notifikasi event
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="instance">Instance</Label>
                  <Select
                    value={formInstanceId}
                    onValueChange={setFormInstanceId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih instance" />
                    </SelectTrigger>
                    <SelectContent>
                      {instances.map((instance) => (
                        <SelectItem key={instance.id} value={instance.id}>
                          {instance.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="label">Label</Label>
                  <Input
                    id="label"
                    placeholder="Contoh: CRM Dashboard, Chatbot"
                    value={formLabel}
                    onChange={(e) => setFormLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="url">Webhook URL</Label>
                  <Input
                    id="url"
                    placeholder="https://example.com/webhook"
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Events</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {WEBHOOK_EVENTS.map((event) => (
                      <div
                        key={event.value}
                        className="flex items-center space-x-2"
                      >
                        <Checkbox
                          id={event.value}
                          checked={formEvents.includes(event.value)}
                          onCheckedChange={() => toggleEvent(event.value)}
                        />
                        <label
                          htmlFor={event.value}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {event.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCreateDialogOpen(false);
                    resetForm();
                  }}
                >
                  Batal
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={
                    createMutation.isPending ||
                    !formInstanceId ||
                    !formLabel ||
                    !formUrl ||
                    formEvents.length === 0
                  }
                >
                  {createMutation.isPending && (
                    <Spinner size="sm" className="mr-2" />
                  )}
                  Tambah Webhook
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="w-48">
              <Label className="text-xs text-muted-foreground">Instance</Label>
              <Select
                value={filterInstanceId}
                onValueChange={setFilterInstanceId}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Semua instance" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua instance</SelectItem>
                  {instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      {instance.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Webhooks table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : webhooks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Webhook className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Belum Ada Webhook</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
              Tambahkan webhook untuk menerima notifikasi real-time saat ada event WhatsApp
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} disabled={instances.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Tambah Webhook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Instance</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Terakhir Trigger</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((webhook) => (
                <TableRow key={webhook.id}>
                  <TableCell>
                    <span className="text-sm font-medium">{webhook.label || "-"}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono text-sm truncate max-w-[250px]">
                        {webhook.url}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {webhook.instance_name || "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(webhook.events || []).slice(0, 2).map((event) => (
                        <Badge key={event} variant="secondary" className="text-xs">
                          {event.split(".")[1] || event}
                        </Badge>
                      ))}
                      {(webhook.events || []).length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{webhook.events.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={webhook.is_active}
                        onCheckedChange={() => handleToggleActive(webhook)}
                        disabled={updateMutation.isPending}
                      />
                      <Badge
                        variant="secondary"
                        className={cn(
                          webhook.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-700"
                        )}
                      >
                        {webhook.is_active ? (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Active
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3 mr-1" />
                            Inactive
                          </>
                        )}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {webhook.last_triggered_at
                        ? formatDate(webhook.last_triggered_at)
                        : "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => testMutation.mutate(webhook.id)}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          Test Webhook
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openEditDialog(webhook)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            setWebhookToDelete(webhook.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Hapus
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t">
              <p className="text-sm text-muted-foreground">
                Menampilkan {webhooks.length} dari {pagination.total} webhook
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Sebelumnya
                </Button>
                <span className="text-sm">
                  Halaman {page} dari {pagination.total_pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= pagination.total_pages}
                >
                  Selanjutnya
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Edit dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Webhook</DialogTitle>
            <DialogDescription>
              Perbarui konfigurasi webhook
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-label">Label</Label>
              <Input
                id="edit-label"
                placeholder="Contoh: CRM Dashboard, Chatbot"
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-url">Webhook URL</Label>
              <Input
                id="edit-url"
                placeholder="https://example.com/webhook"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Events</Label>
              <div className="grid grid-cols-2 gap-2">
                {WEBHOOK_EVENTS.map((event) => (
                  <div
                    key={event.value}
                    className="flex items-center space-x-2"
                  >
                    <Checkbox
                      id={`edit-${event.value}`}
                      checked={formEvents.includes(event.value)}
                      onCheckedChange={() => toggleEvent(event.value)}
                    />
                    <label
                      htmlFor={`edit-${event.value}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {event.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                setWebhookToEdit(null);
                resetForm();
              }}
            >
              Batal
            </Button>
            <Button
              onClick={handleEdit}
              disabled={
                updateMutation.isPending ||
                !formUrl ||
                formEvents.length === 0
              }
            >
              {updateMutation.isPending && (
                <Spinner size="sm" className="mr-2" />
              )}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Webhook</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus webhook ini? Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Spinner size="sm" className="mr-2" />
              )}
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
