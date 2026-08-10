"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/lib/api/auth";
import { Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user } = useAuthStore();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (user) {
      setIsAdmin(user.role === "admin");
    } else {
      setIsAdmin(false);
    }
  }, [user]);

  if (isAdmin === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-cyan animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <ShieldAlert className="w-16 h-16 text-rose-500 mb-4" />
        <h1 className="text-2xl font-black mb-2 text-foreground">Эрх хүрэлцэхгүй байна</h1>
        <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
          Энэхүү хэсэгт зөвхөн Системийн Администратор нэвтрэх боломжтой.
        </p>
        <Link href="/dashboard">
          <button className="px-5 py-2.5 rounded-xl gradient-brand text-white font-semibold text-sm">
            Сурагчийн самбар руу очих
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col lg:flex-row gap-8">
        {/* Sidebar Nav */}
        <aside className="w-full lg:w-64 shrink-0">
          <div className="glass rounded-2xl p-4 border border-border/40 space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase font-black tracking-wider px-3 mb-2">Админ удирдлага</div>
            {[
              { label: "Хянах самбар", href: "/admin/dashboard" },
              { label: "И-мэйл SMTP тохиргоо", href: "/admin/settings/email" },
            ].map((item) => (
              <Link key={item.label} href={item.href}>
                <div className="px-3 py-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-all cursor-pointer">
                  {item.label}
                </div>
              </Link>
            ))}
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1">
          {children}
        </main>
      </div>
      <Footer />
    </div>
  );
}
