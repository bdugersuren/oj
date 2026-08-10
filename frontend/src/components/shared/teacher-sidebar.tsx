"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { authApi } from "@/lib/api/auth";
import { 
  Trophy, BookOpen, Compass, Users, Brain, LayoutDashboard, 
  ChevronLeft, ChevronRight, User, LogOut
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import toast from "react-hot-toast";

export function TeacherSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout: logoutStore } = useAuthStore();

  const handleLogout = async () => {
    try {
      await authApi.logout();
      logoutStore();
      toast.success("Амжилттай гарлаа.");
      router.push("/auth/login");
    } catch (err) {
      toast.error("Гарахад алдаа гарлаа.");
    }
  };

  const navItems = [
    { label: "Хянах самбар", path: "/teacher/dashboard", icon: LayoutDashboard },
    { label: "Анги удирдлага", path: "/teacher", icon: Users },
    { label: "Хичээлүүд", path: "/teacher/lessons", icon: BookOpen },
    { label: "Бодлогууд", path: "/teacher/problems", icon: Compass },
    { label: "AI Өгөгдөл бэлтгэх", path: "/teacher/ai-curator", icon: Brain },
  ];

  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

  return (
    <aside 
      className={`glass-strong border-r border-white/10 flex flex-col justify-between h-screen sticky top-0 transition-all duration-300 z-50 ${
        isCollapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <Link href="/teacher/dashboard" className="flex items-center gap-3 overflow-hidden">
          <div className="bg-gradient-brand p-2.5 rounded-2xl flex items-center justify-center shrink-0 shadow-md shadow-brand-cyan/20">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          {!isCollapsed && (
            <span className="font-black text-lg bg-gradient-to-r from-brand-cyan via-brand-emerald to-brand-violet bg-clip-text text-transparent tracking-tight whitespace-nowrap">
              OJ Teacher
            </span>
          )}
        </Link>
        {!isCollapsed && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setIsCollapsed(true)}
            className="h-8 w-8 rounded-xl hover:bg-white/5"
          >
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        {isCollapsed && (
          <div className="flex justify-center mb-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsCollapsed(false)}
              className="h-8 w-8 rounded-xl hover:bg-white/5"
            >
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        )}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.path || (item.path !== "/teacher" && pathname.startsWith(item.path));
          
          return (
            <Link 
              key={item.path} 
              href={item.path}
              className={`flex items-center gap-3 px-3 py-3 rounded-2xl transition-all duration-200 group relative ${
                isActive 
                  ? "bg-brand-cyan/10 text-brand-cyan font-bold border border-brand-cyan/20" 
                  : "text-muted-foreground hover:bg-white/5 hover:text-foreground border border-transparent"
              }`}
            >
              <Icon className={`w-5 h-5 shrink-0 ${isActive ? "text-brand-cyan" : "group-hover:text-foreground"}`} />
              {!isCollapsed && <span className="text-sm tracking-wide">{item.label}</span>}
              {isCollapsed && (
                <span className="absolute left-24 bg-card border border-border text-foreground px-2 py-1 rounded-md text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/10 flex flex-col gap-4">
        {/* Theme Toggle */}
        <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between"}`}>
          {!isCollapsed && <span className="text-xs text-muted-foreground">Харагдац</span>}
          {/* We import custom ThemeToggle but we wrap it to match layout */}
          <ThemeToggle />
        </div>

        {/* User Dropdown */}
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger className={`flex items-center gap-3 p-2 rounded-2xl hover:bg-white/5 transition-all w-full text-left focus:outline-none cursor-pointer ${
              isCollapsed ? "justify-center" : ""
            }`}>
              <Avatar className="h-9 w-9 border border-brand-cyan/20">
                <AvatarImage src={user.avatar_url || undefined} />
                <AvatarFallback className="bg-brand-cyan/15 text-brand-cyan text-xs font-bold">
                  {getInitials(user.full_name || user.username)}
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="overflow-hidden flex-1">
                  <p className="text-xs font-bold text-foreground truncate">{user.full_name || user.username}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                </div>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl glass-strong border-white/10 p-1">
              <DropdownMenuItem className="rounded-xl hover:bg-white/5 cursor-pointer p-0">
                <Link href="/teacher/profile" className="flex items-center gap-2 px-3 py-2 text-sm text-foreground w-full">
                  <User className="w-4 h-4 text-brand-cyan" />
                  Профайл тохиргоо
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="rounded-xl hover:bg-rose-500/10 text-rose-500 cursor-pointer px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <LogOut className="w-4 h-4" />
                  Гарах
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </aside>
  );
}
