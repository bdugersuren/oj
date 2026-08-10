"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Code2, Lock, Sparkles, Trophy } from "lucide-react";
import { worldApi } from "@/lib/api/worlds";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export default function WorldsPage() {
  const { data: worlds = [], isLoading, isError } = useQuery({
    queryKey: ["worlds"],
    queryFn: worldApi.list,
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  
  const current = worlds.find((world) => world.id === selectedId) ?? worlds[0];
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  
  const stageSlug = selectedStage ?? current?.stages.find((stage) => !stage.is_locked)?.slug ?? null;
  const { data: problems = [], isLoading: problemsLoading } = useQuery({
    queryKey: ["world-stage", stageSlug],
    queryFn: () => worldApi.stageProblems(stageSlug!),
    enabled: Boolean(stageSlug),
  });

  if (isLoading) {
    return (
      <main className="max-w-7xl mx-auto px-4 pt-8 w-full flex flex-col gap-4 animate-pulse">
        <div className="h-10 w-64 bg-secondary/60 rounded-xl" />
        <div className="h-4 w-96 bg-secondary/40 rounded-xl" />
        <div className="h-32 w-full bg-secondary/30 rounded-2xl mt-4" />
      </main>
    );
  }

  if (isError || !current) {
    return (
      <main className="max-w-7xl mx-auto px-4 pt-8 text-center">
        <p className="text-sm text-rose-500 font-bold">
          Замналын өгөгдлийг ачаалж чадсангүй.
        </p>
      </main>
    );
  }

  const completed = current.stages.filter((stage) => stage.is_completed).length;
  const progress = current.stages.length ? Math.round((completed / current.stages.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <main className="max-w-7xl mx-auto px-4 pt-8 space-y-8">
        
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-brand-cyan" />
            Олимпиад Аялал (Olympiad Journey)
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Шаталсан сургалт болон сэдэвчилсэн замналаар бодлого бодож хөгжих
          </p>
        </div>

        {/* Worlds Select Row */}
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {worlds.map((world) => (
            <button
              key={world.id}
              onClick={() => {
                setSelectedId(world.id);
                setSelectedStage(null);
              }}
              className={`min-w-[240px] p-4 text-left rounded-2xl border transition-all cursor-pointer ${
                world.id === current.id
                  ? "border-brand-cyan bg-brand-cyan/5 shadow-md shadow-brand-cyan/5"
                  : "border-border/60 hover:bg-secondary/40"
              }`}
            >
              <p className="text-[10px] text-muted-foreground uppercase font-black tracking-wider">
                Дэлхий {world.order}
              </p>
              <p className="font-bold text-sm mt-0.5 truncate">{world.title}</p>
            </button>
          ))}
        </div>

        {/* Selected World Overview */}
        <section className="glass-md border border-border/60 rounded-3xl p-6 md:p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-brand-cyan/10 to-brand-violet/10 rounded-full blur-3xl pointer-events-none" />
          <Badge className="mb-3 bg-brand-cyan/20 text-brand-cyan hover:bg-brand-cyan/20 border-none font-bold">
            <Trophy className="w-3 h-3 mr-1" />
            {current.required_level_name} шаардлагатай
          </Badge>
          <h2 className="text-2xl font-black">{current.title}</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
            {current.description}
          </p>
          
          <div className="mt-6 flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <div>
              <p className="text-xs text-muted-foreground">
                Аяллын явц: <span className="font-bold text-foreground">{completed}/{current.stages.length} шат</span> дууссан
              </p>
              <Progress value={progress} className="h-2 w-64 bg-secondary mt-2" />
            </div>
          </div>
        </section>

        {/* Stages list & Problem box */}
        <section className="grid lg:grid-cols-3 gap-6">
          
          {/* Stages List */}
          <div className="space-y-3">
            <h3 className="text-sm font-black text-muted-foreground uppercase tracking-wider pl-1">
              Шатууд (Stages)
            </h3>
            {current.stages.map((stage) => (
              <button
                key={stage.id}
                disabled={stage.is_locked}
                onClick={() => setSelectedStage(stage.slug)}
                className={`w-full text-left rounded-2xl border p-4 transition-all ${
                  stage.slug === stageSlug
                    ? "border-brand-cyan bg-brand-cyan/5"
                    : "border-border/60 hover:bg-secondary/40"
                } ${stage.is_locked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm">
                    {stage.order}. {stage.title}
                  </span>
                  {stage.is_locked ? (
                    <Lock className="w-4 h-4 text-muted-foreground" />
                  ) : stage.is_completed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stage.solved_count}/{stage.problems_count} бодлого бодсон
                </p>
              </button>
            ))}
          </div>

          {/* Stage Problems View */}
          <div className="lg:col-span-2 glass-strong rounded-3xl border border-border/60 p-6">
            <h3 className="font-black mb-4 flex gap-2 text-sm text-foreground uppercase tracking-wider">
              <Code2 className="w-4 h-4 text-brand-cyan animate-pulse" />
              Шатын бодлогууд
            </h3>
            
            {problemsLoading ? (
              <div className="space-y-3">
                <div className="h-12 w-full bg-secondary/50 rounded-xl animate-pulse" />
                <div className="h-12 w-full bg-secondary/50 rounded-xl animate-pulse" />
              </div>
            ) : (
              <div className="space-y-3">
                {problems.map((problem) => (
                  <Link
                    key={problem.id}
                    href={`/problems/${problem.code}`}
                    className="block rounded-2xl border border-border/40 p-4 bg-card/40 hover:bg-secondary/30 transition-all group"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono text-xs text-brand-cyan font-bold">
                          #{problem.code}
                        </span>
                        <p className="font-bold text-sm group-hover:text-brand-cyan transition-colors mt-0.5">
                          {problem.title}
                        </p>
                      </div>
                      <Badge className="bg-secondary text-muted-foreground hover:bg-secondary border-none font-bold text-[10px]">
                        {problem.difficulty}
                      </Badge>
                    </div>
                    
                    <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground">
                      <span>{problem.points} XP бонус</span>
                      <span className={`font-bold ${problem.is_solved ? "text-emerald-500" : "text-amber-500"}`}>
                        {problem.is_solved ? "✓ Бодсон" : "○ Бодоогүй"}
                      </span>
                    </div>
                  </Link>
                ))}
                
                {problems.length === 0 && (
                  <p className="text-xs text-muted-foreground py-6 text-center">
                    Энэ шатанд одоогоор бодлого байхгүй байна.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
