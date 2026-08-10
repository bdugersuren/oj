"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Play, Pause, RotateCcw, SkipForward, SkipBack,
  ChevronLeft, Sparkles, Sliders, Layers, Info, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AlgorithmVisualizerPage() {
  const [activeTab, setActiveTab] = useState<"bs" | "primes">("bs");

  // Binary Search Visualizer State
  const initialArray = [3, 7, 12, 19, 25, 33, 42, 56, 68, 77, 85, 99];
  const target = 42;
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speedMs, setSpeedMs] = useState<number>(1000);

  // Pre-computed Binary Search Steps
  const bsSteps = [
    { left: 0, right: 11, mid: 5, status: "checking", msg: "Эхлэл: Left = 0 (3), Right = 11 (99). Mid = 5 (33)-г шалгаж байна." },
    { left: 6, right: 11, mid: 8, status: "narrowed", msg: "33 < 42 тул зүүн талыг хаяж Left = 6 (42) болгов. Шинэ Mid = 8 (68)." },
    { left: 6, right: 7, mid: 6, status: "narrowed", msg: "68 > 42 тул баруун талыг хаяж Right = 7 (56) болгов. Шинэ Mid = 6 (42)." },
    { left: 6, right: 7, mid: 6, status: "found", msg: "🎉 ОЛДЛОО! a[6] == 42. Амжилттай 3 алхамд хайлт дууслаа." },
  ];

  const currentStep = bsSteps[stepIndex] || bsSteps[0];

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    if (isPlaying) {
      timer = setInterval(() => {
        setStepIndex((prev) => {
          if (prev < bsSteps.length - 1) return prev + 1;
          setIsPlaying(false);
          return prev;
        });
      }, speedMs);
    }
    return () => clearInterval(timer);
  }, [isPlaying, speedMs, bsSteps.length]);

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-40 glass border-b border-border h-16 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/algorithms">
              <Button variant="ghost" size="icon" className="rounded-xl">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Badge className="bg-brand-violet/15 text-brand-violet border-none text-[10px] font-bold">
                  Algorithm Visualizer Canvas
                </Badge>
                <h1 className="text-sm font-black">Интерактив Алгоритм Хөдөлгөөнт Дүрслэгч</h1>
              </div>
              <p className="text-xs text-muted-foreground">Алгоритмын ажиллах явцыг нүдээрээ алхам алхмаар харах студи</p>
            </div>
          </div>

          <ThemeToggle />
        </div>
      </header>

      {/* ── Main Canvas ── */}
      <main className="max-w-6xl mx-auto px-4 pt-8 space-y-8">
        {/* Visualizer Selector Tabs */}
        <div className="glass p-1.5 rounded-2xl border border-border flex gap-2 max-w-md">
          <button
            onClick={() => { setActiveTab("bs"); setStepIndex(0); setIsPlaying(false); }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "bs" ? "gradient-brand text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            🔍 Хоёртын Хайлт (Binary Search)
          </button>
          <button
            onClick={() => { setActiveTab("primes"); }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === "primes" ? "gradient-brand text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            ⚡ O(√N) Тооны Онолын Шүүлтүүр
          </button>
        </div>

        {/* Binary Search Animation Canvas */}
        {activeTab === "bs" && (
          <div className="glass-strong rounded-3xl p-8 border border-border space-y-8 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-brand-cyan" />
                  Эрэмбэлэгдсэн Массив дээр $O(\log N)$ Хоёртын Хайлт
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Хайж буй утга: <strong className="text-brand-cyan font-mono text-sm">Target = {target}</strong>
                </p>
              </div>

              {/* Step info */}
              <Badge variant="outline" className="text-xs font-mono border-border px-3 py-1 font-bold">
                Алхам: {stepIndex + 1} / {bsSteps.length}
              </Badge>
            </div>

            {/* Visual Array Grid */}
            <div className="flex justify-center items-center gap-2 overflow-x-auto py-8">
              {initialArray.map((val, idx) => {
                const isLeft = idx === currentStep.left;
                const isRight = idx === currentStep.right;
                const isMid = idx === currentStep.mid;
                const inRange = idx >= currentStep.left && idx <= currentStep.right;
                const isFound = currentStep.status === "found" && idx === currentStep.mid;

                return (
                  <motion.div
                    key={idx}
                    animate={{
                      scale: isMid ? 1.15 : 1,
                      y: isMid ? -8 : 0,
                      opacity: inRange ? 1 : 0.25,
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className={`relative w-14 h-20 rounded-2xl border-2 flex flex-col items-center justify-center font-mono font-bold transition-colors ${
                      isFound
                        ? "bg-emerald-500 text-white border-emerald-400 shadow-xl shadow-emerald-500/30"
                        : isMid
                        ? "bg-brand-cyan text-white border-cyan-300 shadow-xl shadow-brand-cyan/30"
                        : inRange
                        ? "bg-secondary border-border text-foreground"
                        : "bg-secondary/30 border-transparent text-muted-foreground"
                    }`}
                  >
                    <span className="text-lg">{val}</span>
                    <span className="text-[10px] opacity-70 mt-1">[{idx}]</span>

                    {/* Pointer Labels */}
                    {isLeft && (
                      <span className="absolute -top-7 text-[10px] font-black text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">
                        L
                      </span>
                    )}
                    {isRight && (
                      <span className="absolute -bottom-7 text-[10px] font-black text-purple-500 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/30">
                        R
                      </span>
                    )}
                    {isMid && (
                      <span className="absolute -top-7 text-[10px] font-black text-cyan-400 bg-cyan-500/20 px-1.5 py-0.5 rounded border border-cyan-500/40">
                        MID
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Explanation Message Box */}
            <div className="glass rounded-2xl p-4 border border-border bg-card/60 flex items-center gap-3">
              <Info className="w-5 h-5 text-brand-cyan shrink-0" />
              <p className="text-xs text-foreground leading-relaxed font-medium">
                {currentStep.msg}
              </p>
            </div>

            {/* Animation Player Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStepIndex(Math.max(0, stepIndex - 1))}
                  disabled={stepIndex === 0}
                  className="rounded-xl border-border h-9"
                >
                  <SkipBack className="w-4 h-4" />
                </Button>

                <Button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="gradient-brand text-white border-0 font-bold px-6 h-9 rounded-xl shadow-md cursor-pointer gap-2"
                >
                  {isPlaying ? <><Pause className="w-4 h-4" /> Түр зогсоох</> : <><Play className="w-4 h-4" /> Тоглуулах</>}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStepIndex(Math.min(bsSteps.length - 1, stepIndex + 1))}
                  disabled={stepIndex === bsSteps.length - 1}
                  className="rounded-xl border-border h-9"
                >
                  <SkipForward className="w-4 h-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setStepIndex(0); setIsPlaying(false); }}
                  className="rounded-xl h-9 text-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Дахин эхлүүлэх
                </Button>
              </div>

              {/* Speed Slider */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
                <span>Хурд:</span>
                <select
                  value={speedMs}
                  onChange={(e) => setSpeedMs(Number(e.target.value))}
                  className="bg-secondary text-xs text-foreground px-2.5 py-1 rounded-xl border border-border outline-none cursor-pointer"
                >
                  <option value={1500}>0.7x (Удаан)</option>
                  <option value={1000}>1.0x (Хэвийн)</option>
                  <option value={500}>2.0x (Хурдан)</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
