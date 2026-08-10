"use client";

import { useEffect } from "react";
import { authApi } from "@/lib/api/auth";
import { useAuthStore } from "@/store/auth";

export function SessionBootstrap() {
  const setUser = useAuthStore((state) => state.setUser);
  const setLoading = useAuthStore((state) => state.setLoading);
  useEffect(() => {
    setLoading(true);
    authApi.me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, [setLoading, setUser]);
  return null;
}
