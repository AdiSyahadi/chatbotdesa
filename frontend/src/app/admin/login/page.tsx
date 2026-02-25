"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ShieldCheck, Eye, EyeOff, AlertTriangle, Lock } from "lucide-react";
import { toast } from "sonner";

export default function AdminLoginPage() {
  const router = useRouter();
  const { login, logout, isLoading, isAuthenticated, user } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  // If already authenticated as SUPER_ADMIN, go straight to dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated && user?.role === "SUPER_ADMIN") {
      router.replace("/dashboard/admin");
    }
  }, [isLoading, isAuthenticated, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccessDenied(false);

    if (!email || !password) {
      toast.error("Email dan password harus diisi");
      return;
    }

    try {
      await login(email, password);

      // Read role after login completes
      const currentUser = useAuthStore.getState().user;

      if (currentUser?.role !== "SUPER_ADMIN") {
        // Not an admin — force logout and show denial
        await logout();
        setAccessDenied(true);
        setPassword("");
        return;
      }

      toast.success("Selamat datang, Administrator");
      router.replace("/dashboard/admin");
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Login gagal. Periksa email dan password Anda.";
      toast.error(message);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      {/* Background texture */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-800/30 via-zinc-950 to-zinc-950 pointer-events-none" />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 shadow-xl mb-4">
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Admin Panel</h1>
          <p className="text-zinc-500 text-sm mt-1">Akses terbatas — hanya Super Administrator</p>
        </div>

        {/* Access Denied Banner */}
        {accessDenied && (
          <div className="flex items-start gap-3 bg-red-950/60 border border-red-800/60 rounded-xl p-4 mb-5 text-sm text-red-300">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-400" />
            <div>
              <p className="font-semibold text-red-300">Akses Ditolak</p>
              <p className="text-red-400/80 mt-0.5">
                Akun ini tidak memiliki hak akses administrator.
              </p>
            </div>
          </div>
        )}

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-zinc-300 text-sm">
                Email Administrator
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setAccessDenied(false);
                }}
                disabled={isLoading}
                required
                autoComplete="username"
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-600"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-zinc-300 text-sm">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setAccessDenied(false);
                  }}
                  disabled={isLoading}
                  required
                  autoComplete="current-password"
                  className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-600 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-10 transition-colors"
              disabled={isLoading}
            >
              {isLoading ? (
                <Spinner size="sm" className="text-white" />
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Masuk ke Admin Panel
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Footer note */}
        <p className="text-center text-zinc-600 text-xs mt-6">
          Halaman ini dipantau dan dilindungi secara ketat.
          <br />
          Semua aktivitas dicatat dalam audit log.
        </p>
      </div>
    </div>
  );
}
