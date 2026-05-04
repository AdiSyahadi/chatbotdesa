"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { Search, MonitorSmartphone, Wifi, WifiOff } from "lucide-react";

interface Instance {
  id: string;
  name: string;
  phone_number?: string;
  status: string;
  is_active: boolean;
  created_at: string;
  organization?: { id: string; name: string; slug: string };
}

const statusColors: Record<string, string> = {
  CONNECTED: "bg-accent/20 text-primary",
  DISCONNECTED: "bg-red-100 text-red-800",
  CONNECTING: "bg-yellow-100 text-yellow-800",
  INITIALIZING: "bg-secondary/10 text-secondary",
};

export default function AdminInstancesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-instances", page, statusFilter],
    queryFn: () =>
      adminApi.getAllInstances({
        page,
        limit: 20,
        status: statusFilter === "ALL" ? undefined : statusFilter,
      }),
  });

  const instances: Instance[] = data?.data || [];
  const pagination = data?.pagination;

  const filteredInstances = search
    ? instances.filter(
        (inst) =>
          inst.name.toLowerCase().includes(search.toLowerCase()) ||
          inst.phone_number?.includes(search) ||
          inst.organization?.name.toLowerCase().includes(search.toLowerCase())
      )
    : instances;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">All Instances</h1>
        <p className="text-muted-foreground">Semua WhatsApp instance di seluruh organisasi</p>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari instance, nomor, atau organisasi..."
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
            <SelectItem value="CONNECTED">Connected</SelectItem>
            <SelectItem value="DISCONNECTED">Disconnected</SelectItem>
            <SelectItem value="CONNECTING">Connecting</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Instances Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredInstances.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <MonitorSmartphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Tidak ada instance ditemukan</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 font-medium">Instance</th>
                    <th className="text-left p-4 font-medium">Organisation</th>
                    <th className="text-left p-4 font-medium">Phone</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-left p-4 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInstances.map((instance) => (
                    <tr key={instance.id} className="border-b hover:bg-muted/30">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {instance.status === "CONNECTED" ? (
                            <Wifi className="h-4 w-4 text-secondary" />
                          ) : (
                            <WifiOff className="h-4 w-4 text-red-400" />
                          )}
                          <div>
                            <div className="font-medium">{instance.name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{instance.id.slice(0, 8)}...</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div>{instance.organization?.name || "-"}</div>
                        <div className="text-xs text-muted-foreground">{instance.organization?.slug}</div>
                      </td>
                      <td className="p-4 font-mono text-sm">
                        {instance.phone_number || "-"}
                      </td>
                      <td className="p-4">
                        <Badge className={statusColors[instance.status] || "bg-gray-100 text-gray-800"}>
                          {instance.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">
                        {new Date(instance.created_at).toLocaleDateString("id-ID")}
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
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="flex items-center px-4 text-sm text-muted-foreground">
            Page {page} of {pagination.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
