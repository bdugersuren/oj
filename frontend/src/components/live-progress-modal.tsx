"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy, Flame, Star, Award, TrendingUp,
  CheckCircle2, Lock, Sparkles, X, ChevronRight, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function LiveProgressWidget() {
  const [isOpen, setIsOpen] = useState(false);

  // Mock student stats (can be connected to React Query / Zustand)
  const stats = {
    username: "bold_coder",
    level: "Gold",
    levelColor: "#d97706",
    currentXp: 2340,
    nextLevelXp: 3500,
    nextLevelName: "Platinum",
    solvedCount: 48,
    streak: 7,
    rankInTier: "12 / 180 (Топ 6.7%)",
    topicMasteries: [
      { topic: "Brute Force", pct: 85, color: "bg-emerald-500" },
      { topic: "Тооны Онол", pct: 72, color: "bg-amber-500" },
      { topic: "Binary Search", pct: 60, color: "bg-sky-500" },
      { topic: "Граф", pct: 40, color: "bg-purple-500" },
      { topic: "Dynamic Prog.", pct: 25, color: "bg-rose-500" },
    ],
    recentAchievements: [
      { title: "Анхны Алхам", icon: "⚔️", unlocked: true },
      { title: "7 Өдрийн Гал", icon: "🔥", unlocked: true },
      { title: "Хурдны Чөтгөр", icon: "⚡", unlocked: true },
      { title: "Түүврийн Мастер", icon: "🎯", unlocked: false },
    ],
  };

  const progressPct = Math.round((stats.currentXp / stats.nextLevelXp) * 100);

  return (
    <>
      {/* ── Persistent Floating Trigger Button (Bottom Right) ── */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(true)}
          className="glass-strong border border-border rounded-full p-2.5 pl-4 flex items-center gap-3 shadow-2xl hover:border-primary/50 transition-all group bg-card/90 backdrop-blur-md"
        >
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-500">
            <Flame className="w-4 h-4 fill-amber-500 animate-pulse" />
            <span>{stats.streak} өдөр</span>
          </div>

          <div className="h-4 w-px bg-border" />

          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white"
              style={{ backgroundColor: stats.levelColor }}
            >
              <Star className="w-3.5 h-3.5 fill-white" />
            </div>
            <span className="text-xs font-black text-foreground">{stats.currentXp.toLocaleString()} XP</span>
          </div>
        </motion.button>
      </div>

      {/* ── Live Progress & Achievements Modal ── */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-xl glass-strong border-border text-foreground rounded-3xl p-6 space-y-6 overflow-hidden">
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-border">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md"
                style={{ backgroundColor: stats.levelColor }}
              >
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-black">
                  Миний Ахиц Дэвшил & Амжилт
                </DialogTitle>
                <p className="text-xs text-muted-foreground font-medium">
                  @{stats.username} · {stats.level} Цолтон
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* Level Progress Bar Card */}
          <div className="glass rounded-2xl p-5 border border-border space-y-3 bg-secondary/30">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-1.5" style={{ color: stats.levelColor }}>
                <Star className="w-4 h-4 fill-current" /> Одоогийн: {stats.level}
              </span>
              <span className="text-muted-foreground font-mono">
                {stats.currentXp.toLocaleString()} / {stats.nextLevelXp.toLocaleString()} XP ({progressPct}%)
              </span>
            </div>

            <Progress value={progressPct} className="h-2.5 bg-secondary" />

            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
              <span>Дараагийн цол: <strong>{stats.nextLevelName}</strong></span>
              <span>Түвшин доторх эрэмбэ: <strong className="text-primary">{stats.rankInTier}</strong></span>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="glass rounded-2xl p-3.5 border border-border">
              <Flame className="w-5 h-5 text-amber-500 mx-auto mb-1" />
              <div className="text-lg font-black text-amber-500">{stats.streak} өдөр</div>
              <div className="text-[10px] text-muted-foreground font-medium">Active Streak</div>
            </div>
            <div className="glass rounded-2xl p-3.5 border border-border">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
              <div className="text-lg font-black text-emerald-500">{stats.solvedCount}</div>
              <div className="text-[10px] text-muted-foreground font-medium">Бодсон Бодлого</div>
            </div>
            <div className="glass rounded-2xl p-3.5 border border-border">
              <Sparkles className="w-5 h-5 text-primary mx-auto mb-1" />
              <div className="text-lg font-black text-primary">3 онол</div>
              <div className="text-[10px] text-muted-foreground font-medium">Үзсэн Хичээл</div>
            </div>
          </div>

          {/* Topic Mastery Breakdown */}
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Сэдвүүдийн Эзэмшилт (Topic Mastery)</span>
            </div>
            <div className="space-y-2">
              {stats.topicMasteries.map((tm) => (
                <div key={tm.topic} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span>{tm.topic}</span>
                    <span className="font-mono text-[11px] font-bold text-muted-foreground">{tm.pct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full ${tm.color} rounded-full`} style={{ width: `${tm.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Achievements */}
          <div className="space-y-3 pt-1">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Сүүлийн Амжилтууд</span>
              <a href="/achievements" className="text-primary text-[11px] hover:underline font-semibold">Бүгдийг харах →</a>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {stats.recentAchievements.map((ach) => (
                <div
                  key={ach.title}
                  className={`p-2.5 rounded-2xl border text-center transition-all ${
                    ach.unlocked
                      ? "glass border-amber-500/30 bg-amber-500/10 text-foreground"
                      : "bg-secondary/40 border-border opacity-40 grayscale"
                  }`}
                >
                  <div className="text-xl mb-1">{ach.icon}</div>
                  <div className="text-[10px] font-bold truncate">{ach.title}</div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
