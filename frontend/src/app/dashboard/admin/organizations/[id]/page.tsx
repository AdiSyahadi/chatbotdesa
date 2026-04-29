"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAdminOrganization } from "@/hooks/use-queries";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Building2,
  Users,
  Smartphone,
  CreditCard,
  Package,
  Ban,
  CheckCircle,
  RefreshCw,
  Calendar,
  Mail,
  Shield,
} from "lucide-react";
import { cn, formatDate, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { useState } from "react";

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  ACTIVE:    { label: "Active",    color: "text-green-700",  bgColor: "bg-green-100" },
  TRIAL:     { label: "Trial",     color: "text-blue-700",   bgColor: "bg-blue-100" },
  INACTIVE:  { label: "Inactive",  color: "text-gray-700",   bgColor: "bg-gray-100" },
  SUSPENDED: { label: "Suspended", color: "text-red-700",    bgColor: "bg-red-100" },
  EXPIRED:   { label: "Expired",   color: "text-orange-700", bgColor: "bg-orange-100" },
  CANCELED:  { label: "Canceled",  color: "text-gray-700",   bgColor: "bg-gray-100" },
  PAST_DUE:  { label: "Past Due",  color: "text-yellow-700", bgColor: "bg-yellow-100" },
  PENDING:   { label: "Pending",   color: "text-yellow-700", bgColor: "bg-yellow-100" },
};

