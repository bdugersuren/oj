"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Layers, Trophy, Star, Sparkles, FolderTree,
  Eye, CheckCircle2, ChevronLeft, Bot, HelpCircle,
  Award, Play
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { AlgorithmHierarchyExplorer } from "@/components/algorithm-tree";
import { LevelUpModal, JudgeVerdictModal } from "@/components/ui-modals";

export default function AlgorithmsHubPage() {
  const [showLevelUp, setShowLevelUp] = useState<boolean>(false);
  const [showJudgeModal, setShowJudgeModal] = useState<boolean>(false);

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-40 glass border-b border-border h-16 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" className="rounded-xl">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Badge className="bg-primary/15 text-primary border-none text-[10px] font-bold">
                  Knowledge Tree
                </Badge>
                <h1 className="text-sm font-black">Олимпиадын Алгоритмын Шаталсан Бүтэц</h1>
              </div>
              <p className="text-xs text-muted-foreground">Windows Explorer маягийн задардаг шаталсан ангилал</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/teacher/editor">
              <Button variant="outline" size="sm" className="h-8 text-xs border-border glass gap-1.5 font-semibold">
                TipTap Studio ✍️
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="max-w-7xl mx-auto px-4 pt-8 space-y-12">
        {/* Interactive Modal Triggers Banner */}
        <div className="glass-strong rounded-3xl p-6 border border-border flex flex-col md:flex-row items-center justify-between gap-4 bg-card/60">
          <div>
            <h2 className="text-lg font-black flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-amber" />
              Модал Цонхнуудын Интерактив Туршилт
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Платформд ашиглагдах Level-up, Шалгалтын дүн (Judge Verdict) зэрэг модалуудыг турших
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => setShowLevelUp(true)}
              className="gradient-brand text-white border-0 text-xs font-bold gap-1.5 rounded-xl shadow-md shadow-brand-cyan/20 cursor-pointer"
            >
              <Trophy className="w-4 h-4" /> Level-Up Модал Үзэх
            </Button>
            <Button
              onClick={() => setShowJudgeModal(true)}
              variant="outline"
              className="glass border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 text-xs font-bold gap-1.5 rounded-xl cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" /> Judge Verdict Модал
            </Button>
          </div>
        </div>

        {/* ── Hierarchical Algorithm Explorer (Windows Explorer Style) ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black flex items-center gap-3">
                <FolderTree className="w-7 h-7 text-brand-cyan" />
                Алгоритм & Математикийн Шаталсан Мод (Taxonomy Tree)
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Фолдер бүрийг нээж сэдвүүд, бодлогын тоо болон өөрийн эзэмшилтийн хувийг харна уу
              </p>
            </div>
          </div>

          <AlgorithmHierarchyExplorer />
        </section>
      </main>

      {/* ── Modals ── */}
      <LevelUpModal
        isOpen={showLevelUp}
        onClose={() => setShowLevelUp(false)}
        newLevelName="Platinum"
        newLevelColor="#0284c7"
        totalXp={3540}
      />

      <JudgeVerdictModal
        isOpen={showJudgeModal}
        onClose={() => setShowJudgeModal(false)}
        verdict="AC"
        score={100}
        time="36ms"
        memory="4.8MB"
      />
    </div>
  );
}
