"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Trophy, ChevronLeft, Lock, CheckCircle2, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";

interface AchievementItem {
  id: number;
  code: string;
  title: string;
  description: string;
  icon: string;
  xpBonus: number;
  unlocked: boolean;
  unlockedAt?: string;
  category: "progression" | "streak" | "mastery" | "special";
}

const MOCK_ACHIEVEMENTS: AchievementItem[] = [
  { id: 1, code: "FIRST_SOLVE", title: "Анхны Алхам (First Blood)", description: "Анхны бодлогоо амжилттай бодож AC авах", icon: "⚔️", xpBonus: 50, unlocked: true, unlockedAt: "2026-08-01", category: "progression" },
  { id: 2, code: "STREAK_7", title: "7 Өдрийн Гал (Hot Streak)", description: "Дараалан 7 хоног өдөр бүр ядаж 1 бодлого бодох", icon: "🔥", xpBonus: 150, unlocked: true, unlockedAt: "2026-08-07", category: "streak" },
  { id: 3, code: "SPEED_DEMON", title: "Хурдны Чөтгөр (Speed Demon)", description: "Бодлогыг 10 минутын дотор эхний оролдлогоор бодох", icon: "⚡", xpBonus: 100, unlocked: true, unlockedAt: "2026-08-05", category: "special" },
  { id: 4, code: "BRUTE_MASTER", title: "Түүврийн Мастер (Brute Force Pro)", description: "Шууд түүврийн 10 бодлогыг бүрэн бодох", icon: "🎯", xpBonus: 200, unlocked: false, category: "mastery" },
  { id: 5, code: "STREAK_30", title: "Төмөр Сахилга Бат (Iron Will)", description: "Дараалан 30 өдөр идэвхтэй байх", icon: "🛡️", xpBonus: 500, unlocked: false, category: "streak" },
  { id: 6, code: "GRAPH_HERO", title: "Сүлжээний Баатар (Graph Master)", description: "Граф сэдвийн бүх бодлогыг 100% бодох", icon: "🌐", xpBonus: 400, unlocked: false, category: "mastery" },
  { id: 7, code: "BOSS_SLAYER", title: "Босс Унагаагч (Boss Slayer)", description: "1-р Дэлхийн Boss бодлогыг амжилттай шийдэх", icon: "👹", xpBonus: 300, unlocked: false, category: "special" },
  { id: 8, code: "GRANDMASTER_RANK", title: "Домогт Тэмцэгч (Grandmaster)", description: "Платформын хамгийн дээд цолд хүрэх", icon: "👑", xpBonus: 1000, unlocked: false, category: "progression" },
];

export default function AchievementsPage() {
  const unlockedCount = MOCK_ACHIEVEMENTS.filter((a) => a.unlocked).length;

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-40 glass border-b border-white/5 h-16">
        <div className="max-w-6xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" className="rounded-xl">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-base font-bold flex items-center gap-2">
                <Trophy className="w-4 h-4 text-brand-amber" />
                Амжилтууд (Achievements Gallery)
              </h1>
              <p className="text-xs text-muted-foreground">Нээгдсэн амжилтууд: {unlockedCount} / {MOCK_ACHIEVEMENTS.length}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="max-w-5xl mx-auto px-4 pt-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MOCK_ACHIEVEMENTS.map((ach) => (
            <motion.div
              key={ach.code}
              whileHover={{ scale: 1.02 }}
              className={`rounded-2xl p-5 border transition-all relative overflow-hidden ${
                ach.unlocked
                  ? "glass-strong border-brand-amber/30 bg-amber-500/5 shadow-lg shadow-brand-amber/5"
                  : "glass border-white/5 opacity-50 grayscale hover:grayscale-0"
              }`}
            >
              {ach.unlocked && (
                <div className="absolute top-3 right-3">
                  <CheckCircle2 className="w-4 h-4 text-brand-emerald" />
                </div>
              )}

              <div className="text-3xl mb-3">{ach.icon}</div>
              <h3 className="font-bold text-sm mb-1">{ach.title}</h3>
              <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{ach.description}</p>

              <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
                <Badge variant="outline" className="border-brand-amber/40 text-brand-amber bg-brand-amber/10">
                  <Sparkles className="w-3 h-3 mr-1" /> +{ach.xpBonus} XP
                </Badge>
                {ach.unlocked && ach.unlockedAt && (
                  <span className="text-[10px] text-muted-foreground font-mono">{ach.unlockedAt}</span>
                )}
                {!ach.unlocked && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                    <Lock className="w-3 h-3" /> Түгжээтэй
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
