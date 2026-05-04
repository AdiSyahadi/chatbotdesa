"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  RefreshCw,
  Users,
  Filter,
  Search,
  MoreVertical,
  Eye,
  Edit,
  Ban,
  CheckCircle,
  Shield,
  Building2,
} from "lucide-react";
import { cn, formatDate, getInitials } from "@/lib/utils";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  organization?: {
    id: string;
    name: string;
  };
  last_login_at?: string;
  created_at: string;
}

const roleConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  SUPER_ADMIN: { label: "Super Admin", color: "text-purple-700", bgColor: "bg-purple-100" },
  OWNER: { label: "Owner", color: "text-blue-700", bgColor: "bg-blue-100" },
  ADMIN: { label: "Admin", color: "text-indigo-700", bgColor: "bg-indigo-100" },
  MEMBER: { label: "Member", color: "text-gray-700", bgColor: "bg-gray-100" },
};

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  ACTIVE: { label: "Active", color: "text-green-700", bgColor: "bg-green-100" },
  INACTIVE: { label: "Inactive", color: "text-gray-700", bgColor: "bg-gray-100" },
  SUSPENDED: { label: "Suspended", color: "text-red-700", bgColor: "bg-red-100" },
  PENDING: { label: "Pending", color: "text-yellow-700", bgColor: "bg-yellow-100" },
};

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [filterRole, setFilterRole] = useState("__all__");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  const suspendMutation = useMutation({
    mutationFn: (userId: string) => adminApi.updateUser(userId, { is_active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("User berhasil disuspend");
    },
    onError: () => toast.error("Gagal suspend user"),
  });

  const activateMutation = useMutation({
    mutationFn: (userId: string) => adminApi.updateUser(userId, { is_active: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("User berhasil diaktifkan");
    },
    onError: () => toast.error("Gagal aktifkan user"),
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "users", { page, role: filterRole, status: filterStatus }],
    queryFn: () => adminApi.getUsers({ 
      page, 
      limit: 20, 
      role: filterRole === "__all__" ? undefined : filterRole,
      status: filterStatus === "__all__" ? undefined : filterStatus,
    }),
  });

  const users: User[] = data?.data?.users || [];
  const pagination = data?.data?.pagination;

  // Filter by search query client-side
  const filteredUsers = users.filter(
    (user) =>
      !searchQuery ||
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">
            Manage all users on the platform
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="w-40">
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger>
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All roles</SelectItem>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                  <SelectItem value="OWNER">Owner</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="MEMBER">Member</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users table */}
      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : filteredUsers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No users found</h3>
            <p className="text-muted-foreground mb-4 text-center max-w-sm">
              {searchQuery || filterRole || filterStatus
                ? "No users match your filters."
                : "No users have been created yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => {
                  const role = roleConfig[user.role] || roleConfig.MEMBER;
                  const status = statusConfig[user.status] || statusConfig.ACTIVE;
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src="" />
                            <AvatarFallback className="text-xs">
                              {getInitials(user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{user.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.organization ? (
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span>{user.organization.name}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn(role.bgColor, role.color, "border-0")}>
                          {role.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn(status.bgColor, status.color, "border-0")}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.last_login_at ? formatDate(user.last_login_at) : "Never"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(user.created_at)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem disabled>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled>
                              <Shield className="mr-2 h-4 w-4" />
                              Change Role
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {user.status === "ACTIVE" ? (
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => suspendMutation.mutate(user.id)}
                              >
                                <Ban className="mr-2 h-4 w-4" />
                                Suspend
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="text-green-600"
                                onClick={() => activateMutation.mutate(user.id)}
                              >
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Activate
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
          {/* Pagination */}
          {pagination && (
            <div className="flex items-center justify-between px-6 py-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {filteredUsers.length} of {pagination.total} users
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= pagination.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
