"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { lessonApi } from "@/lib/api/lessons";
import { 
  Plus, Edit2, Trash2, Eye, EyeOff, Search, BookOpen, 
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

export default function TeacherLessonsList() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");

  const { data: lessons = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-lessons-list", category, search],
    queryFn: () => lessonApi.adminList({ 
      search: search || undefined,
      category: category === "all" ? undefined : category
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => lessonApi.delete(slug),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-lessons-list"] });
      toast.success("Хичээл амжилттай устлаа.");
    },
    onError: () => toast.error("Хичээл устгахад алдаа гарлаа.")
  });

  const toggleVisibility = useMutation({
    mutationFn: ({ slug, isPublished }: { slug: string, isPublished: boolean }) => 
      lessonApi.update(slug, { is_published: isPublished }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-lessons-list"] });
      toast.success("Төлөв шинэчлэгдлээ.");
    },
    onError: () => toast.error("Алдаа гарлаа.")
  });

  const handleDelete = (slug: string) => {
    if (window.confirm("Энэ хичээлийг устгахдаа итгэлтэй байна уу?")) {
      deleteMutation.mutate(slug);
    }
  };

  const categoryLabels: Record<string, string> = {
    "Математик (Math for Olympiad)": "Математик",
    "Алгоритм (Algorithms & CP)": "Алгоритм",
    "Өгөгдлийн Бүтэц (Data Structures)": "Өгөгдлийн бүтэц",
    "Хиймэл Оюун ба Логик (AI/ML & Logic)": "Хиймэл оюун",
  };

  return (
    <RoleGate roles={["teacher", "admin"]}>
      <div className="p-6 md:p-8 space-y-8 bg-background/50 min-h-screen">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-brand-emerald" />
              Онолын хичээлүүд
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Олимпиадын онол, сэдэвчилсэн хичээлүүд болон квиз асуултууд бэлтгэх
            </p>
          </div>
          <Link href="/teacher/lessons/new" className={buttonVariants({ className: "rounded-2xl bg-gradient-brand text-white font-bold shadow-md cursor-pointer" })}>
            <Plus className="w-4 h-4 mr-2" /> Шинэ хичээл нэмэх
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 items-center bg-card/40 p-4 border border-border/50 rounded-3xl">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Гарчиг эсвэл сэдэв хайх..."
              className="pl-10 h-10 rounded-2xl bg-surface-1/50 border-border/60 focus-visible:ring-1"
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-card border border-border text-foreground px-4 py-2 rounded-2xl text-sm font-semibold shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-emerald w-full sm:w-52"
            >
              <option value="all">Бүх ангилал</option>
              <option value="MATH">Математик (Math for Olympiad)</option>
              <option value="ALGORITHMS">Алгоритм (Algorithms & CP)</option>
              <option value="DATA_STRUCTURES">Өгөгдлийн Бүтэц (Data Structures)</option>
              <option value="AI_ML">Хиймэл Оюун ба Логик (AI/ML & Logic)</option>
            </select>
            <Button variant="outline" size="icon" onClick={() => refetch()} className="rounded-2xl shrink-0">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* List of Lessons */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 w-full bg-white/5 border border-white/5 rounded-3xl animate-pulse" />
            ))}
          </div>
        ) : lessons.length > 0 ? (
          <div className="grid gap-4">
            {lessons.map((lesson) => {
              const isOwner = user?.role === "admin" || lesson.created_by_username === user?.username;

              return (
                <div 
                  key={lesson.id}
                  className="glass-strong border-white/5 hover:border-white/10 hover:bg-white/5 transition-all p-5 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="bg-brand-emerald/10 text-brand-emerald px-3 py-1.5 rounded-2xl font-mono text-xs font-black">
                      #{lesson.order}
                    </div>
                    <div>
                      <h3 className="text-base font-black text-foreground flex items-center gap-2">
                        {lesson.title}
                        {!lesson.is_published && (
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                            Ноорог (Draft)
                          </Badge>
                        )}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-1.5 text-xs text-muted-foreground">
                        <Badge className="text-[10px] px-2 py-0 bg-brand-emerald/10 text-brand-emerald border-none">
                          {categoryLabels[lesson.category] || lesson.category}
                        </Badge>
                        <span>Сэдэв: <b className="text-foreground">{lesson.topic}</b></span>
                        <span>Урамшуулал: <b className="text-foreground">+{lesson.xp_reward} XP</b></span>
                        <span>Бодлогууд: <b className="text-foreground">{lesson.practice_problems_count} холбоотой</b></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-white/5 justify-end">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => toggleVisibility.mutate({ slug: lesson.slug, isPublished: !lesson.is_published })}
                      className="rounded-xl h-9 w-9 text-muted-foreground hover:text-foreground"
                      title={lesson.is_published ? "Ноорог болгох" : "Нийтлэх"}
                    >
                      {lesson.is_published ? <Eye className="w-4 h-4 text-brand-emerald" /> : <EyeOff className="w-4 h-4 text-yellow-500" />}
                    </Button>

                    <Link href={`/teacher/lessons/${lesson.slug}`} className={buttonVariants({ variant: "ghost", size: "icon", className: "rounded-xl h-9 w-9 text-brand-cyan hover:text-brand-cyan/85" })}>
                      <Edit2 className="w-4 h-4" />
                    </Link>

                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDelete(lesson.slug)}
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
            <BookOpen className="w-12 h-12 text-brand-emerald" />
            <div>
              <h3 className="text-lg font-bold text-foreground">Хичээл одоогоор байхгүй байна</h3>
              <p className="text-muted-foreground text-sm mt-1">Онолын хичээлийн жагсаалт одоогоор хоосон байна.</p>
            </div>
          </Card>
        )}
      </div>
    </RoleGate>
  );
}
