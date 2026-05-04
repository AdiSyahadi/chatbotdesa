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
  slug: string;
  description: string | null;
  price: number;
  currency: string;
  billing_period: "MONTHLY" | "YEARLY";
  max_instances: number;
  max_contacts: number;
  max_messages_per_day: number;
  features: string[]; // array of feature label strings from backend
  trial_days: number;
  is_active: boolean;
  is_public: boolean;
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
  // Backend response: { success, data: { subscription: {...} } }
  const subscription = subscriptionData?.data?.subscription;
  // Backend response: { success, data: { usage: {...} } }
  const usage = usageData?.data?.usage;

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

  // Calculate usage percentage (capped at 100%)
  const pct = (used: number, max: number) =>
    max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;

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
                        subscription.status === "ACTIVE" && "bg-accent/20 text-primary"
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
                    <div className="flex flex-col gap-2 p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-primary" />
                        <p className="text-sm text-muted-foreground">Instances</p>
                      </div>
                      <p className="font-semibold">
                        {usage?.instances?.used || 0} / {subscription.plan?.max_instances || 0}
                      </p>
                      <Progress
                        value={pct(usage?.instances?.used || 0, subscription.plan?.max_instances || 0)}
                        className="h-1.5"
                      />
                      <p className="text-xs text-muted-foreground text-right">
                        {pct(usage?.instances?.used || 0, subscription.plan?.max_instances || 0)}% used
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        <p className="text-sm text-muted-foreground">Messages Today</p>
                      </div>
                      <p className="font-semibold">
                        {usage?.messages_today?.used || 0} / {subscription.plan?.max_messages_per_day || 0}
                      </p>
                      <Progress
                        value={pct(usage?.messages_today?.used || 0, subscription.plan?.max_messages_per_day || 0)}
                        className="h-1.5"
                      />
                      <p className="text-xs text-muted-foreground text-right">
                        {pct(usage?.messages_today?.used || 0, subscription.plan?.max_messages_per_day || 0)}% used
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        <p className="text-sm text-muted-foreground">Contacts</p>
                      </div>
                      <p className="font-semibold">
                        {(usage?.contacts?.used || 0).toLocaleString()} / {(subscription.plan?.max_contacts || 0).toLocaleString()}
                      </p>
                      <Progress
                        value={pct(usage?.contacts?.used || 0, subscription.plan?.max_contacts || 0)}
                        className="h-1.5"
                      />
                      <p className="text-xs text-muted-foreground text-right">
                        {pct(usage?.contacts?.used || 0, subscription.plan?.max_contacts || 0)}% used
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        <p className="text-sm text-muted-foreground">API Calls</p>
                      </div>
                      <p className="font-semibold">{usage?.messages_today?.used || 0} today</p>
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
                <Badge className="ml-2 bg-accent/20 text-primary">Save 20%</Badge>
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
  <ul className="space-y-2">
                    {/* Core limits */}
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-secondary" />
                      <span>{plan.max_instances} WhatsApp Instances</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-secondary" />
                      <span>{plan.max_messages_per_day.toLocaleString()} Messages/day</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-secondary" />
                      <span>{plan.max_contacts.toLocaleString()} Contacts</span>
                    </li>
                    {/* Feature labels from backend */}
                    {(plan.features as string[]).slice(3).map((feat, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-secondary" />
                        <span>{feat}</span>
                      </li>
                    ))}
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
                      subscription?.plan?.id === plan.id
                    }
                  >
                    {startCheckoutMutation.isPending && selectedPlanId === plan.id ? (
                      <Spinner size="sm" className="mr-2" />
                    ) : null}
                    {subscription?.plan?.id === plan.id ? "Current Plan" : "Get Started"}
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
                      {(usage?.messages_today?.used || 0).toLocaleString()} / {(subscription?.plan?.max_messages_per_day || 0).toLocaleString()}
                    </span>
                  </div>
                  <Progress
                    value={
                      subscription?.plan?.max_messages_per_day
                        ? ((usage?.messages_today?.used || 0) / subscription.plan.max_messages_per_day) * 100
                        : 0
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Sent Today</p>
                    <p className="text-xl font-bold">{usage?.messages_today?.used || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Remaining Today</p>
                    <p className="text-xl font-bold">{usage?.messages_today?.remaining || 0}</p>
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
                      {usage?.instances?.used || 0} / {subscription?.plan?.max_instances || 0}
                    </span>
                  </div>
                  <Progress
                    value={
                      subscription?.plan?.max_instances
                        ? ((usage?.instances?.used || 0) / subscription.plan.max_instances) * 100
                        : 0
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Used</p>
                    <p className="text-xl font-bold">{usage?.instances?.used || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Remaining</p>
                    <p className="text-xl font-bold">{usage?.instances?.remaining || 0}</p>
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
                      {(usage?.contacts?.used || 0).toLocaleString()} / {(subscription?.plan?.max_contacts || 0).toLocaleString()}
                    </span>
                  </div>
                  <Progress
                    value={
                      subscription?.plan?.max_contacts
                        ? ((usage?.contacts?.used || 0) / subscription.plan.max_contacts) * 100
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
                <div className="text-3xl font-bold">{usage?.messages_today?.used || 0}</div>
                <p className="text-sm text-muted-foreground">
                  Messages sent today
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
