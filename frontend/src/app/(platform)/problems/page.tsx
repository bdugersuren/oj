"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Code2, Search, Filter, CheckCircle2,
  AlertCircle, ChevronRight, Clock, Star, Flame, Trophy
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { useQuery } from "@tanstack/react-query";
import { problemApi } from "@/lib/api/problems";
import { Skeleton } from "@/components/ui/skeleton";

interface ProblemItem {
  id: number;
  code: string;
  title: string;
  difficulty: "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond";
  topic: string;
  points: number;
  acceptance: number;
  solvedStatus: "solved" | "attempted" | "unsolved";
  timeLimit: string;
  memoryLimit: string;
}

const TOPICS = ["Бүгд", "Brute Force", "Binary Search", "Граф", "Dynamic Prog.", "Өгөгдлийн бүтэц", "Математик"];
const DIFFICULTIES = ["Бүгд", "Bronze", "Silver", "Gold", "Platinum", "Diamond"];

const DIFFICULTY_CONFIG = {
  Bronze: { color: "text-amber-600 border-amber-600/30 bg-amber-600/10" },
  Silver: { color: "text-slate-400 border-slate-400/30 bg-slate-400/10" },
  Gold: { color: "text-amber-400 border-amber-400/30 bg-amber-400/10" },
  Platinum: { color: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10" },
  Diamond: { color: "text-purple-400 border-purple-400/30 bg-purple-400/10" },
};

export default function ProblemsPage() {
  const [search, setSearch] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("Бүгд");
  const [selectedDiff, setSelectedDiff] = useState("Бүгд");
  const { data = [], isLoading, isError } = useQuery({ queryKey: ["problems"], queryFn: () => problemApi.list() });
  const problems: ProblemItem[] = data.map((problem) => ({
    ...problem,
    difficulty: problem.difficulty as ProblemItem["difficulty"],
    acceptance: problem.total_submissions ? Math.round((problem.accepted_count ?? 0) * 100 / problem.total_submissions) : 0,
    solvedStatus: "unsolved",
    timeLimit: `${problem.time_limit}s`,
    memoryLimit: `${problem.memory_limit}MB`,
  }));

  const filteredProblems = problems.filter((p) => {
    const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase()) || p.code.includes(search);
    const matchesTopic = selectedTopic === "Бүгд" || p.topic === selectedTopic;
    const matchesDiff = selectedDiff === "Бүгд" || p.difficulty === selectedDiff;
    return matchesSearch && matchesTopic && matchesDiff;
  });

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">


      {/* ── Main Content ── */}
      <main className="max-w-7xl mx-auto px-4 pt-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black flex items-center gap-3">
              <Code2 className="w-8 h-8 text-brand-cyan" />
              Бодлогын Сан (Problem Archive)
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Бүх түвшний алгоритмын олимпиадын даалгаврууд
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Бодлого хайх (нэр, код)..."
                className="pl-9 bg-surface-1 border-white/10 rounded-xl"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="glass-md rounded-2xl p-5 mb-8 border border-white/10 space-y-4">
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-brand-cyan" /> Сэдэв (Topic)
            </div>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((topic) => (
                <button
                  key={topic}
                  onClick={() => setSelectedTopic(topic)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    selectedTopic === topic
                      ? "gradient-brand text-white shadow-md shadow-brand-cyan/20"
                      : "bg-surface-2 text-muted-foreground hover:text-foreground hover:bg-surface-3"
                  }`}
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-brand-amber" /> Түвшин (Difficulty)
            </div>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTIES.map((diff) => (
                <button
                  key={diff}
                  onClick={() => setSelectedDiff(diff)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    selectedDiff === diff
                      ? "bg-white text-black font-bold"
                      : "bg-surface-2 text-muted-foreground hover:text-foreground hover:bg-surface-3"
                  }`}
                >
                  {diff}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Problem Table List ── */}
        <div className="glass-strong rounded-2xl overflow-hidden border border-white/10">
          <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/10 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-surface-1/50">
            <div className="col-span-1">Төлөв</div>
            <div className="col-span-1">Код</div>
            <div className="col-span-4">Бодлогын нэр</div>
            <div className="col-span-2">Сэдэв</div>
            <div className="col-span-2">Хүндрэл</div>
            <div className="col-span-1 text-center">Оноо</div>
            <div className="col-span-1 text-right">Хувь</div>
          </div>

          <div className="divide-y divide-white/5">
            {isLoading &&
              Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-4 px-6 py-5 items-center animate-pulse">
                  <div className="col-span-1">
                    <Skeleton className="w-5 h-5 rounded-full bg-muted/40" />
                  </div>
                  <div className="col-span-1">
                    <Skeleton className="h-4 w-8 bg-muted/40" />
                  </div>
                  <div className="col-span-4">
                    <Skeleton className="h-4 w-48 bg-muted/60" />
                  </div>
                  <div className="col-span-2">
                    <Skeleton className="h-5 w-20 rounded-lg bg-muted/30" />
                  </div>
                  <div className="col-span-2">
                    <Skeleton className="h-5 w-16 rounded-md bg-muted/30" />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <Skeleton className="h-4 w-10 bg-muted/40" />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Skeleton className="h-4 w-8 bg-muted/40" />
                  </div>
                </div>
              ))}
            {isError && <div className="px-6 py-8 text-sm text-brand-rose font-bold text-center">Бодлогын санг ачаалж чадсангүй.</div>}
            {filteredProblems.map((prob) => {
              const diffConfig = DIFFICULTY_CONFIG[prob.difficulty];
              return (
                <Link
                  key={prob.id}
                  href={`/problems/${prob.code}`}
                  className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-white/5 transition-colors group"
                >
                  <div className="col-span-1">
                    {prob.solvedStatus === "solved" && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    )}
                    {prob.solvedStatus === "attempted" && (
                      <AlertCircle className="w-5 h-5 text-amber-400" />
                    )}
                    {prob.solvedStatus === "unsolved" && (
                      <div className="w-5 h-5 rounded-full border border-white/20" />
                    )}
                  </div>

                  <div className="col-span-1 font-mono text-xs text-muted-foreground">
                    #{prob.code}
                  </div>

                  <div className="col-span-4">
                    <div className="font-bold text-sm text-foreground group-hover:text-brand-cyan transition-colors flex items-center gap-2">
                      {prob.title}
                      <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>

                  <div className="col-span-2">
                    <span className="text-xs text-muted-foreground bg-surface-2 px-2.5 py-1 rounded-lg">
                      {prob.topic}
                    </span>
                  </div>

                  <div className="col-span-2">
                    <Badge variant="outline" className={`text-[11px] font-semibold ${diffConfig.color}`}>
                      {prob.difficulty}
                    </Badge>
                  </div>

                  <div className="col-span-1 text-center font-mono text-xs font-bold text-brand-cyan">
                    {prob.points} pt
                  </div>

                  <div className="col-span-1 text-right font-mono text-xs text-muted-foreground">
                    {prob.acceptance}%
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
