"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  usePlans, 
  useSubscription, 
  useUsage, 
  useStartCheckout,
  useCancelSubscription 
} from "@/hooks/use-queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Check,
  CreditCard,
  FileText,
  RefreshCw,
  Zap,
  MessageSquare,
  Users,
  Smartphone,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  billing_period: "MONTHLY" | "YEARLY";
  features: {
    max_instances: number;
    max_messages_per_month: number;
    max_contacts: number;
    max_team_members?: number;
    webhook_support: boolean;
    api_access: boolean;
    priority_support: boolean;
    custom_branding: boolean;
  };
  is_active: boolean;
  is_popular?: boolean;
}

export default function BillingPage() {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"MONTHLY" | "YEARLY">("MONTHLY");

  const { data: plansData, isLoading: plansLoading } = usePlans();
  const { data: subscriptionData, isLoading: subscriptionLoading, refetch: refetchSubscription } = useSubscription();
  const { data: usageData, isLoading: usageLoading } = useUsage();
  const startCheckoutMutation = useStartCheckout();
  const cancelMutation = useCancelSubscription();

  const plans: Plan[] = plansData?.data?.plans?.filter(
    (p: Plan) => p.billing_period === billingPeriod
  ) || [];
  const subscription = subscriptionData?.data;
  const usage = usageData?.data;

  const handleStartCheckout = async (planId: string) => {
    try {
      const result = await startCheckoutMutation.mutateAsync({ plan_id: planId });
      if (result?.data?.checkout_url) {
        window.location.href = result.data.checkout_url;
      }
    } catch {
      // Error handled by mutation
    }
  };

  const handleCancelSubscription = async () => {
    try {
      await cancelMutation.mutateAsync();
      setCancelDialogOpen(false);
      refetchSubscription();
    } catch {
      // Error handled by mutation
    }
  };

  const isLoading = plansLoading || subscriptionLoading || usageLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-96 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing & Plans</h1>
          <p className="text-muted-foreground">
            Manage your subscription and billing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetchSubscription()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Link href="/dashboard/billing/invoices">
            <Button variant="outline">
              <FileText className="mr-2 h-4 w-4" />
              View Invoices
            </Button>
          </Link>
        </div>
      </div>

      <Tabs defaultValue="subscription" className="space-y-6">
        <TabsList>
          <TabsTrigger value="subscription">Current Plan</TabsTrigger>
          <TabsTrigger value="plans">All Plans</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>

        {/* Current Subscription Tab */}
        <TabsContent value="subscription" className="space-y-6">
          {subscription ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl">
                        {subscription.plan?.name || "Current Plan"}
                      </CardTitle>
                      <CardDescription>
                        Your current subscription details
                      </CardDescription>
                    </div>
                    <Badge
                      variant={subscription.status === "ACTIVE" ? "default" : "destructive"}
                      className={cn(
                        subscription.status === "ACTIVE" && "bg-green-100 text-green-700"
                      )}
                    >
                      {subscription.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Monthly Price</p>
                      <p className="text-2xl font-bold">
                        {formatCurrency(subscription.plan?.price || 0)}
                        <span className="text-sm font-normal text-muted-foreground">
                          /{subscription.plan?.billing_period === "YEARLY" ? "year" : "month"}
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Next Billing Date</p>
                      <p className="text-lg font-medium">
                        {subscription.current_period_end
                          ? new Date(subscription.current_period_end).toLocaleDateString()
                          : "-"}
                      </p>
                    </div>
                  </div>

                  {subscription.cancel_at_period_end && (
                    <div className="flex items-center gap-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                      <p className="text-sm text-yellow-700">
                        Your subscription will be cancelled at the end of the current billing period.
                      </p>
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="flex items-center gap-3 p-3 border rounded-lg">
                      <Smartphone className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm text-muted-foreground">Instances</p>
                        <p className="font-medium">
                          {usage?.instances_used || 0} / {subscription.plan?.features?.max_instances || 0}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 border rounded-lg">
                      <MessageSquare className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm text-muted-foreground">Messages</p>
                        <p className="font-medium">
                          {usage?.messages_this_month || 0} / {subscription.plan?.features?.max_messages_per_month || 0}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 border rounded-lg">
                      <Users className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm text-muted-foreground">Contacts</p>
                        <p className="font-medium">
                          {usage?.contacts_count || 0} / {subscription.plan?.features?.max_contacts || 0}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 border rounded-lg">
                      <Zap className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm text-muted-foreground">API Calls</p>
                        <p className="font-medium">{usage?.api_calls_today || 0} today</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                  {!subscription.cancel_at_period_end && (
                    <Button
                      variant="outline"
                      onClick={() => setCancelDialogOpen(true)}
                    >
                      Cancel Subscription
                    </Button>
                  )}
                  <Button onClick={() => {
                    document.querySelector('[data-value="plans"]')?.dispatchEvent(
                      new MouseEvent('click', { bubbles: true })
                    );
                  }}>
                    Change Plan
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <CreditCard className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Active Subscription</h3>
                <p className="text-muted-foreground mb-4 text-center max-w-sm">
                  Choose a plan to start using WhatsApp API features.
                </p>
                <Button onClick={() => {
                  document.querySelector('[data-value="plans"]')?.dispatchEvent(
                    new MouseEvent('click', { bubbles: true })
                  );
                }}>
                  View Plans
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Plans Tab */}
        <TabsContent value="plans" className="space-y-6">
          {/* Billing period toggle */}
          <div className="flex justify-center">
            <div className="inline-flex items-center rounded-lg border p-1">
              <Button
                variant={billingPeriod === "MONTHLY" ? "default" : "ghost"}
                size="sm"
                onClick={() => setBillingPeriod("MONTHLY")}
              >
                Monthly
              </Button>
              <Button
                variant={billingPeriod === "YEARLY" ? "default" : "ghost"}
                size="sm"
                onClick={() => setBillingPeriod("YEARLY")}
              >
                Yearly
                <Badge className="ml-2 bg-green-100 text-green-700">Save 20%</Badge>
              </Button>
            </div>
          </div>

          {/* Plans grid */}
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={cn(
                  "relative",
                  plan.is_popular && "border-primary shadow-lg"
                )}
              >
                {plan.is_popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                    Most Popular
                  </Badge>
                )}
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="pt-4">
                    <span className="text-3xl font-bold">
                      {formatCurrency(plan.price)}
                    </span>
                    <span className="text-muted-foreground">
                      /{plan.billing_period === "YEARLY" ? "year" : "month"}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      <span>{plan.features.max_instances} WhatsApp instances</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      <span>{plan.features.max_messages_per_month.toLocaleString()} messages/month</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      <span>{plan.features.max_contacts.toLocaleString()} contacts</span>
                    </li>
                    {plan.features.max_team_members && (
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-500" />
                        <span>{plan.features.max_team_members} team members</span>
                      </li>
                    )}
                    <li className="flex items-center gap-2">
                      {plan.features.webhook_support ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <span className="h-4 w-4" />
                      )}
                      <span className={!plan.features.webhook_support ? "text-muted-foreground line-through" : ""}>
                        Webhook support
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      {plan.features.api_access ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <span className="h-4 w-4" />
                      )}
                      <span className={!plan.features.api_access ? "text-muted-foreground line-through" : ""}>
                        Full API access
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      {plan.features.priority_support ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <span className="h-4 w-4" />
                      )}
                      <span className={!plan.features.priority_support ? "text-muted-foreground line-through" : ""}>
                        Priority support
                      </span>
                    </li>
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={plan.is_popular ? "default" : "outline"}
                    onClick={() => {
                      setSelectedPlanId(plan.id);
                      handleStartCheckout(plan.id);
                    }}
                    disabled={
                      startCheckoutMutation.isPending ||
                      subscription?.plan_id === plan.id
                    }
                  >
                    {startCheckoutMutation.isPending && selectedPlanId === plan.id ? (
                      <Spinner size="sm" className="mr-2" />
                    ) : null}
                    {subscription?.plan_id === plan.id ? "Current Plan" : "Get Started"}
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Messages
                </CardTitle>
                <CardDescription>Monthly message usage</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Used</span>
                    <span className="font-medium">
                      {(usage?.messages_this_month || 0).toLocaleString()} / {(subscription?.plan?.features?.max_messages_per_month || 0).toLocaleString()}
                    </span>
                  </div>
                  <Progress
                    value={
                      subscription?.plan?.features?.max_messages_per_month
                        ? ((usage?.messages_this_month || 0) / subscription.plan.features.max_messages_per_month) * 100
                        : 0
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Sent Today</p>
                    <p className="text-xl font-bold">{usage?.messages_today || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Received Today</p>
                    <p className="text-xl font-bold">{usage?.messages_received_today || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Instances
                </CardTitle>
                <CardDescription>WhatsApp connections</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Active</span>
                    <span className="font-medium">
                      {usage?.instances_used || 0} / {subscription?.plan?.features?.max_instances || 0}
                    </span>
                  </div>
                  <Progress
                    value={
                      subscription?.plan?.features?.max_instances
                        ? ((usage?.instances_used || 0) / subscription.plan.features.max_instances) * 100
                        : 0
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Connected</p>
                    <p className="text-xl font-bold">{usage?.instances_connected || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Disconnected</p>
                    <p className="text-xl font-bold">{usage?.instances_disconnected || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Contacts
                </CardTitle>
                <CardDescription>Stored contacts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Total</span>
                    <span className="font-medium">
                      {(usage?.contacts_count || 0).toLocaleString()} / {(subscription?.plan?.features?.max_contacts || 0).toLocaleString()}
                    </span>
                  </div>
                  <Progress
                    value={
                      subscription?.plan?.features?.max_contacts
                        ? ((usage?.contacts_count || 0) / subscription.plan.features.max_contacts) * 100
                        : 0
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  API Usage
                </CardTitle>
                <CardDescription>API calls today</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-3xl font-bold">{usage?.api_calls_today || 0}</div>
                <p className="text-sm text-muted-foreground">
                  API calls made in the last 24 hours
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Cancel subscription dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Subscription</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel your subscription? You will continue to have access until the end of your current billing period.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
            >
              Keep Subscription
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelSubscription}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending && (
                <Spinner size="sm" className="mr-2" />
              )}
              Cancel Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
