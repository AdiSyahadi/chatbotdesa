"use client";

import { useState } from "react";
import { useBroadcasts, useInstances, useCreateBroadcast, useDeleteBroadcast, useStartBroadcast, usePauseBroadcast, useCancelBroadcast } from "@/hooks/use-queries";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
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
  Radio,
  Filter,
  MoreHorizontal,
  Play,
  Pause,
  XCircle,
  Eye,
  Trash2,
  Clock,
  CheckCircle,
  AlertCircle,
  Send,
  Users,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

interface Broadcast {
  id: string;
  name: string;
  instance_id: string;
  instance_name?: string;
  message_type: string;
  message_content: { text?: string; caption?: string };
  status: string;
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  created_at: string;
}

interface Instance {
  id: string;
  name: string;
  status: string;
}

const statusConfig: Record<string, { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  DRAFT: { label: "Draft", icon: <Clock className="h-3 w-3" />, color: "text-gray-700", bgColor: "bg-gray-100" },
  SCHEDULED: { label: "Scheduled", icon: <Clock className="h-3 w-3" />, color: "text-blue-700", bgColor: "bg-blue-100" },
  RUNNING: { label: "Running", icon: <Play className="h-3 w-3" />, color: "text-green-700", bgColor: "bg-green-100" },
  PAUSED: { label: "Paused", icon: <Pause className="h-3 w-3" />, color: "text-yellow-700", bgColor: "bg-yellow-100" },
  COMPLETED: { label: "Completed", icon: <CheckCircle className="h-3 w-3" />, color: "text-green-700", bgColor: "bg-green-100" },
  CANCELLED: { label: "Cancelled", icon: <XCircle className="h-3 w-3" />, color: "text-red-700", bgColor: "bg-red-100" },
  FAILED: { label: "Failed", icon: <AlertCircle className="h-3 w-3" />, color: "text-red-700", bgColor: "bg-red-100" },
};

