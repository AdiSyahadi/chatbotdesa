"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[DashboardError]", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Terjadi Kesalahan</CardTitle>
          <CardDescription>
            Maaf, terjadi kesalahan yang tidak terduga. Silakan coba lagi.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {process.env.NODE_ENV === "development" && (
            <pre className="w-full overflow-auto rounded-md bg-muted p-4 text-sm text-muted-foreground">
              {error.message}
            </pre>
          )}
          <div className="flex gap-3">
            <Button onClick={reset} variant="default">
              Coba Lagi
            </Button>
            <Button onClick={() => (window.location.href = "/dashboard")} variant="outline">
              Kembali ke Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
