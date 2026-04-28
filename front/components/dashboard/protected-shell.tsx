"use client";

import type { Route } from "next";
import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Boxes,
  Cloud,
  CreditCard,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Server,
  UserRound,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: Route;
  icon: typeof LayoutDashboard;
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Catalog", href: "/catalog", icon: Boxes },
  { label: "Lab Builder", href: "/builder" as Route, icon: GitBranch },
  { label: "My Labs", href: "/labs", icon: Server },
  { label: "Account", href: "/account", icon: UserRound },
];

function SidebarNav({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-1 p-3" aria-label="Primary navigation">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex h-10 items-center gap-3 rounded-lg px-3 text-sm",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <Icon className={cn("h-4 w-4", active && "text-primary")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ProtectedShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 hidden w-[220px] border-r border-border bg-[#0b0b11] lg:flex lg:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-border px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card">
            <Cloud className="h-4 w-4 text-primary" />
          </div>
          <span className="text-sm font-medium">Orchestryx</span>
        </div>

        <SidebarNav pathname={pathname} />

        <div className="border-t border-border p-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="truncate text-sm text-foreground">{user?.email ?? "Signed in"}</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                <CreditCard className="h-3.5 w-3.5" />
                {user?.credits_balance ?? 0} credits
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[220px]">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-medium">
            <Cloud className="h-4 w-4 text-primary" />
            Orchestryx
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>
        <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
          <DialogContent className="left-0 top-0 h-screen w-[min(22rem,100vw)] max-w-none translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-0">
            <DialogHeader className="border-b border-border p-4">
              <DialogTitle className="flex items-center gap-2 text-sm">
                <Cloud className="h-4 w-4 text-primary" />
                Orchestryx
              </DialogTitle>
            </DialogHeader>
            <SidebarNav pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <div className="border-t border-border p-3">
              <p className="truncate text-sm text-foreground">{user?.email ?? "Signed in"}</p>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-3 flex h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </DialogContent>
        </Dialog>
        <motion.main
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-6 lg:px-8"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
