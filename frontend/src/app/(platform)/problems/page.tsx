"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Code2, Search, CheckCircle2, AlertCircle, ChevronRight,
  BookOpen, Star, HelpCircle, UserCheck, Lock, FileText, Minus, Loader2, Upload
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { problemApi } from "@/lib/api/problems";
import { authApi } from "@/lib/api/auth";
import { Skeleton } from "@/components/ui/skeleton";
import toast from "react-hot-toast";

interface ProblemItem {
  id: number;
  code: string;
  title: string;
  difficulty: "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond";
  topic: string;
  points: number;
  acceptance: number;
  solvedStatus: "solved" | "attempted" | "unsolved" | "locked";
  statement_pdf_path?: string | null;
  accepted_count: number;
  total_submissions: number;
}

const TOPICS = [
  "Бүгд",
  "Brute Force",
  "Binary Search",
  "Граф",
  "Dynamic Prog.",
  "Өгөгдлийн бүтэц",
  "Математик",
  "Сургууль",
  "Онолын",
  "level-01"
];

const DIFFICULTY_CONFIG = {
  Bronze: { color: "text-amber-600 border-amber-600/30 bg-amber-600/10" },
  Silver: { color: "text-slate-400 border-slate-400/30 bg-slate-400/10" },
  Gold: { color: "text-amber-400 border-amber-400/30 bg-amber-400/10" },
  Platinum: { color: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10" },
  Diamond: { color: "text-purple-400 border-purple-400/30 bg-purple-400/10" },
};

export default function ProblemsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isImporting, setIsImporting] = useState(false);
  
  useEffect(() => {
    authApi.me()
      .then((user) => {
        setCurrentUser(user);
      })
      .catch((err) => {
        console.log("Not authenticated:", err);
      });
  }, []);

  const handleImportZIP = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsImporting(true);
    try {
      const newProblem = await problemApi.importProblem(file);
      toast.success(`Бодлого амжилттай импортлогдлоо: ${newProblem.title} (${newProblem.code})`);
      void queryClient.invalidateQueries({ queryKey: ["problems"] });
      router.push(`/teacher/problems/${newProblem.code}/workspace`);
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.detail || "Бодлого импортлоход алдаа гарлаа.";
      toast.error(msg);
    } finally {
      setIsImporting(false);
      e.target.value = "";
    }
  };

  // Search & Filter state variables
  const [search, setSearch] = useState("");
  const [fullText, setFullText] = useState(false);
  const [hideSolved, setHideSolved] = useState(false);
  const [hasEditorialFilter, setHasEditorialFilter] = useState(false);
  const [showTypes, setShowTypes] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState("Бүгд");
  const [pointMin, setPointMin] = useState(1);
  const [pointMax, setPointMax] = useState(100);

  // Fetch problems list
  const { data = [], isLoading, isError } = useQuery({ 
    queryKey: ["problems"], 
    queryFn: () => problemApi.list() 
  });

  // Map API response to local interface
  const problems: ProblemItem[] = data.map((problem: any) => {
    // Demo locking logic: lock gold or higher problems for users under level-01 if needed,
    // or just pass locked based on custom conditions. Here we mock some "locked" problems for premium visual.
    let statusVal: ProblemItem["solvedStatus"] = (problem.solved_status as ProblemItem["solvedStatus"]) || "unsolved";
    if (problem.code === "BF102") {
      statusVal = "locked";
    }
    
    return {
      ...problem,
      difficulty: problem.difficulty as ProblemItem["difficulty"],
      acceptance: problem.total_submissions ? Math.round((problem.accepted_count ?? 0) * 100 / problem.total_submissions) : 0,
      solvedStatus: statusVal,
      statement_pdf_path: problem.statement_pdf_path,
      accepted_count: problem.accepted_count ?? 0,
      total_submissions: problem.total_submissions ?? 0
    };
  });

  // Filtering logic
  const filteredProblems = problems.filter((p) => {
    const matchesSearch = fullText 
      ? p.title.toLowerCase().includes(search.toLowerCase()) || p.code.includes(search) || p.topic.toLowerCase().includes(search.toLowerCase())
      : p.title.toLowerCase().includes(search.toLowerCase()) || p.code.includes(search);
    
    const matchesSolved = !hideSolved || p.solvedStatus !== "solved";
    const matchesEditorial = !hasEditorialFilter || !!p.statement_pdf_path;
    const matchesTopic = selectedTopic === "Бүгд" || p.topic === selectedTopic;
    const matchesPoints = p.points >= pointMin && p.points <= pointMax;
    
    return matchesSearch && matchesSolved && matchesEditorial && matchesTopic && matchesPoints;
  });

  // Pick a random problem from the filtered list
  const handleRandomProblem = () => {
    if (filteredProblems.length === 0) {
      toast.error("Шүүлтүүрт тохирох бодлого олдсонгүй.");
      return;
    }
    const randomIndex = Math.floor(Math.random() * filteredProblems.length);
    const randomProb = filteredProblems[randomIndex];
    toast.success(`Санамсаргүй бодлого сонгогдлоо: ${randomProb.title}`);
    router.push(`/problems/${randomProb.code}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* ── Main Content ── */}
      <main className="max-w-7xl mx-auto px-4 pt-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-black flex items-center gap-3">
              <Code2 className="w-8 h-8 text-brand-cyan" />
              Бодлогын Сан (Problem Archive)
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Бүх түвшний алгоритмын олимпиадын даалгаврууд
            </p>
          </div>

          {(currentUser?.role === "teacher" || currentUser?.role === "admin") && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 h-9 px-4 text-xs font-bold bg-brand-cyan hover:bg-brand-cyan/85 text-black rounded-xl cursor-pointer shadow-md shadow-brand-cyan/15 transition-all">
                {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Бодлого Импортлох (Import ZIP)
                <input 
                  type="file" 
                  accept=".zip" 
                  onChange={handleImportZIP} 
                  disabled={isImporting}
                  className="hidden" 
                />
              </label>
            </div>
          )}
        </div>

        {/* ── Two Column Layout (75% Problems List Table, 25% Search Sidebar) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* LEFT: Structured Problems Table */}
          <div className="lg:col-span-3 glass-strong rounded-2xl overflow-hidden border border-border">
            <div className="grid grid-cols-12 gap-2 px-5 py-3.5 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-secondary/35">
              <div className="col-span-1 flex items-center justify-center">✔</div>
              <div className="col-span-4 flex items-center">Бодлогын нэр (Problem)</div>
              {showTypes && <div className="col-span-2 flex items-center">Сэдэв</div>}
              <div className="col-span-1 text-center flex items-center justify-center">Оноо</div>
              <div className="col-span-1 text-center flex items-center justify-center">AC %</div>
              <div className="col-span-1 text-center flex items-center justify-center">📄</div>
              <div className="col-span-2 text-right flex items-center justify-end">Бодсон хэрэглэгчид</div>
            </div>

            <div className="divide-y divide-border/40">
              {isLoading &&
                Array.from({ length: 8 }).map((_, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 px-5 py-4 items-center animate-pulse">
                    <div className="col-span-1 flex justify-center">
                      <Skeleton className="w-4 h-4 rounded-full bg-muted/40" />
                    </div>
                    <div className="col-span-4">
                      <Skeleton className="h-4 w-40 bg-muted/60" />
                    </div>
                    {showTypes && (
                      <div className="col-span-2">
                        <Skeleton className="h-4.5 w-16 rounded bg-muted/30" />
                      </div>
                    )}
                    <div className="col-span-1 flex justify-center">
                      <Skeleton className="h-4 w-6 bg-muted/40" />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <Skeleton className="h-4 w-8 bg-muted/40" />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <Skeleton className="h-4 w-4 bg-muted/40" />
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <Skeleton className="h-4 w-12 bg-muted/40" />
                    </div>
                  </div>
                ))}
              
              {isError && (
                <div className="px-6 py-12 text-sm text-rose-500 font-bold text-center">
                  Бодлогын санг ачаалж чадсангүй.
                </div>
              )}

              {!isLoading && filteredProblems.length === 0 && (
                <div className="px-6 py-12 text-xs text-muted-foreground text-center">
                  Хайлтын шүүлтүүрт тохирох бодлого олдсонгүй.
                </div>
              )}

              {filteredProblems.map((prob) => {
                const diffConfig = DIFFICULTY_CONFIG[prob.difficulty] || DIFFICULTY_CONFIG.Bronze;
                return (
                  <Link
                    key={prob.id}
                    href={prob.solvedStatus === "locked" ? "#" : `/problems/${prob.code}`}
                    onClick={(e) => {
                      if (prob.solvedStatus === "locked") {
                        e.preventDefault();
                        toast.error("Энэ бодлого одоогоор түгжигдсэн байна. Дараагийн түвшний даалгавруудыг гүйцээнэ үү!");
                      }
                    }}
                    className={`grid grid-cols-12 gap-2 px-5 py-3.5 items-center hover:bg-secondary/25 transition-colors group ${
                      prob.solvedStatus === "locked" ? "opacity-55 cursor-not-allowed bg-secondary/5" : ""
                    }`}
                  >
                    {/* Column 1: Status Icon */}
                    <div className="col-span-1 flex items-center justify-center">
                      {prob.solvedStatus === "solved" && (
                        <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                      )}
                      {prob.solvedStatus === "attempted" && (
                        <AlertCircle className="w-4.5 h-4.5 text-amber-500 animate-pulse-slow" />
                      )}
                      {prob.solvedStatus === "locked" && (
                        <Lock className="w-4 h-4 text-rose-500" />
                      )}
                      {prob.solvedStatus === "unsolved" && (
                        <div className="w-4 h-4 rounded-full border border-border group-hover:border-brand-cyan transition-colors" />
                      )}
                    </div>

                    {/* Column 2: Problem title & code */}
                    <div className="col-span-4 pr-2">
                      <div className="font-bold text-[13px] text-foreground group-hover:text-brand-cyan transition-colors flex items-center gap-1.5 flex-wrap">
                        <span>{prob.title}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">({prob.code})</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-all transform translate-x-0 group-hover:translate-x-0.5 text-brand-cyan" />
                      </div>
                    </div>

                    {/* Column 3: Category/Topic */}
                    {showTypes && (
                      <div className="col-span-2">
                        <span className="text-[10px] text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-lg border border-border/30">
                          {prob.topic}
                        </span>
                      </div>
                    )}

                    {/* Column 4: Points */}
                    <div className="col-span-1 text-center font-mono text-xs font-bold text-brand-cyan">
                      {prob.points}
                    </div>

                    {/* Column 5: AC Percentage */}
                    <div className="col-span-1 text-center font-mono text-xs text-muted-foreground">
                      {prob.acceptance}%
                    </div>

                    {/* Column 6: Has Editorial */}
                    <div className="col-span-1 flex items-center justify-center text-muted-foreground">
                      {prob.statement_pdf_path ? (
                        <FileText className="w-4.5 h-4.5 text-brand-violet/80" />
                      ) : (
                        <Minus className="w-4 h-4 opacity-30" />
                      )}
                    </div>

                    {/* Column 7: Solved Users Count */}
                    <div className="col-span-2 text-right font-mono text-xs text-slate-300 pr-1 flex items-center justify-end gap-1">
                      <UserCheck className="w-3.5 h-3.5 text-muted-foreground/60" />
                      <span>{prob.accepted_count}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Search & Filter Sidebar Panel */}
          <div className="glass rounded-2xl overflow-hidden border border-border shadow-md">
            <div className="bg-secondary/80 border-b border-border px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Problem search</span>
              <Search className="w-3.5 h-3.5 text-muted-foreground" />
            </div>

            <div className="p-4 space-y-5">
              {/* Search text box */}
              <div className="space-y-1.5">
                <Input
                  placeholder="Бодлого хайх..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8.5 text-xs bg-surface-1 border-border rounded-xl focus:border-brand-cyan"
                />
              </div>

              {/* Checkboxes group */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox"
                    id="fullText" 
                    checked={fullText} 
                    onChange={(e) => setFullText(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border border-border bg-[#1e1e1e] checked:bg-brand-cyan checked:border-brand-cyan accent-brand-cyan cursor-pointer"
                  />
                  <label htmlFor="fullText" className="text-[11px] font-medium text-slate-300 cursor-pointer select-none">
                    Дэлгэрэнгүй хайлт
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox"
                    id="hideSolved" 
                    checked={hideSolved} 
                    onChange={(e) => setHideSolved(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border border-border bg-[#1e1e1e] checked:bg-brand-cyan checked:border-brand-cyan accent-brand-cyan cursor-pointer"
                  />
                  <label htmlFor="hideSolved" className="text-[11px] font-medium text-slate-300 cursor-pointer select-none">
                    Бодсон бодлогыг нуух
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox"
                    id="hasEditorial" 
                    checked={hasEditorialFilter} 
                    onChange={(e) => setHasEditorialFilter(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border border-border bg-[#1e1e1e] checked:bg-brand-cyan checked:border-brand-cyan accent-brand-cyan cursor-pointer"
                  />
                  <label htmlFor="hasEditorial" className="text-[11px] font-medium text-slate-300 cursor-pointer select-none">
                    Бодолтын заавартай бодлогууд
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox"
                    id="showTypes" 
                    checked={showTypes} 
                    onChange={(e) => setShowTypes(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border border-border bg-[#1e1e1e] checked:bg-brand-cyan checked:border-brand-cyan accent-brand-cyan cursor-pointer"
                  />
                  <label htmlFor="showTypes" className="text-[11px] font-medium text-slate-300 cursor-pointer select-none">
                    Сэдэв баганыг харуулах
                  </label>
                </div>
              </div>

              {/* Category dropdown select */}
              <div className="space-y-1.5 border-t border-border/40 pt-4">
                <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">
                  Сэдэв (Category)
                </label>
                <select
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value)}
                  className="w-full bg-[#1e1e1e] text-xs text-white px-2.5 py-1.5 rounded-xl border border-border/80 outline-none cursor-pointer"
                >
                  {TOPICS.map((topic) => (
                    <option key={topic} value={topic}>{topic}</option>
                  ))}
                </select>
              </div>

              {/* Point range input */}
              <div className="space-y-2.5 border-t border-border/40 pt-4">
                <div className="flex justify-between items-center text-[10px] font-black uppercase text-muted-foreground tracking-wider">
                  <span>Онооны хүрээ (Points)</span>
                  <span className="font-mono font-bold text-brand-cyan">{pointMin} - {pointMax}</span>
                </div>
                
                <div className="flex gap-2">
                  <Input 
                    type="number"
                    min="1"
                    max="100"
                    value={pointMin}
                    onChange={(e) => setPointMin(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-8 text-center text-xs font-mono font-bold rounded-lg border-border"
                  />
                  <span className="text-muted-foreground/60 self-center">-</span>
                  <Input 
                    type="number"
                    min="1"
                    max="100"
                    value={pointMax}
                    onChange={(e) => setPointMax(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-8 text-center text-xs font-mono font-bold rounded-lg border-border"
                  />
                </div>
              </div>

              {/* Filter and Random buttons */}
              <div className="grid grid-cols-2 gap-2 border-t border-border/40 pt-4">
                <Button 
                  onClick={() => toast.success("Шүүлтүүр идэвхтэй хэрэгжиж байна.")}
                  className="h-8.5 text-xs font-bold rounded-xl gradient-brand text-white border-0 shadow-md shadow-brand-cyan/20 hover:opacity-95"
                >
                  Хайх (Go)
                </Button>
                <Button 
                  variant="outline"
                  onClick={handleRandomProblem}
                  className="h-8.5 text-xs font-bold rounded-xl bg-secondary/85 hover:bg-secondary border-border"
                >
                  Санамсаргүй (Random)
                </Button>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
