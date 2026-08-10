"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { problemApi, ProblemDifficulty } from "@/lib/api/problems";
import { 
  Plus, Edit2, Trash2, Eye, EyeOff, Search, Compass, 
  ChevronRight, RefreshCw, AlertCircle 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import toast from "react-hot-toast";
import { RoleGate } from "@/components/role-gate";
import { useAuthStore } from "@/store/auth";

export default function TeacherProblemsList() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<string>("all");

  const { data: problems = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-problems-list", difficulty, search],
    queryFn: () => problemApi.list({ 
      visible_only: false,
      search: search || undefined,
      difficulty: difficulty === "all" ? undefined : difficulty
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (code: string) => problemApi.delete(code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-problems-list"] });
      toast.success("Бодлого амжилттай устлаа.");
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Бодлого устгахад алдаа гарлаа.";
      toast.error(msg);
    }
  });

  const toggleVisibility = useMutation({
    mutationFn: ({ code, isVisible }: { code: string, isVisible: boolean }) => 
      problemApi.update(code, { is_visible: isVisible }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-problems-list"] });
      toast.success("Төлөв шинэчлэгдлээ.");
    },
    onError: () => toast.error("Алдаа гарлаа.")
  });

  const handleDelete = (code: string) => {
    if (window.confirm(`Та '${code}' бодлогыг устгахдаа итгэлтэй байна уу?`)) {
      deleteMutation.mutate(code);
    }
  };

  const difficultyColors: Record<string, string> = {
    Bronze: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    Silver: "bg-slate-400/10 text-slate-300 border-slate-400/20",
    Gold: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    Platinum: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    Diamond: "bg-blue-600/10 text-blue-400 border-blue-600/20",
  };

  return (
    <RoleGate roles={["teacher", "admin"]}>
      <div className="p-6 md:p-8 space-y-8 bg-background/50 min-h-screen">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <Compass className="w-8 h-8 text-brand-cyan" />
              Бодлогын сан удирдах
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Бодлого нэмэх, засах, устгах болон тест кейсийг ZIP-ээр оруулах
            </p>
          </div>
          <Link href="/teacher/problems/new" className={buttonVariants({ className: "rounded-2xl bg-gradient-brand text-white font-bold shadow-md cursor-pointer" })}>
            <Plus className="w-4 h-4 mr-2" /> Шинэ бодлого үүсгэх
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 items-center bg-card/40 p-4 border border-border/50 rounded-3xl">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Код эсвэл нэрээр хайх..."
              className="pl-10 h-10 rounded-2xl bg-surface-1/50 border-border/60 focus-visible:ring-1"
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="bg-card border border-border text-foreground px-4 py-2 rounded-2xl text-sm font-semibold shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-cyan w-full sm:w-40"
            >
              <option value="all">Бүх хүндрэл</option>
              <option value="Bronze">Bronze</option>
              <option value="Silver">Silver</option>
              <option value="Gold">Gold</option>
              <option value="Platinum">Platinum</option>
              <option value="Diamond">Diamond</option>
            </select>
            <Button variant="outline" size="icon" onClick={() => refetch()} className="rounded-2xl shrink-0">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* List of Problems */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 w-full bg-white/5 border border-white/5 rounded-3xl animate-pulse" />
            ))}
          </div>
        ) : problems.length > 0 ? (
          <div className="grid gap-4">
            {problems.map((problem) => {
              const isOwner = user?.role === "admin" || problem.created_by_id === user?.id;

              return (
                <div 
                  key={problem.id}
                  className="glass-strong border-white/5 hover:border-white/10 hover:bg-white/5 transition-all p-5 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="bg-brand-cyan/10 text-brand-cyan px-3 py-1.5 rounded-2xl font-mono text-xs font-black">
                      {problem.code}
                    </div>
                    <div>
                      <h3 className="text-base font-black text-foreground flex items-center gap-2">
                        {problem.title}
                        {!problem.is_visible && (
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                            Нууцлагдсан
                          </Badge>
                        )}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-1.5 text-xs text-muted-foreground">
                        <Badge className={`text-[10px] px-2 py-0 border ${difficultyColors[problem.difficulty] || ""}`} variant="outline">
                          {problem.difficulty}
                        </Badge>
                        <span>Сэдэв: <b className="text-foreground">{problem.topic}</b></span>
                        <span>Тест кейс: <b className="text-foreground">{problem.testcase_count}</b></span>
                        <span>Оноо: <b className="text-foreground">{problem.points}</b></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-white/5 justify-end">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => toggleVisibility.mutate({ code: problem.code, isVisible: !problem.is_visible })}
                      className="rounded-xl h-9 w-9 text-muted-foreground hover:text-foreground"
                      title={problem.is_visible ? "Нуух" : "Харуулах"}
                    >
                      {problem.is_visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-yellow-500" />}
                    </Button>

                    <Link href={`/teacher/problems/${problem.code}`} className={buttonVariants({ variant: "ghost", size: "icon", className: "rounded-xl h-9 w-9 text-brand-cyan hover:text-brand-cyan/85" })}>
                      <Edit2 className="w-4 h-4" />
                    </Link>

                    <Link href={`/teacher/problems/${problem.code}/testcases`} className={buttonVariants({ variant: "ghost", size: "icon", className: "rounded-xl h-9 w-9 text-brand-violet hover:text-brand-violet/85" })} title="Тест кэйс удирдах">
                      <ChevronRight className="w-5 h-5" />
                    </Link>

                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDelete(problem.code)}
                      disabled={!isOwner}
                      className={`rounded-xl h-9 w-9 ${isOwner ? "text-rose-500 hover:text-rose-400" : "text-muted-foreground/30 cursor-not-allowed"}`}
                      title={isOwner ? "Устгах" : "Устгах эрхгүй (зөвхөн өөрийнхийг)"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Card className="glass-strong border-white/5 rounded-3xl p-12 text-center flex flex-col items-center justify-center gap-4">
            <Compass className="w-12 h-12 text-brand-cyan" />
            <div>
              <h3 className="text-lg font-bold text-foreground">Бодлого одоогоор байхгүй байна</h3>
              <p className="text-muted-foreground text-sm mt-1">Хайлтад тохирох бодлого олдсонгүй эсвэл бодлогын сан хоосон байна.</p>
            </div>
          </Card>
        )}
      </div>
    </RoleGate>
  );
}
