"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth.store";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Webhook,
  Key,
  FileText,
  UserCog,
  CreditCard,
  Settings,
  Shield,
  Building2,
  MonitorSmartphone,
  Receipt,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  children?: { label: string; href: string }[];
  roles?: string[];
}

/** Nav items untuk tenant (ORG_OWNER / ORG_ADMIN / ORG_MEMBER) */
const tenantNavItems: NavItem[] = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    href: "/dashboard",
  },
  {
    icon: MessageSquare,
    label: "WhatsApp",
    href: "/dashboard/whatsapp",
    children: [
      { label: "Instances", href: "/dashboard/whatsapp/instances" },
      { label: "Messages", href: "/dashboard/whatsapp/messages" },
      { label: "Broadcast", href: "/dashboard/whatsapp/broadcast" },
    ],
  },
  {
    icon: Users,
    label: "Contacts",
    href: "/dashboard/contacts",
  },
  {
    icon: Webhook,
    label: "Webhooks",
    href: "/dashboard/webhooks",
  },
  {
    icon: Key,
    label: "API Keys",
    href: "/dashboard/api-keys",
  },
  {
    icon: FileText,
    label: "API Docs",
    href: "/dashboard/docs",
  },
  {
    icon: UserCog,
    label: "Team",
    href: "/dashboard/team",
    roles: ["ORG_OWNER", "ORG_ADMIN"],
  },
  {
    icon: CreditCard,
    label: "Billing",
    href: "/dashboard/billing",
    roles: ["ORG_OWNER"],
  },
  {
    icon: Settings,
    label: "Settings",
    href: "/dashboard/settings",
  },
];

/** Nav items untuk SUPER_ADMIN (pemilik SaaS) */
const adminNavItems: NavItem[] = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    href: "/dashboard/admin",
  },
  {
    icon: Building2,
    label: "Organizations",
    href: "/dashboard/admin/organizations",
  },
  {
    icon: Users,
    label: "Users",
    href: "/dashboard/admin/users",
  },
  {
    icon: MonitorSmartphone,
    label: "Instances",
    href: "/dashboard/admin/instances",
  },
  {
    icon: Shield,
    label: "Plans",
    href: "/dashboard/admin/plans",
  },
  {
    icon: Receipt,
    label: "Invoices",
    href: "/dashboard/admin/invoices",
  },
  {
    icon: CreditCard,
    label: "Payments",
    href: "/dashboard/admin/payments",
  },
  {
    icon: Settings,
    label: "Settings",
    href: "/dashboard/admin/settings",
  },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const baseNavItems = isSuperAdmin ? adminNavItems : tenantNavItems;

  const filteredNavItems = baseNavItems.filter((item) => {
    if (!item.roles) return true;
    return item.roles.includes(user?.role || "");
  });

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen border-r bg-background transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          {!collapsed && (
            <Link href={isSuperAdmin ? "/dashboard/admin" : "/dashboard"} className="flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold">{isSuperAdmin ? "WA Admin" : "WA SaaS"}</span>
            </Link>
          )}
          {collapsed && (
            <Link href={isSuperAdmin ? "/dashboard/admin" : "/dashboard"} className="mx-auto">
              <MessageSquare className="h-6 w-6 text-primary" />
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", collapsed && "hidden")}
            onClick={onToggle}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="space-y-1">
            {filteredNavItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.children?.some((child) => pathname === child.href));
              const Icon = item.icon;

              if (item.children && !collapsed) {
                return (
                  <div key={item.href} className="space-y-1">
                    <div
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5 flex-shrink-0" />
                      <span>{item.label}</span>
                    </div>
                    <div className="ml-8 space-y-1">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "flex items-center rounded-lg px-3 py-2 text-sm transition-colors",
                            pathname === child.href
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                          )}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.children ? item.children[0].href : item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    collapsed && "justify-center px-2"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t p-3">
          {collapsed ? (
            <div className="flex flex-col gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="mx-auto"
                onClick={onToggle}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="mx-auto text-destructive hover:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleLogout}
            >
              <LogOut className="h-5 w-5" />
              <span>Logout</span>
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}
