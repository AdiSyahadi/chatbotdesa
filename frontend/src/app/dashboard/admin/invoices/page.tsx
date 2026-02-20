"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, Search, FileText, Eye, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface Invoice {
  id: string;
  invoice_number: string;
  amount: string;
  total_amount: string;
  currency: string;
  status: string;
  payment_method: string;
  payment_proof_url?: string;
  payment_notes?: string;
  due_date: string;
  paid_at?: string;
  created_at: string;
  organization?: { id: string; name: string; slug: string };
}

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  PAID: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  CANCELED: "bg-gray-100 text-gray-800",
  REFUNDED: "bg-purple-100 text-purple-800",
};

export default function AdminInvoicesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [verifyDialog, setVerifyDialog] = useState<{ open: boolean; invoice: Invoice | null; action: string }>({
    open: false,
    invoice: null,
    action: "",
  });
  const [verifyNotes, setVerifyNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-invoices", page, statusFilter],
    queryFn: () =>
      adminApi.getAllInvoices({
        page,
        limit: 20,
        status: statusFilter === "ALL" ? undefined : statusFilter,
      }),
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminApi.verifyInvoice(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-invoices"] });
      toast.success("Invoice berhasil diupdate");
      setVerifyDialog({ open: false, invoice: null, action: "" });
      setVerifyNotes("");
    },
    onError: () => {
      toast.error("Gagal update invoice");
    },
  });

  const invoices: Invoice[] = data?.data || [];
  const pagination = data?.pagination;

  const filteredInvoices = search
    ? invoices.filter(
        (inv) =>
          inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
          inv.organization?.name.toLowerCase().includes(search.toLowerCase())
      )
    : invoices;

  const handleVerify = (invoice: Invoice, action: string) => {
    setVerifyDialog({ open: true, invoice, action });
    setVerifyNotes("");
  };

  const confirmVerify = () => {
    if (!verifyDialog.invoice) return;
    verifyMutation.mutate({
      id: verifyDialog.invoice.id,
      status: verifyDialog.action,
    });
  };

  const pendingCount = invoices.filter((i) => i.status === "PENDING").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Invoice Management</h1>
        <p className="text-muted-foreground">Kelola invoice dan approve pembayaran manual</p>
      </div>

      {pendingCount > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <span className="text-yellow-800 font-medium">
              {pendingCount} invoice menunggu verifikasi pembayaran
            </span>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari invoice atau organisasi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua Status</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="CANCELED">Canceled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Invoice Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Tidak ada invoice ditemukan</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 font-medium">Invoice</th>
                    <th className="text-left p-4 font-medium">Organisation</th>
                    <th className="text-left p-4 font-medium">Amount</th>
                    <th className="text-left p-4 font-medium">Method</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-left p-4 font-medium">Due Date</th>
                    <th className="text-left p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b hover:bg-muted/30">
                      <td className="p-4">
                        <div className="font-medium">{invoice.invoice_number}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(invoice.created_at).toLocaleDateString("id-ID")}
                        </div>
                      </td>
                      <td className="p-4">
                        <div>{invoice.organization?.name || "-"}</div>
                        <div className="text-xs text-muted-foreground">{invoice.organization?.slug}</div>
                      </td>
                      <td className="p-4 font-medium">
                        {invoice.currency} {Number(invoice.total_amount).toLocaleString("id-ID")}
                      </td>
                      <td className="p-4">
                        <Badge variant="outline">
                          {invoice.payment_method.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <Badge className={statusColors[invoice.status] || ""}>
                          {invoice.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm">
                        {new Date(invoice.due_date).toLocaleDateString("id-ID")}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          {invoice.payment_proof_url && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(invoice.payment_proof_url, "_blank")}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Bukti
                            </Button>
                          )}
                          {invoice.status === "PENDING" && (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => handleVerify(invoice, "PAID")}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => handleVerify(invoice, "FAILED")}
                              >
                                <XCircle className="h-3 w-3 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span className="flex items-center px-4 text-sm text-muted-foreground">
            Page {page} of {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Verify Dialog */}
      <Dialog open={verifyDialog.open} onOpenChange={(open) => !open && setVerifyDialog({ open: false, invoice: null, action: "" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {verifyDialog.action === "PAID" ? "Approve Pembayaran" : "Reject Pembayaran"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm">
              <p>Invoice: <strong>{verifyDialog.invoice?.invoice_number}</strong></p>
              <p>Organisasi: <strong>{verifyDialog.invoice?.organization?.name}</strong></p>
              <p>Amount: <strong>{verifyDialog.invoice?.currency} {Number(verifyDialog.invoice?.total_amount || 0).toLocaleString("id-ID")}</strong></p>
            </div>
            <div>
              <label className="text-sm font-medium">Catatan (opsional)</label>
              <Textarea
                value={verifyNotes}
                onChange={(e) => setVerifyNotes(e.target.value)}
                placeholder="Catatan untuk invoice ini..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyDialog({ open: false, invoice: null, action: "" })}>
              Batal
            </Button>
            <Button
              variant={verifyDialog.action === "PAID" ? "default" : "destructive"}
              onClick={confirmVerify}
              disabled={verifyMutation.isPending}
            >
              {verifyMutation.isPending ? "Processing..." : verifyDialog.action === "PAID" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
