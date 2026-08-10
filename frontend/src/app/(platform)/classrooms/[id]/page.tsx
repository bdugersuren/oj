"use client";

import React, { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, BookOpen, Clock, Zap, CheckCircle2, ArrowRight, Star, AlertCircle, HelpCircle } from "lucide-react";
import { classroomApi } from "@/lib/api/classrooms";
import { lessonApi } from "@/lib/api/lessons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ThemeToggle } from "@/components/theme-toggle";

const DIFFICULTY_COLORS: Record<string, string> = {
  Bronze: "text-amber-600 border-amber-600/30 bg-amber-600/10",
  Silver: "text-slate-500 border-slate-500/30 bg-slate-500/10",
  Gold: "text-amber-500 border-amber-500/30 bg-amber-500/10",
  Platinum: "text-sky-500 border-sky-500/30 bg-sky-500/10",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function StudentClassroomDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const classId = Number(id);

  // Fetch classroom details
  const { data: classroom, isLoading: classLoading, isError: classError } = useQuery({
    queryKey: ["classroom-detail", classId],
    queryFn: () => classroomApi.get(classId),
    enabled: !isNaN(classId),
  });

  // Fetch classroom lessons
  const { data: lessons = [], isLoading: lessonsLoading, isError: lessonsError } = useQuery({
    queryKey: ["classroom-lessons", classId],
    queryFn: () => classroomApi.listLessons(classId),
    enabled: !isNaN(classId),
  });

  const isLoading = classLoading || lessonsLoading;
  const isError = classError || lessonsError;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground pb-20">
        <main className="max-w-4xl mx-auto px-4 pt-10 space-y-6 animate-pulse">
          <div className="h-40 bg-secondary/50 rounded-3xl" />
          <div className="h-64 bg-secondary/30 rounded-3xl" />
        </main>
      </div>
    );
  }

  if (isError || !classroom) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-4" />
        <h2 className="text-lg font-black">Ангийг ачаалахад алдаа гарлаа</h2>
        <p className="text-xs text-muted-foreground mt-1 mb-6">Энэ ангид хандах эрхгүй эсвэл анги устгагдсан байж болзошгүй.</p>
        <Link href="/classrooms">
          <Button className="gradient-brand text-white rounded-xl">Ангиуд руу буцах</Button>
        </Link>
      </div>
    );
  }

  // Calculate student progress in this classroom
  const completedLessonsCount = lessons.filter(l => l.is_completed).length;
  const progressPercent = lessons.length > 0 ? Math.round((completedLessonsCount / lessons.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <header className="h-16 glass border-b border-border px-4 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto h-full flex justify-between items-center">
          <div className="flex gap-3 items-center">
            <Link href="/classrooms">
              <Button variant="ghost" size="icon" className="rounded-xl">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="font-black text-sm flex gap-2 items-center">
                <BookOpen className="w-4 h-4 text-brand-cyan" />
                {classroom.name}
              </h1>
              <p className="text-[10px] text-muted-foreground">Ангийн сургалтын агуулга ба ахиц</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-8 space-y-8">
        
        {/* Classroom Overview */}
        <section className="glass-md rounded-3xl border border-border/60 p-6 md:p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-brand-cyan/10 to-brand-violet/10 rounded-full blur-3xl pointer-events-none" />
          <h2 className="text-2xl font-black">{classroom.name}</h2>
          <p className="text-xs text-muted-foreground mt-2 max-w-2xl">
            {classroom.description || "Энэ ангид тайлбар оруулаагүй байна."}
          </p>
          
          <div className="mt-6 pt-4 border-t border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
            <div className="space-y-1 text-muted-foreground">
              <div>Багш: <b className="text-foreground">{classroom.teacher_name}</b></div>
              <div>Нийт суралцагч: <b className="text-foreground">{classroom.students_count}</b></div>
            </div>
            
            {lessons.length > 0 && (
              <div className="w-full sm:w-64 space-y-1.5">
                <div className="flex justify-between font-bold text-[10px] text-muted-foreground uppercase">
                  <span>Таны суралцсан явц</span>
                  <span className="text-brand-cyan">{progressPercent}%</span>
                </div>
                <Progress value={progressPercent} className="h-2 bg-secondary" />
                <p className="text-[10px] text-muted-foreground text-right">
                  {completedLessonsCount} / {lessons.length} хичээл дуусгасан
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Lessons List */}
        <section className="space-y-4">
          <h3 className="text-sm font-black text-muted-foreground uppercase tracking-wider">
            Ангийн хичээлүүд ({lessons.length})
          </h3>

          {lessons.length === 0 ? (
            <div className="glass-strong rounded-3xl border border-border/60 p-12 text-center text-muted-foreground">
              <HelpCircle className="w-10 h-10 mx-auto text-muted-foreground/60 mb-3" />
              <p className="text-xs">Энэ ангид одоогоор хичээл ороогүй байна.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {lessons.map((lesson) => {
                const diffClass = DIFFICULTY_COLORS[lesson.difficulty] || DIFFICULTY_COLORS["Bronze"];
                return (
                  <div
                    key={lesson.slug}
                    className="glass-strong rounded-3xl p-6 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-brand-cyan/40 transition-all duration-300 relative overflow-hidden"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`font-bold text-[9px] uppercase px-2 py-0.5 rounded-md ${diffClass}`}>
                          {lesson.difficulty}
                        </Badge>
                        <Badge className="bg-secondary text-muted-foreground border-none font-bold text-[9px]">
                          {lesson.category}
                        </Badge>
                      </div>
                      
                      <h4 className="text-base font-black text-foreground group-hover:text-brand-cyan transition-colors line-clamp-1">
                        {lesson.title}
                      </h4>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {lesson.summary}
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-6 pt-3 sm:pt-0 border-t sm:border-0 border-border/40">
                      <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-semibold">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-brand-cyan" />
                          {lesson.estimated_minutes} мин
                        </span>
                        <span className="flex items-center gap-1">
                          <Zap className="w-3.5 h-3.5 text-brand-amber" />
                          +{lesson.xp_reward} XP
                        </span>
                        {lesson.is_completed && (
                          <span className="flex items-center gap-1 text-emerald-500 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Дууссан
                          </span>
                        )}
                      </div>

                      <Link href={`/lessons/${lesson.slug}`}>
                        <Button size="sm" className="h-9 px-4 rounded-xl gradient-brand text-white text-xs font-bold shadow-sm cursor-pointer">
                          Үзэх <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
