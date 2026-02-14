"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen p-6 bg-background">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Terjadi Kesalahan</h1>
          <p className="text-muted-foreground">
            Maaf, terjadi kesalahan yang tidak terduga.
          </p>
        </div>
        {process.env.NODE_ENV === "development" && (
          <pre className="w-full overflow-auto rounded-md bg-muted p-4 text-sm text-left text-muted-foreground">
            {error.message}
          </pre>
        )}
        <div className="flex justify-center gap-3">
          <Button onClick={reset}>Coba Lagi</Button>
          <Button onClick={() => (window.location.href = "/")} variant="outline">
            Kembali ke Beranda
          </Button>
        </div>
      </div>
    </div>
  );
}
