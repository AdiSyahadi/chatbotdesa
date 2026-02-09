"use client";

import { useAdminStats, useSystemHealth } from "@/hooks/use-queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Building2,
  Users,
  Smartphone,
  MessageSquare,
  DollarSign,
  Activity,
  Server,
  Database,
  HardDrive,
  Cpu,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface SystemHealth {
  status: "healthy" | "degraded" | "down";
  uptime: number;
  services: {
    api: { status: string; latency: number };
    database: { status: string; connections: number };
    redis: { status: string; memory_usage: number };
    whatsapp: { status: string; active_sessions: number };
  };
  resources: {
    cpu_usage: number;
    memory_usage: number;
    disk_usage: number;
  };
}

const healthStatusConfig = {
  healthy: { icon: <CheckCircle className="h-4 w-4" />, color: "text-green-600", bg: "bg-green-100" },
  degraded: { icon: <AlertTriangle className="h-4 w-4" />, color: "text-yellow-600", bg: "bg-yellow-100" },
  down: { icon: <XCircle className="h-4 w-4" />, color: "text-red-600", bg: "bg-red-100" },
  ok: { icon: <CheckCircle className="h-4 w-4" />, color: "text-green-600", bg: "bg-green-100" },
  up: { icon: <CheckCircle className="h-4 w-4" />, color: "text-green-600", bg: "bg-green-100" },
};

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

export default function AdminDashboardPage() {
  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useAdminStats();
  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useSystemHealth();

  const stats = statsData?.data;
  const health: SystemHealth = healthData?.data;

  const isLoading = statsLoading || healthLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const healthStatus = healthStatusConfig[health?.status || "healthy"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            System overview and statistics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => {
              refetchStats();
              refetchHealth();
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* System Status Banner */}
      <Card className={cn("border-l-4", 
        health?.status === "healthy" && "border-l-green-500",
        health?.status === "degraded" && "border-l-yellow-500",
        health?.status === "down" && "border-l-red-500"
      )}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-full", healthStatus?.bg)}>
                {healthStatus?.icon}
              </div>
              <div>
                <p className="font-medium">System Status: {health?.status?.toUpperCase() || "UNKNOWN"}</p>
                <p className="text-sm text-muted-foreground">
                  Uptime: {formatUptime(health?.uptime || 0)}
                </p>
              </div>
            </div>
            <Link href="/dashboard/admin/system">
              <Button variant="outline" size="sm">View Details</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Main Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Organizations</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_organizations || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.new_organizations_this_month || 0} new this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_users || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.active_users_today || 0} active today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Instances</CardTitle>
            <Smartphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_instances || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.connected_instances || 0} connected
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue (MTD)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats?.revenue_this_month || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(stats?.mrr || 0)} MRR
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats & Quick Info */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Messages Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Message Statistics
            </CardTitle>
            <CardDescription>Platform-wide message metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Today</p>
                <p className="text-2xl font-bold">
                  {(stats?.messages_today || 0).toLocaleString()}
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold">
                  {(stats?.messages_this_month || 0).toLocaleString()}
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold text-green-600">
                  {stats?.message_success_rate || 0}%
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Avg/Instance</p>
                <p className="text-2xl font-bold">
                  {Math.round((stats?.messages_today || 0) / (stats?.connected_instances || 1))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Resources */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              System Resources
            </CardTitle>
            <CardDescription>Current resource utilization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" /> CPU
                </span>
                <span className="font-medium">{health?.resources?.cpu_usage || 0}%</span>
              </div>
              <Progress value={health?.resources?.cpu_usage || 0} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4" /> Memory
                </span>
                <span className="font-medium">{health?.resources?.memory_usage || 0}%</span>
              </div>
              <Progress value={health?.resources?.memory_usage || 0} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Database className="h-4 w-4" /> Disk
                </span>
                <span className="font-medium">{health?.resources?.disk_usage || 0}%</span>
              </div>
              <Progress value={health?.resources?.disk_usage || 0} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Services Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Service Status
          </CardTitle>
          <CardDescription>Status of critical system services</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            {Object.entries(health?.services || {}).map(([name, service]) => {
              const serviceStatus = healthStatusConfig[(service as { status: string })?.status?.toLowerCase() as keyof typeof healthStatusConfig] || healthStatusConfig.healthy;
              return (
                <div key={name} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-full", serviceStatus.bg)}>
                      {serviceStatus.icon}
                    </div>
                    <div>
                      <p className="font-medium capitalize">{name}</p>
                      <p className="text-xs text-muted-foreground">
                        {name === "api" && `${(service as { latency?: number })?.latency || 0}ms`}
                        {name === "database" && `${(service as { connections?: number })?.connections || 0} conn`}
                        {name === "redis" && `${(service as { memory_usage?: number })?.memory_usage || 0}MB`}
                        {name === "whatsapp" && `${(service as { active_sessions?: number })?.active_sessions || 0} sessions`}
                      </p>
                    </div>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={cn("capitalize", serviceStatus.color)}
                  >
                    {(service as { status: string })?.status || "unknown"}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-4">
        <Link href="/dashboard/admin/organizations">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 py-6">
              <Building2 className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">Organizations</p>
                <p className="text-sm text-muted-foreground">Manage orgs</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/admin/users">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 py-6">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">Users</p>
                <p className="text-sm text-muted-foreground">Manage users</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/admin/instances">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 py-6">
              <Smartphone className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">Instances</p>
                <p className="text-sm text-muted-foreground">All instances</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/dashboard/admin/billing">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 py-6">
              <DollarSign className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">Billing</p>
                <p className="text-sm text-muted-foreground">Revenue & invoices</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
