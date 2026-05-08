"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ProtectedShell } from "@/components/dashboard/protected-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";

// Client-side protected wrapper that redirects if no in-memory token is available.
export default function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthReady, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthReady, isAuthenticated, router]);

  if (!isAuthReady || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      </div>
    );
  }

  if (pathname?.startsWith("/admin")) {
    return <>{children}</>;
  }

  return <ProtectedShell>{children}</ProtectedShell>;
}
