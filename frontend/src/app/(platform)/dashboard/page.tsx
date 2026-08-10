"use client";

import React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Flame, Star, Zap, Trophy, BookOpen, Target, TrendingUp,
  ChevronRight, Code2, Clock, CheckCircle2, XCircle, Timer, Award
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { progressApi } from "@/lib/api/progress";
import { problemApi } from "@/lib/api/problems";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  AC:  { label: "Зөв хариулт (AC)", color: "text-emerald-500", icon: CheckCircle2 },
  WA:  { label: "Буруу хариулт (WA)", color: "text-rose-500", icon: XCircle },
  TLE: { label: "Хугацаа хэтэрсэн (TLE)", color: "text-amber-500", icon: Timer },
  MLE: { label: "Санах ой хэтэрсэн (MLE)", color: "text-amber-500", icon: Timer },
  RE:  { label: "Ажиллах үеийн алдаа (RE)", color: "text-rose-500", icon: XCircle },
  CE:  { label: "Хөрвүүлэлтийн алдаа (CE)", color: "text-slate-400", icon: XCircle },
  PENDING: { label: "Хүлээгдэж буй...", color: "text-muted-foreground animate-pulse", icon: Timer },
  RUNNING: { label: "Шалгаж байна...", color: "text-brand-cyan animate-pulse", icon: Timer },
};

const getNextLevelXp = (xp: number) => {
  if (xp < 1000) return 1000;
  if (xp < 3000) return 3000;
  if (xp < 7000) return 7000;
  if (xp < 15000) return 15000;
  return xp + 5000;
};

const fadeUp = (i: number) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: i * 0.08, duration: 0.4 },
});

