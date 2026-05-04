"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth.store";
import { useUsage, useInstances } from "@/hooks/use-queries";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  MessageSquare, 
  Send, 
  Users, 
  Webhook, 
  Plus,
  Upload,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DashboardPage() {
  const router = useRouter();
  const { user, organization } = useAuthStore();
  const { data: usageData, isLoading: usageLoading } = useUsage();
  const { data: instancesData, isLoading: instancesLoading } = useInstances();

  // SUPER_ADMIN → redirect ke admin dashboard
  useEffect(() => {
    if (user?.role === "SUPER_ADMIN") {
      router.replace("/dashboard/admin");
    }
  }, [user, router]);

  const usage = usageData?.data?.usage;
  const instances = instancesData?.data || [];

  const stats = [
    {
      label: "Active Instances",
      value: usage ? `${usage.instances.used}/${usage.instances.max}` : "-",
      icon: MessageSquare,
      color: "text-primary",
    },
    {
      label: "Messages Today",
      value: usage ? usage.messages_today.used.toLocaleString() : "-",
      icon: Send,
      color: "text-secondary",
    },
    {
      label: "Contacts",
      value: usage ? usage.contacts.used.toLocaleString() : "-",
      icon: Users,
      color: "text-accent",
    },
    {
      label: "Webhook Calls",
      value: "-",
      icon: Webhook,
      color: "text-orange-500",
    },
  ];

  const quickActions = [
    {
      icon: Plus,
      label: "New Instance",
      href: "/dashboard/whatsapp/instances",
      description: "Create a new WhatsApp instance",
    },
    {
      icon: Send,
      label: "Send Message",
      href: "/dashboard/whatsapp/messages",
      description: "Send a new message",
    },
    {
      icon: Upload,
      label: "Import Contacts",
      href: "/dashboard/contacts",
      description: "Import contacts from CSV",
    },
    {
      icon: FileText,
      label: "View API Docs",
      href: "/dashboard/docs",
      description: "API documentation",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome section */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {user?.fullName?.split(" ")[0]}!
        </h1>
        <p className="text-muted-foreground">
          Here&apos;s what&apos;s happening with {organization?.name} today.
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.label}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              {usageLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{stat.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick actions and instances */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common actions you can take</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {quickActions.map((action, index) => (
                <Link
                  key={index}
                  href={action.href}
                  className="flex flex-col items-center gap-2 rounded-lg border p-4 hover:bg-accent transition-colors"
                >
                  <div className="rounded-full bg-primary/10 p-2">
                    <action.icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium">{action.label}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* WhatsApp Instances */}
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp Instances</CardTitle>
            <CardDescription>Your connected instances</CardDescription>
          </CardHeader>
          <CardContent>
            {instancesLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : instances.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-sm font-semibold">No instances yet</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Create your first WhatsApp instance to get started.
                </p>
                <Link href="/dashboard/whatsapp/instances">
                  <Button className="mt-4">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Instance
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {instances.slice(0, 3).map((instance: { id: string; name: string; phone_number?: string; status: string }) => (
                  <div
                    key={instance.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-3 w-3 rounded-full ${
                          instance.status === "CONNECTED"
                            ? "bg-green-500"
                            : instance.status === "QR_READY"
                            ? "bg-blue-500"
                            : instance.status === "CONNECTING"
                            ? "bg-yellow-500"
                            : "bg-gray-400"
                        }`}
                      />
                      <div>
                        <p className="font-medium">{instance.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {instance.phone_number || "Not connected"}
                        </p>
                      </div>
                    </div>
                    <Link href={`/dashboard/whatsapp/instances/${instance.id}`}>
                      <Button variant="ghost" size="sm">
                        View
                      </Button>
                    </Link>
                  </div>
                ))}
                {instances.length > 3 && (
                  <Link href="/dashboard/whatsapp/instances">
                    <Button variant="outline" className="w-full">
                      View all {instances.length} instances
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
