"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen, Search, Filter, Sparkles, Clock,
  CheckCircle2, ArrowRight, Code2, Brain, Calculator,
  Layers, Trophy, Star
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { lessonApi } from "@/lib/api/lessons";

const CATEGORIES = [
  "Бүгд",
  "Математик (Math for Olympiad)",
  "Алгоритм (Algorithms & CP)",
  "Өгөгдлийн Бүтэц (Data Structures)",
  "Хиймэл Оюун ба Логик (AI/ML & Logic)",
];

const DIFFICULTY_COLORS: Record<string, string> = {
  Bronze: "text-amber-600 border-amber-600/30 bg-amber-600/10",
  Silver: "text-slate-500 border-slate-500/30 bg-slate-500/10",
  Gold: "text-amber-500 border-amber-500/30 bg-amber-500/10",
  Platinum: "text-sky-500 border-sky-500/30 bg-sky-500/10",
};

export default function LessonsPage() {
  const [selectedCat, setSelectedCat] = useState("Бүгд");
  const [search, setSearch] = useState("");
  const { data: lessons = [], isLoading, isError } = useQuery({ queryKey: ["lessons"], queryFn: () => lessonApi.list() });

  const filtered = lessons.filter((l) => {
    const matchesCat = selectedCat === "Бүгд" || l.category === selectedCat;
    const matchesSearch = l.title.toLowerCase().includes(search.toLowerCase()) || l.topic.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">


      {/* ── Main Content ── */}
      <main className="max-w-7xl mx-auto px-4 pt-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-brand-cyan" />
              Онолын Материалын Сан (Theory & Lessons)
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Олимпиадын суурь математик, алгоритм ба интерактив тестүүд
            </p>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Хичээл, сэдэв хайх..."
              className="pl-9 bg-card border-border rounded-xl"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* ── Category Filters ── */}
        <div className="glass rounded-2xl p-4 mb-8 border border-border flex gap-2 overflow-x-auto scrollbar-thin">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCat(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCat === cat
                  ? "gradient-brand text-white shadow-md shadow-brand-cyan/20"
                  : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* ── Lesson Cards Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {isLoading && <p className="text-sm text-muted-foreground">Хичээлүүдийг ачаалж байна…</p>}
          {isError && <p className="text-sm text-rose-500">Хичээлүүдийг ачаалж чадсангүй.</p>}
          {filtered.map((lesson) => {
            const diffClass = DIFFICULTY_COLORS[lesson.difficulty] || DIFFICULTY_COLORS["Bronze"];
            return (
              <motion.div
                key={lesson.slug}
                whileHover={{ y: -4 }}
                className="glass-strong rounded-3xl p-6 border border-border flex flex-col justify-between group shadow-xs hover:border-brand-cyan/40 transition-all duration-300 relative overflow-hidden"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-brand-cyan flex items-center gap-1.5">
                      <Calculator className="w-3.5 h-3.5" /> {lesson.topic}
                    </span>
                    <Badge variant="outline" className={`text-[11px] font-semibold ${diffClass}`}>
                      {lesson.difficulty}
                    </Badge>
                  </div>

                  <h3 className="font-black text-lg text-foreground mb-2 group-hover:text-primary transition-colors">
                    {lesson.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                    {lesson.summary}
                  </p>
                </div>

                <div className="pt-4 border-t border-border flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {lesson.estimated_minutes} мин
                    </span>
                    <span className="flex items-center gap-1 text-brand-amber font-bold">
                      <Sparkles className="w-3.5 h-3.5" /> +{lesson.xp_reward} XP
                    </span>
                    <span className="flex items-center gap-1">
                      <Code2 className="w-3.5 h-3.5" /> {lesson.practice_problems_count} бодлоготой
                    </span>
                  </div>

                  <Link href={`/lessons/${lesson.slug}`}>
                    <Button size="sm" className="gradient-brand text-white border-0 text-xs font-bold gap-1 rounded-xl shadow-sm">
                      Үзэх <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