export default function DashboardPage() {
  const { data: progress, isLoading: progressLoading } = useQuery({
    queryKey: ["progress-me"],
    queryFn: progressApi.me,
  });

  const { data: submissions = [], isLoading: submissionsLoading } = useQuery({
    queryKey: ["my-submissions"],
    queryFn: () => problemApi.mySubmissions(),
  });

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase();
  };

  const formatTimeAgo = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
      if (seconds < 60) return "саяхан";
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes} минутын өмнө`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours} цагийн өмнө`;
      const days = Math.floor(hours / 24);
      if (days === 1) return "өчигдөр";
      return `${days} өдрийн өмнө`;
    } catch {
      return dateStr;
    }
  };

  if (progressLoading || submissionsLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <main className="max-w-7xl mx-auto px-4 pt-8 space-y-6">
          <Skeleton className="h-44 w-full rounded-3xl bg-secondary/40" />
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-28 w-full rounded-2xl bg-secondary/30" />
              <Skeleton className="h-64 w-full rounded-2xl bg-secondary/30" />
            </div>
            <div className="space-y-6">
              <Skeleton className="h-72 w-full rounded-2xl bg-secondary/30" />
              <Skeleton className="h-48 w-full rounded-2xl bg-secondary/30" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!progress) {
    return (
      <main className="max-w-7xl mx-auto px-4 pt-12 text-center text-rose-500 font-bold">
        Профайлын ахиц өгөгдлийг ачаалж чадсангүй. Нэвтрэх хэсгийг шалгана уу.
      </main>
    );
  }

  const xpNext = getNextLevelXp(progress.total_xp);
  const xpPct = Math.min(100, Math.round((progress.total_xp / xpNext) * 100));
  const recentSubmissions = submissions.slice(0, 4);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 pt-8 pb-12">
        
        {/* ── Welcome & XP Bar ── */}
        <motion.div {...fadeUp(0)} className="glass-md rounded-3xl p-6 mb-6 border border-border/40 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-brand-cyan/10 to-brand-violet/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1">
              <Avatar className="w-14 h-14 rounded-2xl border border-border">
                <AvatarFallback className="gradient-brand text-white text-lg font-black rounded-2xl">
                  {getInitials(progress.username)}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="text-xs text-muted-foreground">Сайн байна уу,</div>
                <div className="text-xl font-black text-foreground leading-tight">{progress.username}</div>
                <Badge
                  className="mt-1 text-[10px] font-bold border-none"
                  style={{
                    color: progress.level_color,
                    background: `${progress.level_color}15`,
                  }}
                >
                  <Star className="w-3 h-3 mr-1 fill-current" />
                  {progress.level_name} Түвшин
                </Badge>
              </div>
            </div>

            {/* Quick stats */}
            <div className="flex items-center gap-6 sm:gap-8 bg-card/20 px-6 py-3 rounded-2xl border border-border/30">
              <div className="text-center">
                <div className="text-2xl font-black text-amber-500 flex items-center justify-center gap-1">
                  <Flame className="w-5 h-5 fill-current" />
                  {progress.current_streak}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase font-black tracking-wider mt-0.5">Streak</div>
              </div>
              <Separator orientation="vertical" className="h-8 bg-border/40" />
              <div className="text-center">
                <div className="text-2xl font-black text-emerald-500">
                  {progress.solved_count}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase font-black tracking-wider mt-0.5">Бодсон</div>
              </div>
              <Separator orientation="vertical" className="h-8 bg-border/40" />
              <div className="text-center">
                <div className="text-2xl font-black text-brand-cyan flex items-center justify-center gap-0.5">
                  <TrendingUp className="w-4 h-4" />
                  {progress.elo_rating}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase font-black tracking-wider mt-0.5">ELO Ранк</div>
              </div>
            </div>
          </div>

          {/* XP Bar */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span className="flex items-center gap-1 font-bold text-foreground">
                <Zap className="w-3.5 h-3.5 text-brand-cyan fill-current animate-pulse" /> 
                {progress.total_xp.toLocaleString()} XP цуглуулсан
              </span>
              <span>Дараагийн түвшин: {xpNext.toLocaleString()} XP</span>
            </div>
            <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full gradient-brand"
                initial={{ width: 0 }}
                animate={{ width: `${xpPct}%` }}
                transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
              />
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 text-right font-bold">{xpPct}%</div>
          </div>
        </motion.div>

        {/* ── Main Grid ── */}
        <div className="grid lg:grid-cols-3 gap-6">

          {/* Left: Recent Submissions + Quick Actions */}
          <div className="lg:col-span-2 space-y-6">

            {/* Quick Actions */}
            <motion.div {...fadeUp(1)}>
              <h2 className="text-xs font-black text-muted-foreground uppercase tracking-wider mb-3 pl-1">
                Шуурхай навигаци
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Бодлого бодох", icon: Code2, href: "/problems", color: "text-brand-cyan", bg: "bg-brand-cyan/10" },
                  { label: "Олимпиад аялал", icon: Target, href: "/worlds", color: "text-brand-violet", bg: "bg-brand-violet/10" },
                  { label: "Рейтинг самбар", icon: TrendingUp, href: "/leaderboard", color: "text-amber-500", bg: "bg-amber-500/10" },
                  { label: "Миний амжилтууд", icon: Trophy, href: "/achievements", color: "text-emerald-500", bg: "bg-emerald-500/10" },
                ].map((a) => (
                  <Link key={a.label} href={a.href}>
                    <div className="glass rounded-2xl p-4 border border-border/40 hover:border-brand-cyan/30 transition-all hover:scale-[1.02] cursor-pointer group">
                      <div className={`w-9 h-9 rounded-xl ${a.bg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                        <a.icon className={`w-4.5 h-4.5 ${a.color}`} />
                      </div>
                      <div className="text-xs font-black text-foreground">{a.label}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </motion.div>

            {/* Recent Submissions */}
            <motion.div {...fadeUp(2)}>
              <div className="flex items-center justify-between mb-3 pl-1">
                <h2 className="text-xs font-black text-muted-foreground uppercase tracking-wider">
                  Сүүлийн бодолтууд
                </h2>
                <Link href="/submissions/my" className="text-xs text-brand-cyan hover:underline flex items-center gap-0.5 font-bold">
                  Бүгдийг харах <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              
              <div className="glass rounded-2xl overflow-hidden border border-border/40 divide-y divide-border/30">
                {recentSubmissions.map((sub, i) => {
                  const s = STATUS_CONFIG[sub.status] || { label: sub.status, color: "text-muted-foreground", icon: Timer };
                  return (
                    <div
                      key={sub.id}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-secondary/20 transition-colors"
                    >
                      <s.icon className={`w-5 h-5 ${s.color} shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-black truncate text-foreground">{sub.problem_code} бодлого</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{s.label}</div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                        <span className="hidden sm:block font-mono bg-secondary/60 px-2 py-0.5 rounded-md font-bold uppercase">{sub.language}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {sub.time_ms}ms
                        </span>
                        <span className="font-bold text-foreground">{formatTimeAgo(sub.submitted_at)}</span>
                      </div>
                    </div>
                  );
                })}
                {recentSubmissions.length === 0 && (
                  <p className="text-xs text-muted-foreground py-10 text-center">
                    Одоогоор илгээсэн бодлого байхгүй байна.
                  </p>
                )}
              </div>
            </motion.div>
          </div>

          {/* Right: Topic Mastery + Achievements */}
          <div className="space-y-6">
            
            {/* Topic Mastery */}
            <motion.div {...fadeUp(3)}>
              <div className="flex items-center justify-between mb-3 pl-1">
                <h2 className="text-xs font-black text-muted-foreground uppercase tracking-wider">
                  Сэдвийн эзэмшилт (Mastery)
                </h2>
                <BookOpen className="w-4 h-4 text-muted-foreground" />
              </div>
              
              <div className="glass rounded-2xl p-4 border border-border/40 space-y-4">
                {progress.topic_masteries.slice(0, 5).map((t) => (
                  <div key={t.topic_slug} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-foreground capitalize">
                        {t.topic_slug.replace("-", " ")}
                      </span>
                      <span className="text-muted-foreground text-[10px] font-bold">
                        {t.solved_count} бодсон / {t.mastery_percentage}%
                      </span>
                    </div>
                    <Progress value={t.mastery_percentage} className="h-1.5 bg-secondary" />
                  </div>
                ))}
                
                {progress.topic_masteries.length === 0 && (
                  <p className="text-xs text-muted-foreground py-6 text-center">
                    Сэдвийн ахиц хараахан бүртгэгдээгүй байна.
                  </p>
                )}
              </div>
            </motion.div>

            {/* Next Journey Stage CTA */}
            <motion.div {...fadeUp(4)}>
              <Link href="/worlds">
                <div className="glass-md rounded-2xl p-5 border border-brand-cyan/20 hover:border-brand-cyan/40 transition-all cursor-pointer group">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-[10px] text-brand-cyan font-black uppercase tracking-wider mb-1 flex items-center gap-1 animate-pulse">
                        <Award className="w-3.5 h-3.5 fill-current" /> Дараагийн шат
                      </div>
                      <div className="font-black text-sm text-foreground">Шаталсан Сургалтын Замнал</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Олимпиадын бэлтгэлд зориулсан ертөнцүүд</div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-brand-cyan mt-0.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                  <Progress value={20} className="h-1 bg-secondary" />
                  <div className="text-[10px] text-muted-foreground mt-2 font-bold">Шинэ бодлогууд нээгдсэн</div>
                </div>
              </Link>
            </motion.div>
          </div>
        </div>

      </main>
    </div>
  );
}
