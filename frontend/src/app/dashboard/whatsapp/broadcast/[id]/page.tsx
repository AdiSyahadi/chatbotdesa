"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useBroadcast, useBroadcastRecipients, useStartBroadcast, usePauseBroadcast, useResumeBroadcast, useCancelBroadcast } from "@/hooks/use-queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  ArrowLeft,
  Play,
  Pause,
  XCircle,
  Radio,
  Users,
  CheckCircle,
  AlertCircle,
  Clock,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  DRAFT:     { label: "Draft",     color: "text-gray-700",   bgColor: "bg-gray-100" },
  SCHEDULED: { label: "Scheduled", color: "text-blue-700",   bgColor: "bg-blue-100" },
  RUNNING:   { label: "Running",   color: "text-green-700",  bgColor: "bg-green-100" },
  PAUSED:    { label: "Paused",    color: "text-yellow-700", bgColor: "bg-yellow-100" },
  COMPLETED: { label: "Completed", color: "text-green-700",  bgColor: "bg-green-100" },
  CANCELLED: { label: "Cancelled", color: "text-gray-700",   bgColor: "bg-gray-100" },
  FAILED:    { label: "Failed",    color: "text-red-700",    bgColor: "bg-red-100" },
};

const recipientStatusConfig: Record<string, { label: string; color: string }> = {
  PENDING:   { label: "Pending",   color: "text-gray-500" },
  SENT:      { label: "Sent",      color: "text-green-600" },
  FAILED:    { label: "Failed",    color: "text-red-600" },
  SKIPPED:   { label: "Skipped",   color: "text-yellow-600" },
};

export default function BroadcastDetailPage() {
  const params = useParams();
  const router = useRouter();
  const broadcastId = params.id as string;

  const { data: broadcastData, isLoading } = useBroadcast(broadcastId);
  const { data: recipientsData, isLoading: recipientsLoading } = useBroadcastRecipients(broadcastId, { limit: 50 });

  const startMutation = useStartBroadcast();
  const pauseMutation = usePauseBroadcast();
  const resumeMutation = useResumeBroadcast();
  const cancelMutation = useCancelBroadcast();

  const broadcast = broadcastData?.data;
  const recipients: { id: string; phone_number: string; status: string; sent_at?: string; error_message?: string }[] = recipientsData?.data || [];
  const pagination = recipientsData?.pagination;

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!broadcast) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Broadcast tidak ditemukan.</p>
        <Button className="mt-4" variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Kembali
        </Button>
      </div>
    );
  }

  const status = statusConfig[broadcast.status] || statusConfig.DRAFT;
  const sentPct = broadcast.recipient_count > 0
    ? Math.round(((broadcast.sent_count || 0) / broadcast.recipient_count) * 100)
    : 0;

  const isPending = startMutation.isPending || pauseMutation.isPending || resumeMutation.isPending || cancelMutation.isPending;

  const handleAction = async (action: 'start' | 'pause' | 'resume' | 'cancel') => {
    try {
      if (action === 'start') await startMutation.mutateAsync(broadcastId);
      else if (action === 'pause') await pauseMutation.mutateAsync(broadcastId);
      else if (action === 'resume') await resumeMutation.mutateAsync(broadcastId);
      else if (action === 'cancel') await cancelMutation.mutateAsync(broadcastId);
    } catch {
      // Error handled by mutation onError
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{broadcast.name}</h1>
            <Badge className={cn(status.bgColor, status.color, "border-0")}>
              {status.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Instance: {broadcast.instance_name || broadcast.instance_id}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {broadcast.status === "DRAFT" && (
            <Button onClick={() => handleAction("start")} disabled={isPending}>
              {startMutation.isPending ? <Spinner size="sm" className="mr-2" /> : <Play className="mr-2 h-4 w-4" />}
              Mulai
            </Button>
          )}
          {broadcast.status === "RUNNING" && (
            <Button variant="outline" onClick={() => handleAction("pause")} disabled={isPending}>
              {pauseMutation.isPending ? <Spinner size="sm" className="mr-2" /> : <Pause className="mr-2 h-4 w-4" />}
              Jeda
            </Button>
          )}
          {broadcast.status === "PAUSED" && (
            <>
              <Button onClick={() => handleAction("resume")} disabled={isPending}>
                {resumeMutation.isPending ? <Spinner size="sm" className="mr-2" /> : <Play className="mr-2 h-4 w-4" />}
                Lanjutkan
              </Button>
              <Button variant="outline" onClick={() => handleAction("cancel")} disabled={isPending}>
                {cancelMutation.isPending ? <Spinner size="sm" className="mr-2" /> : <XCircle className="mr-2 h-4 w-4" />}
                Batalkan
              </Button>
            </>
          )}
        </div>
      </div>

      {/* PAUSED reason banner */}
      {broadcast.status === "PAUSED" && broadcast.paused_reason && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-yellow-800">Broadcast Dijeda Otomatis</p>
            <p className="text-xs text-yellow-700 mt-0.5">{broadcast.paused_reason}</p>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Penerima</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{broadcast.recipient_count || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Terkirim</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{broadcast.sent_count || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gagal</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{broadcast.failed_count || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dibuat</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{formatDate(broadcast.created_at)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      {broadcast.recipient_count > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Progress Pengiriman</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>{broadcast.sent_count || 0} dari {broadcast.recipient_count} penerima</span>
              <span className="font-medium">{sentPct}%</span>
            </div>
            <Progress value={sentPct} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Message content */}
      <Card>
        <CardHeader>
          <CardTitle>Isi Pesan</CardTitle>
          <CardDescription>Tipe: {broadcast.message_type}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap rounded-lg bg-muted/50 p-4">
            {broadcast.message_content?.text || broadcast.message_content?.caption || "(tidak ada teks)"}
          </p>
        </CardContent>
      </Card>

      {/* Recipients table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Daftar Penerima
            {pagination && (
              <span className="text-sm font-normal text-muted-foreground">({pagination.total} total)</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recipientsLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : recipients.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Belum ada penerima ditambahkan.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Waktu Kirim</TableHead>
                  <TableHead>Keterangan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((r) => {
                  const rStatus = recipientStatusConfig[r.status] || recipientStatusConfig.PENDING;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.phone_number}</TableCell>
                      <TableCell>
                        <span className={cn("text-sm font-medium", rStatus.color)}>
                          {rStatus.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.sent_at ? formatDate(r.sent_at) : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.error_message || "-"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-start">
        <Link href="/dashboard/whatsapp/broadcast">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Kembali ke Daftar Broadcast
          </Button>
        </Link>
      </div>
    </div>
  );
}
