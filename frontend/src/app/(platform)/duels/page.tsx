"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Editor from "@monaco-editor/react";
import {
  Swords, Trophy, Clock, Zap, Send, Play,
  CheckCircle2, XCircle, ChevronLeft, Sparkles,
  Flame, Shield, Award, User, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTheme } from "next-themes";
import toast from "react-hot-toast";

export default function DuelsPage() {
  const { resolvedTheme } = useTheme();

  // Duel State
  const [timeLeft, setTimeLeft] = useState<number>(300); // 5 minutes (300 sec)
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [myTestsPassed, setMyTestsPassed] = useState<number>(3);
  const [oppTestsPassed, setOppTestsPassed] = useState<number>(2);
  const [duelFinished, setDuelFinished] = useState<boolean>(false);
  const [winner, setWinner] = useState<string | null>(null);

  const [code, setCode] = useState<string>(`#include <iostream>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    
    long long n;
    if (cin >> n) {
        // Fast prime check
        if (n <= 1) { cout << "NO\\n"; return 0; }
        for (long long i = 2; i * i <= n; i++) {
            if (n % i == 0) { cout << "NO\\n"; return 0; }
        }
        cout << "YES\\n";
    }
    return 0;
}`);

  // Timer countdown
  useEffect(() => {
    if (!isPlaying || duelFinished) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsPlaying(false);
          setDuelFinished(true);
          setWinner("my");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isPlaying, duelFinished]);

  // Simulate opponent's real-time progress
  useEffect(() => {
    if (duelFinished) return;
    const oppTimer = setTimeout(() => {
      setOppTestsPassed(4);
    }, 6000);
    return () => clearTimeout(oppTimer);
  }, [duelFinished]);

  const handleSubmitDuel = () => {
    setMyTestsPassed(5);
    setDuelFinished(true);
    setWinner("my");
    toast.success("🎉 БАЯР ХҮРГЭЕ! Та өрсөлдөгчөөсөө түрүүлж 5/5 давж яллаа! +50 Duel Elo");
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* ── Top Bar ── */}
      <header className="h-16 glass border-b border-border px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="rounded-xl">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-500 flex items-center justify-center">
              <Swords className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-black flex items-center gap-2">
                <span>1v1 Хурдны Дуэль Арена (Speed Coding)</span>
                <Badge className="bg-rose-500/20 text-rose-500 border-none text-[10px] animate-pulse">
                  MATCH IN PROGRESS
                </Badge>
              </h1>
            </div>
          </div>
        </div>

        {/* Duel Timer */}
        <div className="glass px-5 py-1.5 rounded-2xl border border-rose-500/30 bg-rose-500/10 flex items-center gap-2 text-rose-500 font-mono font-black text-base shadow-sm">
          <Clock className="w-4 h-4 animate-spin" />
          <span>{formatTime(timeLeft)}</span>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      {/* ── Versus Header Banner ── */}
      <div className="bg-secondary/40 border-b border-border px-8 py-3 flex items-center justify-between shrink-0">
        {/* Player 1 (You) */}
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-2xl gradient-brand flex items-center justify-center text-white font-black text-sm shadow-md">
            ТА
          </div>
          <div>
            <div className="text-xs font-black text-foreground">bold_coder (Та)</div>
            <div className="text-[11px] text-brand-cyan font-bold">1,840 Elo · {myTestsPassed}/5 Тест давсан</div>
            <Progress value={(myTestsPassed / 5) * 100} className="h-1.5 w-36 mt-1 bg-secondary" />
          </div>
        </div>

        {/* VS Badge */}
        <div className="w-10 h-10 rounded-2xl bg-card border border-border flex items-center justify-center font-black text-rose-500 text-xs shadow-inner">
          VS
        </div>

        {/* Player 2 (Opponent) */}
        <div className="flex items-center justify-end gap-3 flex-1 text-right">
          <div>
            <div className="text-xs font-black text-foreground">temuulen_pro (Өрсөлдөгч)</div>
            <div className="text-[11px] text-purple-400 font-bold">{oppTestsPassed}/5 Тест давсан · 1,815 Elo</div>
            <Progress value={(oppTestsPassed / 5) * 100} className="h-1.5 w-36 mt-1 ml-auto bg-secondary" />
          </div>
          <div className="w-10 h-10 rounded-2xl bg-purple-600 flex items-center justify-center text-white font-black text-sm shadow-md">
            OP
          </div>
        </div>
      </div>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Duel Problem Statement */}
        <div className="w-1/2 border-r border-border p-6 overflow-y-auto space-y-6 bg-card/20">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-amber-500 border-amber-500/30 font-bold">
              Бодлого: #1003 Анхны Тооны Шалгуур
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">Time Limit: 1.0s</span>
          </div>

          <div className="space-y-3 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
            <h3 className="font-bold text-sm text-foreground">Өгүүлбэр</h3>
            <p>
              Танд нэг бүхэл тоо $N$ ($1 \le N \le 10^9$) өгөгдөнө. Тухайн тоог анхны тоо мөн эсэхийг хамгийн хурдан хугацаанд шалгаж <code>YES</code> эсвэл <code>NO</code> гэж хэвлэнэ үү.
            </p>

            <h3 className="font-bold text-sm text-foreground pt-2">Жишээ</h3>
            <div className="grid grid-cols-2 gap-3 font-mono">
              <div className="bg-secondary p-3 rounded-xl border border-border">
                <div className="text-[10px] text-muted-foreground mb-1">Оролт:</div>
                <div>17</div>
              </div>
              <div className="bg-secondary p-3 rounded-xl border border-border">
                <div className="text-[10px] text-muted-foreground mb-1">Гаралт:</div>
                <div className="text-emerald-500 font-bold">YES</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Monaco Code Editor */}
        <div className="w-1/2 flex flex-col bg-[#1e1e1e]">
          <div className="h-10 bg-[#252526] border-b border-white/5 px-4 flex items-center justify-between shrink-0">
            <span className="text-xs text-slate-400 font-mono">C++ 17 (G++)</span>
            <Button
              size="sm"
              onClick={handleSubmitDuel}
              disabled={duelFinished}
              className="h-7 text-xs gradient-brand text-white border-0 font-bold gap-1 rounded-lg shadow-md shadow-brand-cyan/20 cursor-pointer"
            >
              <Send className="w-3 h-3" /> Код Илгээх (Submit)
            </Button>
          </div>

          <div className="flex-1 relative">
            <Editor
              height="100%"
              language="cpp"
              theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
              value={code}
              onChange={(val) => setCode(val || "")}
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                automaticLayout: true,
                padding: { top: 12, bottom: 12 },
                fontFamily: "JetBrains Mono, monospace",
              }}
            />
          </div>
        </div>
      </div>

      {/* ── Victory Celebration Modal ── */}
      {duelFinished && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="max-w-md w-full glass-strong border-border text-foreground rounded-3xl p-8 text-center space-y-6 shadow-2xl">
            <div className="w-20 h-20 rounded-3xl gradient-brand mx-auto flex items-center justify-center text-white text-3xl shadow-xl shadow-brand-cyan/30 ring-4 ring-brand-cyan/40">
              🏆
            </div>

            <div className="space-y-2">
              <Badge className="bg-emerald-500/20 text-emerald-500 border-none text-xs font-bold">
                VICTORY! ТА ЯЛЛАА
              </Badge>
              <h2 className="text-2xl font-black">1v1 Дуэлд Түрүүллээ!</h2>
              <p className="text-xs text-muted-foreground">
                Та өрсөлдөгчөөсөө түрүүлж бүх 5 тест кейсийг амжилттай давлаа.
              </p>
            </div>

            <div className="glass rounded-2xl p-4 border border-border flex items-center justify-around text-xs font-bold bg-card/60">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Elo Rating</div>
                <div className="text-base font-black text-emerald-500">+50 Elo</div>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <div className="text-[10px] text-muted-foreground uppercase">Урамшуулал</div>
                <div className="text-base font-black text-amber-500">+100 XP</div>
              </div>
            </div>

            <div className="flex gap-3">
              <Link href="/dashboard" className="flex-1">
                <Button variant="outline" className="w-full rounded-xl border-border">
                  Dashboard
                </Button>
              </Link>
              <Button
                onClick={() => { setDuelFinished(false); setTimeLeft(300); }}
                className="flex-1 gradient-brand text-white font-bold rounded-xl shadow-md"
              >
                Дахин Тоглох ⚔️
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