const instanceStatusConfig: Record<string, { label: string; color: string }> = {
  CONNECTED:    { label: "Connected",    color: "text-green-600" },
  DISCONNECTED: { label: "Disconnected", color: "text-gray-500" },
  CONNECTING:   { label: "Connecting",   color: "text-yellow-600" },
  QR_READY:     { label: "QR Ready",     color: "text-blue-600" },
  BANNED:       { label: "Banned",       color: "text-red-600" },
  ERROR:        { label: "Error",        color: "text-red-600" },
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

export default function AdminOrganizationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.id as string;
  const queryClient = useQueryClient();

  const [assignPlanOpen, setAssignPlanOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");

  const { data, isLoading, refetch } = useAdminOrganization(orgId);
  const org = data?.data;

  const { data: plansData } = useQuery({
    queryKey: ["admin-plans-select"],
    queryFn: () => adminApi.getPlans(),
    enabled: assignPlanOpen,
  });
  const plans: Plan[] = plansData?.data?.plans || plansData?.data || [];

  const suspendMutation = useMutation({
    mutationFn: () => adminApi.updateOrganization(orgId, { is_active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "organizations", orgId] });
      toast.success("Organisasi berhasil disuspend");
      refetch();
    },
    onError: () => toast.error("Gagal suspend organisasi"),
  });

  const activateMutation = useMutation({
    mutationFn: () => adminApi.updateOrganization(orgId, { is_active: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "organizations", orgId] });
      toast.success("Organisasi berhasil diaktifkan");
      refetch();
    },
    onError: () => toast.error("Gagal aktifkan organisasi"),
  });

  const assignPlanMutation = useMutation({
    mutationFn: (planId: string) => adminApi.assignPlanToOrg(orgId, planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "organizations", orgId] });
      toast.success("Plan berhasil di-assign");
      setAssignPlanOpen(false);
      setSelectedPlanId("");
      refetch();
    },
    onError: () => toast.error("Gagal assign plan"),
  });

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
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!org) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Building2 className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Organization not found</h3>
          <Link href="/dashboard/admin/organizations">
            <Button><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const status = statusConfig[org.subscription_status || org.status] || statusConfig.INACTIVE;
  const isSuspended = org.is_active === false;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/admin/organizations">
            <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{org.name}</h1>
              <Badge className={cn(status.bgColor, status.color, "border-0")}>
                {status.label}
              </Badge>
              {isSuspended && (
                <Badge className="bg-red-100 text-red-700 border-0">Suspended</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground font-mono">{org.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAssignPlanOpen(true)}>
            <Package className="mr-2 h-4 w-4" />
            Assign Plan
          </Button>
          {isSuspended ? (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              disabled={activateMutation.isPending}
              onClick={() => activateMutation.mutate()}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Activate
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              disabled={suspendMutation.isPending}
              onClick={() => suspendMutation.mutate()}
            >
              <Ban className="mr-2 h-4 w-4" />
              Suspend
            </Button>
          )}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{org.users?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Instances</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{org.whatsapp_instances?.length ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              Limit: {org.max_instances ?? org.subscription_plan?.max_instances ?? "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Plan</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{org.subscription_plan?.name ?? "No Plan"}</div>
            {org.subscription_plan && (
              <p className="text-xs text-muted-foreground">
                {formatCurrency(org.subscription_plan.price ?? 0)}/mo
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Created</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{formatDate(org.created_at)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Users */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Users ({org.users?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!org.users?.length ? (
              <p className="text-sm text-muted-foreground p-6">No users found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {org.users.map((user: any) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{user.full_name}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />{user.email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          <Shield className="mr-1 h-3 w-3" />
                          {user.role.replace("ORG_", "")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={cn("text-xs font-medium", user.is_active ? "text-green-600" : "text-red-500")}>
                          {user.is_active ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Instances */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Instances ({org.whatsapp_instances?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!org.whatsapp_instances?.length ? (
              <p className="text-sm text-muted-foreground p-6">No instances found.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {org.whatsapp_instances.map((inst: any) => {
                    const instStatus = instanceStatusConfig[inst.status] || instanceStatusConfig.DISCONNECTED;
                    return (
                      <TableRow key={inst.id}>
                        <TableCell className="font-medium text-sm">{inst.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {inst.phone_number || "—"}
                        </TableCell>
                        <TableCell>
                          <span className={cn("text-xs font-medium", instStatus.color)}>
                            {instStatus.label}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Subscriptions */}
      {org.subscriptions?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Recent Subscriptions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {org.subscriptions.map((sub: any) => {
                  const subStatus = statusConfig[sub.status] || statusConfig.INACTIVE;
                  return (
                    <TableRow key={sub.id}>
                      <TableCell className="text-sm font-medium">{sub.plan_id}</TableCell>
                      <TableCell>
                        <Badge className={cn(subStatus.bgColor, subStatus.color, "border-0 text-xs")}>
                          {subStatus.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(sub.starts_at)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {sub.ends_at ? formatDate(sub.ends_at) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Assign Plan Dialog */}
      <Dialog open={assignPlanOpen} onOpenChange={(open) => { setAssignPlanOpen(open); if (!open) setSelectedPlanId(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Plan</DialogTitle>
            <DialogDescription>
              Assign a subscription plan to <span className="font-semibold">{org.name}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih plan..." />
              </SelectTrigger>
              <SelectContent>
                {plans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name} — {plan.price === "0" || plan.price === "0.00" ? "Free" : formatCurrency(Number(plan.price))}/{plan.billing_period?.toLowerCase() ?? "month"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPlanId && (() => {
              const plan = plans.find((p) => p.id === selectedPlanId);
              if (!plan) return null;
              return (
                <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                  <p className="font-medium text-muted-foreground mb-2">Plan Limits</p>
                  <div className="flex justify-between"><span className="text-muted-foreground">Instances</span><span className="font-medium">{plan.max_instances}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Contacts</span><span className="font-medium">{plan.max_contacts?.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Messages/day</span><span className="font-medium">{plan.max_messages_per_day?.toLocaleString()}</span></div>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAssignPlanOpen(false); setSelectedPlanId(""); }}>Cancel</Button>
            <Button
              disabled={!selectedPlanId || assignPlanMutation.isPending}
              onClick={() => assignPlanMutation.mutate(selectedPlanId)}
            >
              {assignPlanMutation.isPending && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
              <CreditCard className="mr-2 h-4 w-4" />
              Assign Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
