"use client";

import { useState } from "react";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/hooks/use-queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  RefreshCw,
  Key,
  MoreHorizontal,
  Trash2,
  Copy,
  CheckCircle,
  XCircle,
  Shield,
  Eye,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "sonner";

interface ApiKeyType {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  rate_limit?: number;
  is_active: boolean;
  expires_at?: string;
  last_used_at?: string;
  created_at: string;
}

const PERMISSIONS = [
  { value: "message:read", label: "Baca Pesan" },
  { value: "message:send", label: "Kirim Pesan" },
  { value: "contact:read", label: "Baca Kontak" },
  { value: "contact:write", label: "Kelola Kontak" },
  { value: "instance:read", label: "Baca Instance" },
  { value: "instance:write", label: "Kelola Instance" },
  { value: "webhook:read", label: "Baca Webhook" },
  { value: "webhook:write", label: "Kelola Webhook" },
];

export default function ApiKeysPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedApiKey, setSelectedApiKey] = useState<ApiKeyType | null>(null);
  const [keyToRevoke, setKeyToRevoke] = useState<string | null>(null);
  const [newKeyResult, setNewKeyResult] = useState<{ key: string; name: string } | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formPermissions, setFormPermissions] = useState<string[]>([]);
  const [formExpiresAt, setFormExpiresAt] = useState("");

  const { data, isLoading, refetch } = useApiKeys();
  const createMutation = useCreateApiKey();
  const revokeMutation = useRevokeApiKey();

  const apiKeys: ApiKeyType[] = data?.data || [];

  const handleCreate = async () => {
    if (!formName || formPermissions.length === 0) return;

    try {
      const result = await createMutation.mutateAsync({
        name: formName,
        permissions: formPermissions,
        expires_at: formExpiresAt || undefined,
      });
      
      // Show the new key to user - backend returns api_key field
      if (result?.data?.api_key) {
        setNewKeyResult({ key: result.data.api_key, name: formName });
      }
      
      setCreateDialogOpen(false);
      resetForm();
    } catch {
      // Error handled by mutation
    }
  };

  const handleRevoke = async () => {
    if (!keyToRevoke) return;
    try {
      await revokeMutation.mutateAsync(keyToRevoke);
      setRevokeDialogOpen(false);
      setKeyToRevoke(null);
    } catch {
      // Error handled by mutation
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("API key disalin ke clipboard");
  };

  const togglePermission = (permission: string) => {
    setFormPermissions((prev) =>
      prev.includes(permission)
        ? prev.filter((p) => p !== permission)
        : [...prev, permission]
    );
  };

  const resetForm = () => {
    setFormName("");
    setFormPermissions([]);
    setFormExpiresAt("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground">
            Kelola API keys untuk akses programmatic ke WhatsApp API
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Buat API Key
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Buat API Key Baru</DialogTitle>
                <DialogDescription>
                  Buat API key untuk mengakses API secara programmatic
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nama Key</Label>
                  <Input
                    id="name"
                    placeholder="contoh: Production Server"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expires">Tanggal Kedaluwarsa (Opsional)</Label>
                  <Input
                    id="expires"
                    type="date"
                    value={formExpiresAt}
                    onChange={(e) => setFormExpiresAt(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Permissions</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {PERMISSIONS.map((perm) => (
                      <div
                        key={perm.value}
                        className="flex items-center space-x-2"
                      >
                        <Checkbox
                          id={perm.value}
                          checked={formPermissions.includes(perm.value)}
                          onCheckedChange={() => togglePermission(perm.value)}
                        />
                        <label
                          htmlFor={perm.value}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {perm.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCreateDialogOpen(false);
                    resetForm();
                  }}
                >
                  Batal
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={
                    createMutation.isPending ||
                    !formName ||
                    formPermissions.length === 0
                  }
                >
                  {createMutation.isPending && (
                    <Spinner size="sm" className="mr-2" />
                  )}
                  Buat API Key
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* New key result dialog */}
      <Dialog open={!!newKeyResult} onOpenChange={() => setNewKeyResult(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              API Key Berhasil Dibuat
            </DialogTitle>
            <DialogDescription>
              Simpan API key berikut dengan aman. Key ini tidak akan ditampilkan lagi setelah dialog ini ditutup.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nama</Label>
              <p className="text-sm">{newKeyResult?.name}</p>
            </div>
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-3 bg-muted rounded-md text-sm font-mono break-all">
                  {newKeyResult?.key}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => newKeyResult && copyKey(newKeyResult.key)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                <strong>Perhatian:</strong> Simpan API key ini sekarang. Anda tidak akan bisa melihatnya lagi setelah menutup dialog ini.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKeyResult(null)}>
              Saya Sudah Menyimpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Security info card */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-600" />
            <span className="text-blue-900">Keamanan API Key</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Jangan pernah membagikan API key Anda</li>
            <li>Gunakan API key dengan permission minimum yang diperlukan</li>
            <li>Cabut API key yang tidak lagi digunakan</li>
            <li>Rotasi API key secara berkala untuk keamanan</li>
          </ul>
        </CardContent>
      </Card>

      {/* API Keys table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : apiKeys.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Key className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Belum Ada API Key</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
              Buat API key untuk mengakses WhatsApp API secara programmatic
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Buat API Key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Terakhir Digunakan</TableHead>
                <TableHead>Kedaluwarsa</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{apiKey.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-sm bg-muted px-2 py-1 rounded">
                        {apiKey.key_prefix}•••••••••••••
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          navigator.clipboard.writeText(apiKey.key_prefix);
                          toast.info("Prefix API key disalin (bukan key lengkap)");
                        }}
                        title="Copy Prefix"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setSelectedApiKey(apiKey);
                          setDetailDialogOpen(true);
                        }}
                        title="Lihat Detail"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {apiKey.permissions.slice(0, 2).map((perm) => (
                        <Badge key={perm} variant="secondary" className="text-xs">
                          {perm.split(":")[0]}
                        </Badge>
                      ))}
                      {apiKey.permissions.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{apiKey.permissions.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={cn(
                        apiKey.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      )}
                    >
                      {apiKey.is_active ? (
                        <>
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3 mr-1" />
                          Revoked
                        </>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {apiKey.last_used_at
                        ? formatDate(apiKey.last_used_at)
                        : "Belum pernah"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {apiKey.expires_at
                        ? formatDate(apiKey.expires_at)
                        : "Tidak kedaluwarsa"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedApiKey(apiKey);
                            setDetailDialogOpen(true);
                          }}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Lihat Detail
                        </DropdownMenuItem>
                        {apiKey.is_active && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              setKeyToRevoke(apiKey.id);
                              setRevokeDialogOpen(true);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Cabut Key
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* API Key Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Detail API Key
            </DialogTitle>
            <DialogDescription>
              Informasi lengkap tentang API key ini
            </DialogDescription>
          </DialogHeader>
          {selectedApiKey && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Nama</Label>
                <p className="font-medium">{selectedApiKey.name}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">API Key Prefix</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-muted rounded-md text-sm font-mono">
                    {selectedApiKey.key_prefix}•••••••••••••
                  </code>
                </div>
                <p className="text-xs text-muted-foreground">
                  API Key lengkap hanya ditampilkan sekali saat dibuat. Jika Anda kehilangan key, silakan buat API key baru.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Status</Label>
                <div>
                  <Badge
                    variant="secondary"
                    className={cn(
                      selectedApiKey.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    )}
                  >
                    {selectedApiKey.is_active ? (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Active
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3 mr-1" />
                        Revoked
                      </>
                    )}
                  </Badge>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Permissions</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedApiKey.permissions.map((perm) => {
                    const permInfo = PERMISSIONS.find(p => p.value === perm);
                    return (
                      <Badge key={perm} variant="secondary">
                        {permInfo?.label || perm}
                      </Badge>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Dibuat</Label>
                  <p className="text-sm">{formatDate(selectedApiKey.created_at)}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Terakhir Digunakan</Label>
                  <p className="text-sm">
                    {selectedApiKey.last_used_at
                      ? formatDate(selectedApiKey.last_used_at)
                      : "Belum pernah"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Kedaluwarsa</Label>
                  <p className="text-sm">
                    {selectedApiKey.expires_at
                      ? formatDate(selectedApiKey.expires_at)
                      : "Tidak kedaluwarsa"}
                  </p>
                </div>
                {selectedApiKey.rate_limit && (
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Rate Limit</Label>
                    <p className="text-sm">{selectedApiKey.rate_limit} req/menit</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Tutup
            </Button>
            {selectedApiKey?.is_active && (
              <Button
                variant="destructive"
                onClick={() => {
                  setDetailDialogOpen(false);
                  setKeyToRevoke(selectedApiKey.id);
                  setRevokeDialogOpen(true);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Cabut Key
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation dialog */}
      <Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cabut API Key</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin mencabut API key ini? Aplikasi yang menggunakan key ini tidak akan bisa mengakses API lagi.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRevokeDialogOpen(false)}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending && (
                <Spinner size="sm" className="mr-2" />
              )}
              Cabut Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
