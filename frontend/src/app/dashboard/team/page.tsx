"use client";

import { useState } from "react";
import { useTeamMembers, useInviteMember, useUpdateMember, useRemoveMember } from "@/hooks/use-queries";
import { useAuthStore } from "@/stores/auth.store";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Users,
  MoreHorizontal,
  Pencil,
  Trash2,
  Mail,
  Shield,
  ShieldCheck,
  UserCog,
  Crown,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  avatar_url?: string;
  last_login_at?: string;
  created_at: string;
}

const ROLES = [
  { value: "ORG_OWNER", label: "Owner", description: "Akses penuh ke semua fitur", icon: Crown },
  { value: "ORG_ADMIN", label: "Admin", description: "Kelola tim dan pengaturan", icon: ShieldCheck },
  { value: "ORG_MEMBER", label: "Member", description: "Akses dasar", icon: Shield },
];

export default function TeamPage() {
  const { user } = useAuthStore();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<TeamMember | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<string | null>(null);

  // Form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("ORG_MEMBER");
  const [editRole, setEditRole] = useState("");

  const { data, isLoading, refetch } = useTeamMembers();
  const inviteMutation = useInviteMember();
  const updateMutation = useUpdateMember();
  const removeMutation = useRemoveMember();

  const members: TeamMember[] = data?.data?.users || [];

  const handleInvite = async () => {
    if (!inviteEmail) return;

    try {
      await inviteMutation.mutateAsync({
        email: inviteEmail,
        role: inviteRole,
      });
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("ORG_MEMBER");
    } catch {
      // Error handled by mutation
    }
  };

  const handleUpdateRole = async () => {
    if (!memberToEdit || !editRole) return;

    try {
      await updateMutation.mutateAsync({
        id: memberToEdit.id,
        data: { role: editRole },
      });
      setEditDialogOpen(false);
      setMemberToEdit(null);
      setEditRole("");
    } catch {
      // Error handled by mutation
    }
  };

  const handleRemove = async () => {
    if (!memberToDelete) return;
    try {
      await removeMutation.mutateAsync(memberToDelete);
      setDeleteDialogOpen(false);
      setMemberToDelete(null);
    } catch {
      // Error handled by mutation
    }
  };

  const openEditDialog = (member: TeamMember) => {
    setMemberToEdit(member);
    setEditRole(member.role);
    setEditDialogOpen(true);
  };

  const getRoleBadge = (role: string) => {
    const roleConfig = ROLES.find((r) => r.value === role);
    const colors: Record<string, string> = {
      ORG_OWNER: "bg-purple-100 text-purple-700",
      ORG_ADMIN: "bg-blue-100 text-blue-700",
      ORG_MEMBER: "bg-gray-100 text-gray-700",
    };

    return (
      <Badge className={cn("flex items-center gap-1", colors[role] || colors.ORG_MEMBER)}>
        {roleConfig?.icon && <roleConfig.icon className="h-3 w-3" />}
        {roleConfig?.label || role}
      </Badge>
    );
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tim</h1>
          <p className="text-muted-foreground">
            Kelola anggota tim dan hak akses organisasi Anda
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Undang Anggota
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Undang Anggota Baru</DialogTitle>
                <DialogDescription>
                  Kirim undangan email untuk bergabung ke tim Anda
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.filter((r) => r.value !== "ORG_OWNER").map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          <div className="flex items-center gap-2">
                            <role.icon className="h-4 w-4" />
                            <div>
                              <span className="font-medium">{role.label}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                {role.description}
                              </span>
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setInviteDialogOpen(false)}
                >
                  Batal
                </Button>
                <Button
                  onClick={handleInvite}
                  disabled={inviteMutation.isPending || !inviteEmail}
                >
                  {inviteMutation.isPending && (
                    <Spinner size="sm" className="mr-2" />
                  )}
                  <Mail className="mr-2 h-4 w-4" />
                  Kirim Undangan
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Role descriptions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ROLES.map((role) => (
          <Card key={role.value}>
            <CardContent className="p-4 flex items-start gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                role.value === "ORG_OWNER" && "bg-purple-100",
                role.value === "ORG_ADMIN" && "bg-blue-100",
                role.value === "ORG_MEMBER" && "bg-gray-100"
              )}>
                <role.icon className={cn(
                  "h-5 w-5",
                  role.value === "ORG_OWNER" && "text-purple-600",
                  role.value === "ORG_ADMIN" && "text-blue-600",
                  role.value === "ORG_MEMBER" && "text-gray-600"
                )} />
              </div>
              <div>
                <h3 className="font-medium">{role.label}</h3>
                <p className="text-sm text-muted-foreground">{role.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Team members table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : members.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Belum Ada Anggota Tim</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">
              Undang anggota tim untuk berkolaborasi dalam mengelola WhatsApp API
            </p>
            <Button onClick={() => setInviteDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Undang Anggota
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Anggota</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Login Terakhir</TableHead>
                <TableHead>Bergabung</TableHead>
                <TableHead className="w-[70px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={member.avatar_url} />
                        <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {member.name}
                          {member.id === user?.id && (
                            <span className="text-xs text-muted-foreground ml-2">(Anda)</span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{getRoleBadge(member.role)}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={cn(
                        member.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      )}
                    >
                      {member.is_active ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {member.last_login_at
                        ? formatDate(member.last_login_at)
                        : "Belum pernah"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {formatDate(member.created_at)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {member.id !== user?.id && member.role !== "ORG_OWNER" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(member)}>
                            <UserCog className="mr-2 h-4 w-4" />
                            Ubah Role
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              setMemberToDelete(member.id);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Hapus dari Tim
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Edit role dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ubah Role</DialogTitle>
            <DialogDescription>
              Ubah role untuk {memberToEdit?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Role Baru</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter((r) => r.value !== "ORG_OWNER").map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      <div className="flex items-center gap-2">
                        <role.icon className="h-4 w-4" />
                        <span>{role.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleUpdateRole}
              disabled={updateMutation.isPending || !editRole}
            >
              {updateMutation.isPending && <Spinner size="sm" className="mr-2" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Anggota</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus anggota ini dari tim? Mereka tidak akan bisa mengakses organisasi lagi.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemove}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending && <Spinner size="sm" className="mr-2" />}
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