export default function BroadcastPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [broadcastToDelete, setBroadcastToDelete] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [filterInstanceId, setFilterInstanceId] = useState("__all__");
  const [page, setPage] = useState(1);

  // Form state
  const [formName, setFormName] = useState("");
  const [formInstanceId, setFormInstanceId] = useState("");
  const [formMessage, setFormMessage] = useState("");

  const { data: instancesData } = useInstances();
  const { data, isLoading, refetch } = useBroadcasts({
    page,
    limit: 20,
    status: filterStatus === "__all__" ? undefined : filterStatus,
    instanceId: filterInstanceId === "__all__" ? undefined : filterInstanceId,
  });
  
  const createMutation = useCreateBroadcast();
  const deleteMutation = useDeleteBroadcast();
  const startMutation = useStartBroadcast();
  const pauseMutation = usePauseBroadcast();
  const cancelMutation = useCancelBroadcast();

  const instances: Instance[] = instancesData?.data || [];
  const broadcasts: Broadcast[] = data?.data || [];
  const pagination = data?.pagination;

  const connectedInstances = instances.filter((i) => i.status === "CONNECTED");

  const handleCreate = async () => {
    if (!formName || !formInstanceId || !formMessage) return;

    try {
      await createMutation.mutateAsync({
        name: formName,
        instance_id: formInstanceId,
        message_type: "text",
        message_content: { text: formMessage },
      });
      setCreateDialogOpen(false);
      setFormName("");
      setFormInstanceId("");
      setFormMessage("");
    } catch {
      // Error handled by mutation
    }
  };

  const handleDelete = async () => {
    if (!broadcastToDelete) return;
    try {
      await deleteMutation.mutateAsync(broadcastToDelete);
      setDeleteDialogOpen(false);
      setBroadcastToDelete(null);
    } catch {
      // Error handled by mutation
    }
  };

  const getProgress = (broadcast: Broadcast) => {
    if (broadcast.total_recipients === 0) return 0;
    return Math.round((broadcast.sent_count / broadcast.total_recipients) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Broadcast</h1>
          <p className="text-muted-foreground">
            Kirim pesan massal ke banyak kontak sekaligus
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={connectedInstances.length === 0}>
                <Plus className="mr-2 h-4 w-4" />
                Buat Broadcast
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Buat Broadcast Baru</DialogTitle>
                <DialogDescription>
                  Buat broadcast untuk mengirim pesan ke banyak kontak
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nama Broadcast</Label>
                  <Input
                    id="name"
                    placeholder="Promo Akhir Tahun"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
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
                      {connectedInstances.map((instance) => (
                        <SelectItem key={instance.id} value={instance.id}>
                          {instance.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">Pesan</Label>
                  <Textarea
                    id="message"
                    placeholder="Tulis pesan broadcast..."
                    rows={4}
                    value={formMessage}
                    onChange={(e) => setFormMessage(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                >
                  Batal
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={
                    createMutation.isPending ||
                    !formName ||
                    !formInstanceId ||
                    !formMessage
                  }
                >
                  {createMutation.isPending && (
                    <Spinner size="sm" className="mr-2" />
                  )}
                  Buat Broadcast
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
            <div className="w-40">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Semua status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua status</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                  <SelectItem value="RUNNING">Running</SelectItem>
                  <SelectItem value="PAUSED">Paused</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Broadcasts table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : broadcasts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Radio className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Belum Ada Broadcast</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
              Buat broadcast pertama Anda untuk mengirim pesan ke banyak kontak sekaligus
            </p>
            <Button onClick={() => setCreateDialogOpen(true)} disabled={connectedInstances.length === 0}>
              <Plus className="mr-2 h-4 w-4" />
              Buat Broadcast
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Instance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Penerima</TableHead>
                <TableHead>Dibuat</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broadcasts.map((broadcast) => {
                const status = statusConfig[broadcast.status] || statusConfig.DRAFT;
                const progress = getProgress(broadcast);

                return (
                  <TableRow key={broadcast.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{broadcast.name}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {broadcast.message_content?.text || "No message"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {broadcast.instance_name || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn("gap-1", status.bgColor, status.color)}
                      >
                        {status.icon}
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="w-24">
                        <Progress value={progress} className="h-2" />
                        <span className="text-xs text-muted-foreground">
                          {broadcast.sent_count}/{broadcast.total_recipients}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <Users className="h-3 w-3" />
                        {broadcast.total_recipients}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(broadcast.created_at)}
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
                          <DropdownMenuItem>
                            <Eye className="mr-2 h-4 w-4" />
                            Detail
                          </DropdownMenuItem>
                          {broadcast.status === "DRAFT" && (
                            <DropdownMenuItem
                              onClick={() => startMutation.mutate(broadcast.id)}
                            >
                              <Play className="mr-2 h-4 w-4" />
                              Mulai
                            </DropdownMenuItem>
                          )}
                          {broadcast.status === "RUNNING" && (
                            <DropdownMenuItem
                              onClick={() => pauseMutation.mutate(broadcast.id)}
                            >
                              <Pause className="mr-2 h-4 w-4" />
                              Jeda
                            </DropdownMenuItem>
                          )}
                          {broadcast.status === "PAUSED" && (
                            <>
                              <DropdownMenuItem
                                onClick={() => startMutation.mutate(broadcast.id)}
                              >
                                <Play className="mr-2 h-4 w-4" />
                                Lanjutkan
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => cancelMutation.mutate(broadcast.id)}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Batalkan
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              setBroadcastToDelete(broadcast.id);
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
                );
              })}
            </TableBody>
          </Table>

          {/* Pagination */}
          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t">
              <p className="text-sm text-muted-foreground">
                Menampilkan {broadcasts.length} dari {pagination.total} broadcast
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

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Broadcast</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus broadcast ini? Tindakan ini tidak dapat dibatalkan.
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
