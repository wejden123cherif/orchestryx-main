"use client";

import type { Route } from "next";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Boxes,
  ChevronRight,
  CreditCard,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  Shield,
  UserRound,
  X,
} from "lucide-react";
import { OrchestrYXLogo } from "@/components/ui/orchestryx-logo";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemePopover } from "@/components/platform/theme-switcher";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: Route;
  icon: typeof LayoutDashboard;
  badge?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Catalog", href: "/catalog", icon: Boxes },
      { label: "Lab Builder", href: "/builder" as Route, icon: GitBranch, badge: "Beta" },
    ],
  },
  {
    label: "Operate",
    items: [
      { label: "My Labs", href: "/labs", icon: Server },
      { label: "Account", href: "/account", icon: UserRound },
    ],
  },
];

const adminNavItem: NavItem = { label: "Admin Console", href: "/admin" as Route, icon: Shield };

function isActiveRoute(pathname: string, href: Route) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const breadcrumbMap: Record<string, string> = {
  dashboard: "Dashboard",
  catalog: "Catalog",
  builder: "Lab Builder",
  labs: "My Labs",
  account: "Account",
  admin: "Admin Console",
};

function Breadcrumbs({ pathname }: { pathname: string }) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return null;

  const crumbs = segments.map((seg, i) => ({
    label: breadcrumbMap[seg] ?? seg,
    href: "/" + segments.slice(0, i + 1).join("/"),
    isLast: i === segments.length - 1,
  }));

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
      {crumbs.map((crumb) => (
        <span key={crumb.href} className="flex items-center gap-1.5">
          {!crumb.isLast ? (
            <>
              <Link href={crumb.href as Route} className="hover:text-foreground transition-colors">
                {crumb.label}
              </Link>
              <ChevronRight className="h-3 w-3 opacity-40" />
            </>
          ) : (
            <span className="text-foreground">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function SidebarNav({
  pathname,
  isAdmin,
  collapsed,
  onNavigate,
}: {
  pathname: string;
  isAdmin?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const groups = isAdmin
    ? [...navGroups, { label: "Administration", items: [adminNavItem] }]
    : navGroups;

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Primary navigation">
      {groups.map((group) => (
        <div key={group.label} className="space-y-0.5">
          {!collapsed && (
            <p className="mb-2 px-2.5 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">
              {group.label}
            </p>
          )}
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = isActiveRoute(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors",
                  collapsed ? "h-10 justify-center" : "h-9 px-2.5",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <Icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-primary")} />
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="rounded border border-border bg-secondary px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                        {item.badge}
                      </span>
                    ) : null}
                  </>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function ShellSidebar({
  pathname,
  collapsed,
  onCollapse,
  onNavigate,
}: {
  pathname: string;
  collapsed: boolean;
  onCollapse?: () => void;
  onNavigate?: () => void;
}) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn(
        "flex h-14 items-center gap-2.5 border-b border-sidebar-border",
        collapsed ? "justify-center px-2" : "px-4"
      )}>
        <OrchestrYXLogo className="h-8 w-8 shrink-0" />
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight">Orchestryx</span>
        )}
        {onCollapse && !collapsed && (
          <button
            type="button"
            onClick={onCollapse}
            className="ml-auto rounded-md p-1 text-muted-foreground/60 hover:text-foreground"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <SidebarNav
        pathname={pathname}
        isAdmin={user?.role === "admin"}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />

      <div className={cn("border-t border-sidebar-border", collapsed ? "p-2" : "p-3")}>
        <div className={cn("rounded-lg border border-sidebar-border bg-secondary/40", collapsed ? "p-2" : "px-3 py-2.5")}>
          {collapsed ? (
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-8 w-full items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <UserRound className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">{user?.email ?? "Signed in"}</p>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <CreditCard className="h-3 w-3" />
                  {user?.credits_balance ?? 0} credits
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md p-1 text-muted-foreground/60 hover:text-foreground"
                aria-label="Log out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProtectedShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const sidebarWidth = collapsed ? 64 : 252;

  const pageTitle = useMemo(() => {
    if (pathname.startsWith("/catalog")) return "Catalog";
    if (pathname.startsWith("/builder")) return "Lab Builder";
    if (pathname.startsWith("/labs")) return "My Labs";
    if (pathname.startsWith("/account")) return "Account";
    return "Dashboard";
  }, [pathname]);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div className="range-shell min-h-screen bg-background text-foreground">
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden border-r border-sidebar-border lg:block"
        style={{ width: sidebarWidth }}
      >
        <ShellSidebar
          pathname={pathname}
          collapsed={collapsed}
          onCollapse={() => setCollapsed(!collapsed)}
        />
      </aside>

      <div className={cn("transition-[padding] duration-200", collapsed ? "lg:pl-16" : "lg:pl-[252px]")}>
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/82 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-2 text-muted-foreground hover:text-foreground lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            {collapsed && (
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="hidden rounded-md p-1.5 text-muted-foreground/60 hover:text-foreground lg:flex"
                aria-label="Expand sidebar"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
            <div className="hidden min-w-0 lg:block">
              <Breadcrumbs pathname={pathname} />
              {pathname.split("/").filter(Boolean).length <= 1 && (
                <p className="text-sm font-medium text-foreground">{pageTitle}</p>
              )}
            </div>
            <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold lg:hidden">
              <OrchestrYXLogo className="h-5 w-5" />
              Orchestryx
            </Link>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="hidden h-8 items-center gap-2 rounded-full border border-success/20 bg-success/8 px-3 text-[11px] font-medium text-success md:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-success pulse-dot" />
              Private range
            </span>
            <Link
              href="/catalog"
              className="hidden h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 sm:inline-flex"
            >
              <Boxes className="h-3.5 w-3.5" />
              New lab
            </Link>
            <ThemePopover />
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md p-2 text-muted-foreground hover:text-foreground"
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
          <DialogContent className="left-0 top-0 h-screen w-[min(18rem,100vw)] max-w-none translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-0">
            <DialogHeader className="sr-only">
              <DialogTitle>Navigation</DialogTitle>
            </DialogHeader>
            <div className="absolute right-3 top-3 z-10">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-2 text-muted-foreground hover:text-foreground"
                aria-label="Close navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ShellSidebar
              pathname={pathname}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </DialogContent>
        </Dialog>

        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="mx-auto min-h-[calc(100vh-3.5rem)] w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
