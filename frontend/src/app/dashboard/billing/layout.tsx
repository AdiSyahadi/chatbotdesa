"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { Spinner } from "@/components/ui/spinner";

const ALLOWED_ROLES = ["SUPER_ADMIN", "ORG_OWNER"];

export default function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    } else if (!isLoading && !ALLOWED_ROLES.includes(user?.role || "")) {
      router.push("/dashboard");
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated || !ALLOWED_ROLES.includes(user?.role || "")) {
    return null;
  }

  return <>{children}</>;
}
