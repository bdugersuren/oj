"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trophy, LogOut, User, LayoutDashboard, Compass, Trophy as RankIcon, BookOpen, ShieldAlert, Users } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { authApi } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import toast from "react-hot-toast";

export function Navbar() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logoutUser = useAuthStore((state) => state.logout);
  const isLoading = useAuthStore((state) => state.isLoading);

  const handleLogout = async () => {
    try {
      await authApi.logout();
      logoutUser();
      toast.success("Системээс амжилттай гарлаа.");
      router.push("/auth/login");
    } catch (err) {
      toast.error("Гарахад алдаа гарлаа.");
    }
  };

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <nav className="sticky top-0 z-40 glass border-b border-border/40 h-16 w-full">
      <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
        
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
          <div className="w-8 h-8 rounded-xl gradient-brand flex items-center justify-center shadow-md shadow-purple-500/10">
            <Trophy className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-black gradient-text-brand tracking-tight">OJ Platform</span>
        </Link>

        {/* Mid Navigation Links */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs font-bold">
          <Link href="/dashboard">
            <Button variant="ghost" className="rounded-xl h-8 px-3 text-muted-foreground hover:text-foreground hover:bg-secondary/40 text-xs font-bold gap-1">
              <LayoutDashboard className="w-3.5 h-3.5" /> Хянах самбар
            </Button>
          </Link>
          <Link href="/problems">
            <Button variant="ghost" className="rounded-xl h-8 px-3 text-muted-foreground hover:text-foreground hover:bg-secondary/40 text-xs font-bold gap-1">
              <Compass className="w-3.5 h-3.5" /> Бодлогууд
            </Button>
          </Link>
          <Link href="/worlds">
            <Button variant="ghost" className="rounded-xl h-8 px-3 text-muted-foreground hover:text-foreground hover:bg-secondary/40 text-xs font-bold gap-1">
              <Compass className="w-3.5 h-3.5" /> Worlds
            </Button>
          </Link>
          <Link href="/leaderboard">
            <Button variant="ghost" className="rounded-xl h-8 px-3 text-muted-foreground hover:text-foreground hover:bg-secondary/40 text-xs font-bold gap-1">
              <RankIcon className="w-3.5 h-3.5" /> Тэргүүлэгчид
            </Button>
          </Link>
          <Link href="/lessons">
            <Button variant="ghost" className="rounded-xl h-8 px-3 text-muted-foreground hover:text-foreground hover:bg-secondary/40 text-xs font-bold gap-1">
              <BookOpen className="w-3.5 h-3.5" /> Хичээлүүд
            </Button>
          </Link>
          <Link href="/classrooms">
            <Button variant="ghost" className="rounded-xl h-8 px-3 text-muted-foreground hover:text-foreground hover:bg-secondary/40 text-xs font-bold gap-1">
              <Users className="w-3.5 h-3.5" /> Ангиуд
            </Button>
          </Link>
        </div>

        {/* Right Section: Theme toggle & User Info */}
        <div className="flex items-center gap-3">
          <ThemeToggle />

          {isLoading ? (
            <div className="w-8 h-8 rounded-full border border-border bg-secondary/30 animate-pulse" />
          ) : user ? (
            // User Avatar Dropdown
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 text-left focus:outline-none hover:opacity-90 group transition-all cursor-pointer bg-transparent border-0 p-0 text-foreground">
                  <div className="hidden md:block">
                    <span className="text-[11px] font-black text-foreground block group-hover:text-purple-500 transition-colors">
                      {user.username}
                    </span>
                    <span className="text-[9px] text-muted-foreground block -mt-0.5 uppercase font-bold">
                      {user.role}
                    </span>
                  </div>
                  <Avatar className="w-8 h-8 rounded-xl border border-border shadow-xs group-hover:border-purple-500/50 transition-colors">
                    {user.avatar_url ? (
                      <AvatarImage src={user.avatar_url} alt={user.username} />
                    ) : (
                      <AvatarFallback className="bg-purple-500/10 text-purple-500 font-bold text-[10px] rounded-xl">
                        {getInitials(user.username)}
                      </AvatarFallback>
                    )}
                  </Avatar>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-56 p-1.5 rounded-2xl glass-strong border border-border/60 shadow-xl mt-1 text-xs">
                <DropdownMenuLabel className="p-2 flex flex-col gap-0.5">
                  <span className="font-black text-foreground text-xs">{user.full_name || user.username}</span>
                  <span className="text-[10px] text-muted-foreground leading-none">{user.email}</span>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Badge className="bg-purple-500/20 text-purple-500 border-none text-[8px] font-extrabold uppercase px-1.5 py-0.2">
                      {user.role}
                    </Badge>
                    {user.school && (
                      <span className="text-[9px] text-muted-foreground font-bold truncate max-w-[120px]">
                        🏫 {user.school}
                      </span>
                    )}
                  </div>
                </DropdownMenuLabel>
                
                <DropdownMenuSeparator className="bg-border/60" />

                {(user.role === "teacher" || user.role === "admin") && (
                  <DropdownMenuItem className="rounded-lg h-8 cursor-pointer focus:bg-purple-500/10 focus:text-purple-500">
                    <Link href="/teacher/ai-curator" className="flex items-center gap-2 w-full font-bold">
                      <ShieldAlert className="w-3.5 h-3.5" /> AI Curator самбар
                    </Link>
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem className="rounded-lg h-8 cursor-pointer focus:bg-secondary/60">
                  <Link href="/dashboard" className="flex items-center gap-2 w-full font-bold">
                    <User className="w-3.5 h-3.5" /> Миний Профайл
                  </Link>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator className="bg-border/60" />

                <DropdownMenuItem
                  onClick={handleLogout}
                  className="rounded-lg h-8 text-rose-500 focus:bg-rose-500/10 focus:text-rose-500 font-bold cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 mr-2" /> Системээс гарах
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            // Login / Register buttons
            <div className="flex items-center gap-2">
              <Link href="/auth/login">
                <Button variant="ghost" className="text-xs font-bold rounded-xl h-8 px-3 cursor-pointer">
                  Нэвтрэх
                </Button>
              </Link>
              <Link href="/auth/register">
                <Button className="gradient-brand text-white border-0 text-xs font-bold rounded-xl h-8 px-3 shadow-md cursor-pointer">
                  Бүртгүүлэх
                </Button>
              </Link>
            </div>
          )}
        </div>

      </div>
    </nav>
  );
}
