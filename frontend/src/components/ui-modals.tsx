"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy, Star, Sparkles, CheckCircle2, XCircle,
  AlertTriangle, Clock, Database, ArrowRight, X,
  Flame, Award, BookOpen, Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/* ── 1. Level-Up Celebration Modal ── */
interface LevelUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  newLevelName?: string;
  newLevelColor?: string;
  totalXp?: number;
}

export function LevelUpModal({
  isOpen,
  onClose,
  newLevelName = "Platinum",
  newLevelColor = "#0284c7",
  totalXp = 3540,
}: LevelUpModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md glass-strong border-border text-foreground rounded-3xl p-8 text-center space-y-6 overflow-hidden">
        {/* Animated Fireworks Badge */}
        <motion.div
          initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="relative mx-auto w-24 h-24 rounded-3xl flex items-center justify-center text-white shadow-2xl"
          style={{ backgroundColor: newLevelColor }}
        >
          <Trophy className="w-12 h-12" />
          <motion.div
            animate={{ scale: [1, 1.4, 1], opacity: [0.7, 0, 0.7] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="absolute inset-0 rounded-3xl border-4 border-white/60"
          />
        </motion.div>

        <div className="space-y-2">
          <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/40 text-xs px-3 py-1 font-bold">
            🎉 LEVEL UP! ТҮВШИН АХИЛАА
          </Badge>
          <h3 className="text-2xl font-black">Баяр хүргэе! Та <span style={{ color: newLevelColor }}>{newLevelName}</span> цолонд хүрлээ</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Олимпиадын 50 гаруй бодлого, онолын хичээлийг амжилттай давж шинэ давуу эрхүүд нээгдлээ.
          </p>
        </div>

        <div className="glass rounded-2xl p-4 border border-border flex items-center justify-around text-xs font-bold">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">Нийт XP</div>
            <div className="text-base font-black text-amber-500">{totalXp.toLocaleString()} XP</div>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">Давуу Тал</div>
            <div className="text-base font-black text-primary">Gold Бодлогууд</div>
          </div>
        </div>

        <Button
          onClick={onClose}
          className="w-full gradient-brand text-white font-bold py-2.5 rounded-xl shadow-lg shadow-brand-cyan/20 cursor-pointer"
        >
          Урагшлах (Continue) 🚀
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/* ── 2. Judge Verdict Submission Modal ── */
interface JudgeVerdictModalProps {
  isOpen: boolean;
  onClose: () => void;
  verdict?: "AC" | "WA" | "TLE";
  score?: number;
  time?: string;
  memory?: string;
}

export function JudgeVerdictModal({
  isOpen,
  onClose,
  verdict = "AC",
  score = 100,
  time = "24ms",
  memory = "3.2MB",
}: JudgeVerdictModalProps) {
  const isAc = verdict === "AC";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg glass-strong border-border text-foreground rounded-3xl p-6 space-y-6 overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white ${
                isAc ? "bg-emerald-500" : "bg-rose-500"
              }`}
            >
              {isAc ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
            </div>
            <div>
              <DialogTitle className="text-base font-black">
                {isAc ? "Accepted (Бүрэн Зөв!)" : "Wrong Answer (Хариу Буруу)"}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">DMOJ Judge Tier-3 Sandbox шалгалтын дүн</p>
            </div>
          </div>
        </DialogHeader>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="glass rounded-2xl p-3 border border-border">
            <div className="text-[10px] text-muted-foreground">Оноо</div>
            <div className={`text-lg font-black ${isAc ? "text-emerald-500" : "text-rose-500"}`}>{score} / 100</div>
          </div>
          <div className="glass rounded-2xl p-3 border border-border">
            <div className="text-[10px] text-muted-foreground">Хугацаа</div>
            <div className="text-lg font-black font-mono text-foreground">{time}</div>
          </div>
          <div className="glass rounded-2xl p-3 border border-border">
            <div className="text-[10px] text-muted-foreground">Санах ой</div>
            <div className="text-lg font-black font-mono text-foreground">{memory}</div>
          </div>
        </div>

        {/* Testcases Grid */}
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Тест Кейсүүд</div>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            {[1, 2, 3, 4].map((tc) => (
              <div key={tc} className="glass rounded-xl p-2.5 border border-emerald-500/30 flex items-center justify-between">
                <span className="font-bold text-emerald-500">Test #{tc}: AC</span>
                <span className="text-[10px] text-muted-foreground">4ms · 1.8MB</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl border-border">
            Хаах
          </Button>
          <Link href="/problems" className="flex-1">
            <Button className="w-full gradient-brand text-white font-bold rounded-xl shadow-md">
              Дараагийн Бодлого →
            </Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
