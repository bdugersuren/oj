"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import type { UserRole } from "@/lib/api/auth";

export function RoleGate({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.isLoading);
  const allowed = Boolean(user && roles.includes(user.role));
  useEffect(() => {
    if (!loading && !allowed) router.replace(user ? "/dashboard" : "/auth/login");
  }, [allowed, loading, router, user]);
  if (loading || !allowed) return <main className="p-8 text-sm text-muted-foreground">Эрх шалгаж байна…</main>;
  return <>{children}</>;
}
