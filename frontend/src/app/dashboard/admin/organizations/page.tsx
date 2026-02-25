"use client";

import { useState } from "react";
import { useAdminOrganizations } from "@/hooks/use-queries";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RefreshCw,
  Building2,
  Filter,
  Search,
  MoreVertical,
  Eye,
  Ban,
  CheckCircle,
  Users,
  Smartphone,
  CreditCard,
  Package,
} from "lucide-react";
import { cn, formatDate, formatCurrency } from "@/lib/utils";
import { adminApi } from "@/lib/api";
import { toast } from "sonner";
import Link from "next/link";

interface Organization {
  id: string;
  name: string;
  slug: string;
  status: string;
  is_active?: boolean;
  plan?: {
    id?: string;
    name: string;
    price: number;
  };
  subscription_status?: string;
  owner: {
    name: string;
    email: string;
  };
  stats: {
    users_count: number;
    instances_count: number;
    messages_count: number;
  };
  created_at: string;
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  ACTIVE: { label: "Active", color: "text-green-700", bgColor: "bg-green-100" },
  TRIAL: { label: "Trial", color: "text-blue-700", bgColor: "bg-blue-100" },
  INACTIVE: { label: "Inactive", color: "text-gray-700", bgColor: "bg-gray-100" },
  SUSPENDED: { label: "Suspended", color: "text-red-700", bgColor: "bg-red-100" },
  EXPIRED: { label: "Expired", color: "text-orange-700", bgColor: "bg-orange-100" },
  CANCELED: { label: "Canceled", color: "text-gray-700", bgColor: "bg-gray-100" },
  PAST_DUE: { label: "Past Due", color: "text-yellow-700", bgColor: "bg-yellow-100" },
  PENDING: { label: "Pending", color: "text-yellow-700", bgColor: "bg-yellow-100" },
};

interface Plan {
  id: string;
  name: string;
  price: string;
  billing_period: string;
  max_instances: number;
  max_contacts: number;
  max_messages_per_day: number;
}

export default function AdminOrganizationsPage() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [assignPlanDialog, setAssignPlanDialog] = useState<{ open: boolean; org: Organization | null }>({
    open: false,
    org: null,
  });
  const [selectedPlanId, setSelectedPlanId] = useState("");

  const { data, isLoading, refetch } = useAdminOrganizations({
    page,
    limit: 20,
    status: filterStatus === "__all__" ? undefined : filterStatus,
  });

  const organizations: Organization[] = data?.data?.organizations || data?.data || [];
  const pagination = data?.data?.pagination;

  // Fetch plans for the assign-plan dialog (admin endpoint — all plans)
  const { data: plansData } = useQuery({
    queryKey: ["admin-plans-select"],
    queryFn: () => adminApi.getPlans(),
    enabled: assignPlanDialog.open,
  });
  const plans: Plan[] = plansData?.data?.plans || plansData?.data || [];

  const assignPlanMutation = useMutation({
    mutationFn: ({ orgId, planId }: { orgId: string; planId: string }) =>
      adminApi.assignPlanToOrg(orgId, planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-organizations"] });
      toast.success("Plan berhasil di-assign ke organisasi");
      setAssignPlanDialog({ open: false, org: null });
      setSelectedPlanId("");
    },
    onError: () => toast.error("Gagal assign plan"),
  });

  const suspendMutation = useMutation({
    mutationFn: (orgId: string) => adminApi.updateOrganization(orgId, { is_active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-organizations"] });
      toast.success("Organisasi berhasil disuspend");
    },
    onError: () => toast.error("Gagal suspend organisasi"),
  });

  const activateMutation = useMutation({
    mutationFn: (orgId: string) => adminApi.updateOrganization(orgId, { is_active: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-organizations"] });
      toast.success("Organisasi berhasil diaktifkan");
    },
    onError: () => toast.error("Gagal aktifkan organisasi"),
  });

  const openAssignPlan = (org: Organization) => {
    setAssignPlanDialog({ open: true, org });
    setSelectedPlanId(org.plan?.id ?? "");
  };

  // Filter by search query client-side
  const filteredOrganizations = organizations.filter(
    (org) =>
      !searchQuery ||
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.owner.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Organizations</h1>
          <p className="text-muted-foreground">
            Manage all organizations on the platform
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, slug, or email..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="w-40">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Organizations table */}
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
      ) : filteredOrganizations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No organizations found</h3>
            <p className="text-muted-foreground mb-4 text-center max-w-sm">
              {searchQuery || filterStatus
                ? "No organizations match your filters."
                : "No organizations have been created yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Stats</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrganizations.map((org) => {
                  const status = statusConfig[org.status] || statusConfig.ACTIVE;
                  return (
                    <TableRow key={org.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{org.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {org.slug}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{org.owner.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {org.owner.email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{org.plan?.name || "No Plan"}</p>
                          {org.plan && (
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(org.plan.price)}/mo
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {org.stats.users_count}
                          </span>
                          <span className="flex items-center gap-1">
                            <Smartphone className="h-3 w-3" />
                            {org.stats.instances_count}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn(status.bgColor, status.color, "border-0")}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(org.created_at)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/admin/organizations/${org.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openAssignPlan(org)}>
                              <Package className="mr-2 h-4 w-4" />
                              Assign Plan
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {org.is_active !== false ? (
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => suspendMutation.mutate(org.id)}
                              >
                                <Ban className="mr-2 h-4 w-4" />
                                Suspend
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="text-green-600"
                                onClick={() => activateMutation.mutate(org.id)}
                              >
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Activate
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
          {/* Pagination */}
          {pagination && (
            <div className="flex items-center justify-between px-6 py-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {filteredOrganizations.length} of {pagination.total} organizations
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= pagination.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Assign Plan Dialog */}
      <Dialog
        open={assignPlanDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setAssignPlanDialog({ open: false, org: null });
            setSelectedPlanId("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Plan</DialogTitle>
            <DialogDescription>
              Assign a subscription plan to{" "}
              <span className="font-semibold">{assignPlanDialog.org?.name}</span>. This will
              immediately update the organization&apos;s resource limits.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Plan</label>
              <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a plan…" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      <span className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        {plan.name} —{" "}
                        {plan.price === "0" || plan.price === "0.00"
                          ? "Free"
                          : formatCurrency(Number(plan.price))}
                        /{plan.billing_period?.toLowerCase() ?? "month"}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedPlanId && (() => {
              const plan = plans.find((p) => p.id === selectedPlanId);
              if (!plan) return null;
              return (
                <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                  <p className="font-medium text-muted-foreground mb-2">Plan Limits</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Instances</span>
                    <span className="font-medium">{plan.max_instances}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contacts</span>
                    <span className="font-medium">{plan.max_contacts.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Messages/day</span>
                    <span className="font-medium">{plan.max_messages_per_day.toLocaleString()}</span>
                  </div>
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAssignPlanDialog({ open: false, org: null });
                setSelectedPlanId("");
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!selectedPlanId || assignPlanMutation.isPending}
              onClick={() => {
                if (assignPlanDialog.org && selectedPlanId) {
                  assignPlanMutation.mutate({
                    orgId: assignPlanDialog.org.id,
                    planId: selectedPlanId,
                  });
                }
              }}
            >
              {assignPlanMutation.isPending ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="mr-2 h-4 w-4" />
              )}
              Assign Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
