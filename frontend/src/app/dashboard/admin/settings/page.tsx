"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Construction } from "lucide-react";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Settings</h1>
        <p className="text-muted-foreground">Konfigurasi sistem SaaS</p>
      </div>

      <Card>
        <CardContent className="p-12 text-center text-muted-foreground">
          <Construction className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">Coming Soon</p>
          <p className="text-sm mt-2">
            Halaman ini akan berisi pengaturan sistem seperti konfigurasi email,
            domain, branding, dan pengaturan global lainnya.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
