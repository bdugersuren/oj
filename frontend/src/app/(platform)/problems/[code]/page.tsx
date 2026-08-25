"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Editor from "@monaco-editor/react";
import {
  ChevronLeft, Play, Send, Copy, Check, FileDown, FileText,
  Clock, Database, Terminal, CheckCircle2, XCircle, Loader2,
  Sparkles, RefreshCw, BookOpen, Bot, Lightbulb, HelpCircle,
  Eye, Upload, Trophy, MessageSquare, Lock, SendHorizonal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { PdfViewerModal } from "@/components/pdf-viewer-modal";
import { useTheme } from "next-themes";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { problemApi, type Submission, type JudgeResult } from "@/lib/api/problems";
import { aiTutorApi } from "@/lib/api/ai-tutor";
import { useWebsocket } from "@/hooks/use-websocket";
import { VisualIde } from "@/components/visual-ide";

const DEFAULT_CODE: Record<string, string> = {
  "g++20": `#include <iostream>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    
    long long a, b;
    if (cin >> a >> b) {
        cout << a + b << "\\n";
    }
    return 0;
}`,
  "g++23": `#include <iostream>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    
    long long a, b;
    if (cin >> a >> b) {
        cout << a + b << "\\n";
    }
    return 0;
}`,
  "g++17": `#include <iostream>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    
    long long a, b;
    if (cin >> a >> b) {
        cout << a + b << "\\n";
    }
    return 0;
}`,
  "cpp": `#include <iostream>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    
    long long a, b;
    if (cin >> a >> b) {
        cout << a + b << "\\n";
    }
    return 0;
}`,
  "python3": `import sys

def solve():
    lines = sys.stdin.read().split()
    if not lines:
        return
    a, b = map(int, lines[:2])
    print(a + b)

if __name__ == '__main__':
    solve()
`,
  "pypy3": `import sys

def solve():
    lines = sys.stdin.read().split()
    if not lines:
        return
    a, b = map(int, lines[:2])
    print(a + b)

if __name__ == '__main__':
    solve()
`,
  "java": `import java.util.Scanner;

public class Solution {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextLong()) {
            long a = sc.nextLong();
            long b = sc.nextLong();
            System.out.println(a + b);
        }
    }
}`,
  "go": `package main

import (
	"fmt"
)

func main() {
	var a, b int64
	if _, err := fmt.Scan(&a, &b); err == nil {
		fmt.Println(a + b)
	}
}`,
  "cargo": `use std::io::{self, Read};

fn main() {
    let mut input = String::new();
    if io::stdin().read_to_string(&mut input).is_ok() {
        let parts: Vec<&str> = input.split_whitespace().collect();
        if parts.len() >= 2 {
            if let (Ok(a), Ok(b)) = (parts[0].parse::<i64>(), parts[1].parse::<i64>()) {
                println!("{}", a + b);
            }
        }
    }
}`,
  "node": `const fs = require('fs');

function main() {
    const input = fs.readFileSync('/dev/stdin', 'utf-8').trim();
    if (!input) return;
    const [a, b] = input.split(/\\s+/).map(Number);
    console.log(a + b);
}

main();
`
};

const getMonacoLanguage = (lang: string) => {
  if (lang.startsWith("g++") || lang === "cpp" || lang === "c++" || lang === "clang++") return "cpp";
  if (lang.startsWith("gcc") || lang === "c" || lang === "clang") return "cpp";
  if (lang.startsWith("python") || lang.startsWith("pypy")) return "python";
  if (lang.startsWith("java")) return "java";
  if (lang === "pascal" || lang === "fpc") return "pascal";
  if (lang === "go") return "go";
  if (lang === "cargo" || lang === "rust") return "rust";
  if (lang === "node") return "javascript";
  if (lang === "mono-csc") return "csharp";
  return "cpp";
};

const getLanguageLabel = (lang: string) => {
  const labels: Record<string, string> = {
    "g++20": "C++20",
    "g++23": "C++23",
    "g++17": "C++17",
    "g++14": "C++14",
    "g++11": "C++11",
    "cpp": "C++17",
    "c++": "C++17",
    "clang++": "C++ (Clang)",
    "python3": "Python 3",
    "pypy3": "PyPy 3",
    "java": "Java",
    "pascal": "Pascal",
    "fpc": "Pascal",
    "go": "Go",
    "cargo": "Rust",
    "node": "Node.js",
    "mono-csc": "C#",
  };
  return labels[lang] || lang.toUpperCase();
};


function judgeResultFromSubmission(submission: Submission) {
  return {
    status: submission.status,
    time: `${submission.time_ms}ms`,
    memory: `${submission.memory_kb}KB`,
    score: submission.score,
    testcases: submission.judge_results.map((result) => ({ 
      id: result.id,
      testcase_id: result.testcase_id, 
      status: result.status, 
      time: `${result.time_ms}ms`, 
      memory: `${result.memory_kb}KB`,
      actual_output: result.actual_output,
      output_log: result.output_log
    })),
  };
}

// Sub-component for submission expansion details
function SubmissionDetailsRow({ submissionId }: { submissionId: number }) {
  const { data: sub, isLoading } = useQuery({
    queryKey: ["submission-detail", submissionId],
    queryFn: () => problemApi.submission(submissionId),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center p-6"><Loader2 className="w-4 h-4 animate-spin text-brand-cyan" /></div>;
  }

  if (!sub) return <div className="text-rose-500 text-xs p-2">Мэдээлэл олдсонгүй.</div>;

  const statusIcons: Record<string, React.ReactNode> = {
    "AC": <span className="text-emerald-500 font-bold">✔</span>,
    "WA": <span className="text-rose-500 font-bold">✘</span>,
    "TLE": <span className="text-amber-500 font-bold">✘</span>,
    "MLE": <span className="text-amber-500 font-bold">✘</span>,
    "RTE": <span className="text-rose-500 font-bold">✘</span>,
    "CE": <span className="text-blue-500 font-bold">⚠</span>,
    "SKIPPED": <span className="text-muted-foreground/60 font-bold">—</span>,
    "PENDING": <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />,
    "RUNNING": <Loader2 className="w-3 h-3 animate-spin text-brand-cyan" />
  };

  const statusColors: Record<string, string> = {
    "AC": "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    "WA": "text-rose-500 bg-rose-500/10 border-rose-500/20",
    "TLE": "text-amber-500 bg-amber-500/10 border-amber-500/20",
    "MLE": "text-amber-500 bg-amber-500/10 border-amber-500/20",
    "RTE": "text-rose-500 bg-rose-500/10 border-rose-500/20",
    "CE": "text-blue-500 bg-blue-500/10 border-blue-500/20",
    "SKIPPED": "text-muted-foreground bg-secondary/30 border-border/30 opacity-60",
    "PENDING": "text-muted-foreground bg-secondary/50 border-border/30",
    "RUNNING": "text-brand-cyan bg-brand-cyan/10 border-brand-cyan/20 animate-pulse"
  };

  return (
    <div className="mt-3 p-5 bg-secondary/25 rounded-2xl border border-border/40 space-y-4 font-mono text-[10px] animate-fade-in select-text">
      
      {/* Batched Summary Icons at Top (like DMOJ ✔ ✔ ✘ ✘) */}
      {sub.batches && sub.batches.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 p-3 bg-secondary/40 rounded-xl border border-border/25">
          <span className="font-bold text-[9px] uppercase tracking-wider text-muted-foreground mr-2">Багцууд:</span>
          {sub.batches.map((batch) => (
            <div 
              key={batch.batch_index} 
              className={`flex items-center justify-center w-6 h-6 rounded-lg border text-xs font-bold ${
                batch.status === "AC" 
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" 
                  : batch.status === "SKIPPED" 
                    ? "bg-secondary/40 border-border/40 text-muted-foreground/60"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-500"
              }`}
              title={`Batch #${batch.batch_index}: ${batch.status} (${batch.points}/${batch.total_points} pt)`}
            >
              {batch.status === "AC" ? "✔" : batch.status === "SKIPPED" ? "—" : "✘"}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-muted-foreground border-b border-border/30 pb-2">
        <span className="font-bold text-[9px] uppercase tracking-wider">Тестүүдийн Дэлгэрэнгүй</span>
        <span>
          {sub.is_batched 
            ? `${sub.batches?.length ?? 0} багц (Нийт: ${sub.batches?.reduce((acc, b) => acc + b.cases.length, 0) ?? 0} кэйс)`
            : `Нийт: ${sub.judge_results.length} кэйс`
          }
        </span>
      </div>

      {sub.batches && sub.batches.length > 0 ? (
        <div className="space-y-4">
          {sub.batches.map((batch) => (
            <div 
              key={batch.batch_index} 
              className={`p-4 rounded-2xl border bg-card/25 transition-all duration-300 ${
                batch.status === "AC" 
                  ? "border-emerald-500/15 hover:border-emerald-500/30" 
                  : batch.status === "SKIPPED"
                    ? "border-border/30 opacity-75"
                    : "border-rose-500/15 hover:border-rose-500/30"
              }`}
            >
              {/* Batch Header (e.g. Batch #1 (10/10 pt) [AC]) */}
              <div className="flex items-center justify-between border-b border-border/20 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-foreground">Багц #{batch.batch_index}</span>
                  <Badge 
                    variant="outline" 
                    className={`${statusColors[batch.status] || "text-muted-foreground bg-secondary"} font-bold text-[9px] px-1.5 py-0 rounded`}
                  >
                    {batch.status}
                  </Badge>
                </div>
                <div className="text-xs font-bold text-foreground">
                  Оноо: <span className={batch.status === "AC" ? "text-emerald-500" : "text-rose-500"}>{batch.points}</span> / {batch.total_points} pt
                </div>
              </div>

              {/* Batch Child Cases */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {batch.cases.map((tc, tcIdx) => (
                  <div 
                    key={tcIdx} 
                    className={`p-2.5 rounded-xl border flex flex-col gap-1.5 transition-colors ${
                      tc.status === "AC" 
                        ? "bg-emerald-500/[0.02] border-emerald-500/10" 
                        : tc.status === "SKIPPED" 
                          ? "bg-secondary/10 border-border/20 opacity-60"
                          : "bg-rose-500/[0.02] border-rose-500/10"
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">Кэйс #{tcIdx + 1}</span>
                        {tc.sample && (
                          <Badge variant="outline" className="text-[8px] px-1 py-0 border-brand-cyan/30 text-brand-cyan bg-brand-cyan/5">
                            Жишээ
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[11px]">
                        {statusIcons[tc.status]}
                        <span className={tc.status === "AC" ? "text-emerald-500" : tc.status === "SKIPPED" ? "text-muted-foreground/60" : "text-rose-500"}>
                          {tc.status}
                        </span>
                      </div>
                    </div>

                    {tc.status !== "SKIPPED" && tc.status !== "PENDING" && tc.status !== "RUNNING" ? (
                      <>
                        <div className="text-[9px] text-muted-foreground flex justify-between">
                          <span>Хугацаа: {tc.time_ms}ms</span>
                          <span>Санах ой: {tc.memory_kb >= 1024 ? `${(tc.memory_kb / 1024).toFixed(1)}MB` : `${tc.memory_kb}KB`}</span>
                        </div>
                        {tc.output_log && (
                          <div className="text-[8px] text-amber-500/80 max-h-12 overflow-y-auto whitespace-pre-wrap leading-tight mt-1 bg-secondary/40 p-1.5 rounded-lg">
                            Checker: {tc.output_log}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-[9px] text-muted-foreground italic">
                        {tc.status === "PENDING" ? "Хүлээгдэж буй..." : tc.status === "RUNNING" ? "Ажиллаж буй..." : "Ажиллуулаагүй (Алгассан)"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {sub.judge_results.map((jr) => (
            <div key={jr.id} className="p-2.5 rounded-xl bg-card/45 border border-border/30 flex flex-col gap-1.5">
              <div className="flex items-center justify-between font-bold text-xs">
                <span>Кэйс #{jr.testcase_id}</span>
                <span className={jr.status === "AC" ? "text-emerald-500" : "text-rose-500"}>{jr.status}</span>
              </div>
              <div className="text-[9px] text-muted-foreground flex justify-between">
                <span>Хугацаа: {jr.time_ms}ms</span>
                <span>Санах ой: {jr.memory_kb >= 1024 ? `${(jr.memory_kb / 1024).toFixed(1)}MB` : `${jr.memory_kb}KB`}</span>
              </div>
              {jr.output_log && (
                <div className="text-[8px] text-amber-500/80 max-h-12 overflow-y-auto whitespace-pre-wrap leading-tight mt-1 bg-secondary/40 p-1.5 rounded-lg">
                  Checker: {jr.output_log}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {sub.error_log && (
        <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/15 text-rose-500 text-[9px] whitespace-pre-wrap font-mono mt-2 leading-relaxed">
          <strong>Алдааны лог (CE/RTE):</strong><br />
          {sub.error_log}
        </div>
      )}
    </div>
  );
}

export default function ProblemDetailPage() {
  const params = useParams();
  const code = (params?.code as string) || "1001";
  const { resolvedTheme } = useTheme();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [language, setLanguage] = useState<string>("g++20");
  const [sourceCode, setSourceCode] = useState<string>(DEFAULT_CODE["g++20"]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Modals & Drawers
  const [aiTutorOpen, setAiTutorOpen] = useState<boolean>(false);
  const [selectedHintLevel, setSelectedHintLevel] = useState<number>(1);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  // Submissions state
  const [expandedSubId, setExpandedSubId] = useState<number | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<number | null>(null);
  const [showCodeModal, setShowCodeModal] = useState<boolean>(false);

  // Discussion state (mocked interactive list)
  const [comments, setComments] = useState([
    {
      id: 1,
      username: "Temuulen.B",
      role: "student",
      text: "Би O(N) хугацааны хүндрэлтэй бодсон боловч TLE аваад байна. Оролтын утга хэтэрхий том байгаа юу?",
      date: "3 цагийн өмнө",
      replies: [
        {
          id: 11,
          username: "Saruul.E (Багш)",
          role: "teacher",
          text: "C++ хэрэглэж байгаа бол оролт/гаралтыг хурдасгах Fast I/O ашиглаж үзсэн үү? `cin.tie(NULL)` мөрүүд нэмбэл TLE алга болох магадлалтай.",
          date: "2 цагийн өмнө"
        }
      ]
    },
    {
      id: 2,
      username: "Munkh-Orgil.D",
      role: "student",
      text: "Маш сонирхолтой бодлого байна. Улаанбаатар хотын олимпиадын II давааны бодлоготой төстэй санагдлаа.",
      date: "1 өдрийн өмнө",
      replies: []
    }
  ]);
  const [newCommentText, setNewCommentText] = useState("");

  // Judge execution states
  const [consoleOpen, setConsoleOpen] = useState<boolean>(false);
  const [selectedTestCaseId, setSelectedTestCaseId] = useState<number | null>(null);
  const [judgeResult, setJudgeResult] = useState<{
    status: string | null;
    time: string;
    memory: string;
    score: number;
    testcases: Array<{ id: number; testcase_id: number; status: string; time: string; memory: string; actual_output?: string | null; output_log?: string | null }>;
  } | null>(null);
  const [submissionId, setSubmissionId] = useState<number | null>(null);
  
  // Queries
  const { data: problem } = useQuery({ queryKey: ["problem", code], queryFn: () => problemApi.get(code) });
  const { data: mySubmissions = [], refetch: refetchMySubmissions } = useQuery({ queryKey: ["submissions", "mine", code], queryFn: () => problemApi.mySubmissions(code) });
  
  const { data: leaderboardData = [] } = useQuery({ 
    queryKey: ["problem-leaderboard", code], 
    queryFn: () => problemApi.leaderboard(code),
    enabled: !!code 
  });

  // Query: Get active selected submission details for the modal
  const { data: activeSubDetails, isLoading: subDetailsLoading } = useQuery({
    queryKey: ["submission-detail", selectedSubId],
    queryFn: () => problemApi.submission(selectedSubId!),
    enabled: selectedSubId !== null && showCodeModal,
  });

  const { data: polledSubmission } = useQuery({
    queryKey: ["submission", submissionId],
    queryFn: () => problemApi.submission(submissionId!),
    enabled: submissionId !== null,
    refetchInterval: (query) => query.state.data?.is_pending ? 1500 : false,
  });

  useEffect(() => {
    if (!polledSubmission) return;
    const update = window.setTimeout(() => {
      setJudgeResult(judgeResultFromSubmission(polledSubmission));
      if (!polledSubmission.is_pending) {
        setIsSubmitting(false);
        setSubmissionId(null);
        void refetchMySubmissions();
        void queryClient.invalidateQueries({ queryKey: ["submissions", "mine", code] });
        void queryClient.invalidateQueries({ queryKey: ["progress", "me"] });
        void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      }
    }, 0);
    return () => window.clearTimeout(update);
  }, [polledSubmission, code, queryClient, refetchMySubmissions]);

  useWebsocket(submissionId ? `submissions/${submissionId}` : null, (event) => {
    const status = String(event.status ?? "RUNNING");
    const tcs = Array.isArray(event.judge_results)
      ? event.judge_results.map((r: any) => ({
          id: r.id,
          testcase_id: r.testcase_id,
          status: r.status,
          time: `${r.time_ms ?? 0}ms`,
          memory: `${r.memory_kb ?? 0}KB`,
          actual_output: r.actual_output,
          output_log: r.output_log
        }))
      : [];
    setJudgeResult({
      status,
      time: `${event.time_ms ?? 0}ms`,
      memory: `${event.memory_kb ?? 0}KB`,
      score: Number(event.score ?? 0),
      testcases: tcs,
    });
    if (!["PENDING", "RUNNING", "CONNECTED"].includes(status)) {
      setIsSubmitting(false);
      setSubmissionId(null);
      void refetchMySubmissions();
      void queryClient.invalidateQueries({ queryKey: ["submissions", "mine", code] });
      void queryClient.invalidateQueries({ queryKey: ["progress", "me"] });
      void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      toast.success(`Шүүлт дууслаа: ${status}`);
    }
  });

  const handleCopySample = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    toast.success("Оролтын өгөгдөл хуулагдлаа!");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    setSourceCode(DEFAULT_CODE[newLang] || "");
  };

  // Upload/Attach Code File
  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const ext = file.name.split('.').pop()?.toLowerCase();
    const extToLang: Record<string, string> = {
      cpp: "g++20",
      cc: "g++20",
      cxx: "g++20",
      py: "python3",
      java: "java",
      go: "go",
      rs: "cargo",
      js: "node",
      pas: "pascal",
      cs: "mono-csc",
    };
    if (extToLang[ext || ""]) {
      setLanguage(extToLang[ext || ""]);
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setSourceCode(content);
        toast.success(`"${file.name}" бодолтыг хавсарган ачааллаа.`);
      }
    };
    reader.onerror = () => {
      toast.error("Файлыг уншихад алдаа гарлаа.");
    };
    reader.readAsText(file);
  };

  const handleAskAiTutor = async (level: number) => {
    setSelectedHintLevel(level);
    setAiLoading(true);
    setAiTutorOpen(true);

    try {
      const response = await aiTutorApi.ask({
        problem_code: code,
        current_code: sourceCode,
        student_question: "Энэ бодлогыг зөв шийдэхийн тулд дараагийн ямар алхмыг хийх вэ?",
        hint_level: level,
      });
      setAiMessage(`${response.hint_title}\n\n${response.guidance_message}`);
      toast.success(`${level}-р түвшний hint нээгдлээ${response.xp_penalty ? ` (-${response.xp_penalty} XP)` : ""}.`);
    } catch {
      toast.error("AI зөвлөгөө авахад алдаа гарлаа.");
    } finally {
      setAiLoading(false);
    }
  };

  // Sample runs use the same isolated asynchronous judge pipeline as normal
  // submissions. The submission is flagged so only public sample cases run.
  const handleRunSample = async () => {
    setIsSubmitting(true);
    setConsoleOpen(true);
    setSelectedTestCaseId(null);
    setJudgeResult({ status: "RUNNING", time: "...", memory: "...", score: 0, testcases: [] });
    try {
      const submission = await problemApi.submit(code, language, sourceCode, true);
      setSubmissionId(submission.submission_id);
    } catch {
      setIsSubmitting(false);
      toast.error("Жишээ тест ажиллуулахад алдаа гарлаа.");
      setJudgeResult(null);
    }
  };

  const handleSubmitCode = async (overrideLang?: string, overrideSource?: string) => {
    setIsSubmitting(true);
    setConsoleOpen(true);
    setSelectedTestCaseId(null);
    setJudgeResult({ status: "RUNNING", time: "...", memory: "...", score: 0, testcases: [] });
    try {
      const finalLang = overrideLang || language;
      const finalSource = overrideSource || sourceCode;
      const submission = await problemApi.submit(code, finalLang, finalSource);
      setSubmissionId(submission.submission_id);
    } catch {
      setIsSubmitting(false);
      toast.error("Илгээлт илгээхэд алдаа гарлаа.");
    }
  };

  const handleReloadCode = async (subId: number) => {
    try {
      const details = await problemApi.submission(subId);
      if (details && details.source_code) {
        setSourceCode(details.source_code);
        const langMap: Record<string, string> = {
          "g++20": "g++20",
          "g++23": "g++23",
          "g++17": "g++17",
          "g++14": "g++14",
          "g++11": "g++11",
          "cpp": "g++20",
          "c++": "g++20",
          "clang++": "g++20",
          "python3": "python3",
          "pypy3": "pypy3",
          "python": "python3",
          "pypy": "pypy3",
          "java": "java",
          "java8": "java",
          "go": "go",
          "cargo": "cargo",
          "node": "node",
          "pascal": "pascal",
          "fpc": "pascal",
          "mono-csc": "mono-csc"
        };
        setLanguage(langMap[details.language] || "g++20");
        toast.success("Кодыг редакторт сэргээн хууллаа!");
      }
    } catch {
      toast.error("Код сэргээхэд алдаа гарлаа.");
    }
  };

  const handleDownloadCode = async (subId: number) => {
    try {
      const details = await problemApi.submission(subId);
      if (details && details.source_code) {
        const extMap: Record<string, string> = {
          "g++20": "cpp",
          "g++23": "cpp",
          "g++17": "cpp",
          "g++14": "cpp",
          "g++11": "cpp",
          "cpp": "cpp",
          "c++": "cpp",
          "clang++": "cpp",
          "python3": "py",
          "pypy3": "py",
          "python": "py",
          "pypy": "py",
          "java": "java",
          "java8": "java",
          "go": "go",
          "cargo": "rs",
          "node": "js",
          "pascal": "pas",
          "fpc": "pas",
          "mono-csc": "cs"
        };
        const ext = extMap[details.language] || "txt";
        const blob = new Blob([details.source_code], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `solution_${code}_${subId}.${ext}`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success("Код файлыг амжилттай татлаа.");
      }
    } catch {
      toast.error("Код татахад алдаа гарлаа.");
    }
  };

  const handleAddComment = () => {
    if (!newCommentText.trim()) return;
    setComments([
      ...comments,
      {
        id: Date.now(),
        username: "Та (Сурагч)",
        role: "student",
        text: newCommentText,
        date: "Яг одоо",
        replies: []
      }
    ]);
    setNewCommentText("");
    toast.success("Хэлэлцүүлэгт сэтгэгдэл нэмэгдлээ.");
  };

  const getSampleForTestCase = (tc_id: number, idx: number) => {
    if (!problem?.sample_testcases) return null;
    let match = problem.sample_testcases.find(s => s.id === tc_id);
    if (match) return match;
    match = problem.sample_testcases.find(s => s.order === tc_id);
    if (match) return match;
    if (idx < problem.sample_testcases.length) {
      return problem.sample_testcases[idx];
    }
    return null;
  };

  const renderOutputDiff = (expected: string, actual: string) => {
    const expLines = expected.trim().split("\n");
    const actLines = actual.trim().split("\n");
    const maxLines = Math.max(expLines.length, actLines.length);
    
    return (
      <div className="space-y-1 font-mono text-[10px] mt-1.5 border border-border rounded-xl overflow-hidden shadow-inner animate-fade-in">
        <div className="grid grid-cols-2 bg-secondary/80 border-b border-border text-[9px] font-bold text-muted-foreground p-2 uppercase tracking-wider">
          <div>Хүлээгдэж буй (Expected stdout)</div>
          <div>Таны кодны гаралт (Actual stdout)</div>
        </div>
        <div className="divide-y divide-border/20 bg-card">
          {Array.from({ length: maxLines }).map((_, i) => {
            const exp = expLines[i] !== undefined ? expLines[i] : "";
            const act = actLines[i] !== undefined ? actLines[i] : "";
            const isMatch = exp.trim() === act.trim();
            return (
              <div key={i} className="grid grid-cols-2 text-[10px] divide-x divide-border/30">
                <div className={`p-2 overflow-x-auto whitespace-pre ${isMatch ? "text-muted-foreground/80 bg-emerald-500/5" : "text-emerald-500 bg-emerald-500/10 font-black"}`}>
                  {exp || <span className="opacity-30 italic">(empty)</span>}
                </div>
                <div className={`p-2 overflow-x-auto whitespace-pre ${isMatch ? "text-slate-300 bg-emerald-500/5" : "text-rose-500 bg-rose-500/10 font-black"}`}>
                  {act || <span className="opacity-30 italic">(empty)</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Editorial access condition: solved with AC status
  const isAc = mySubmissions.some((s) => s.status === "AC");

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* ── Top Bar ── */}
      <header className="h-14 glass border-b border-border px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/problems">
            <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-brand-cyan font-bold">#{code}</span>
              <h1 className="text-sm font-black">{problem?.title ?? "Бодлого ачаалж байна…"}</h1>
              <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 bg-amber-500/10">
                {problem?.difficulty ?? "..."}
              </Badge>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <ThemeToggle />

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAskAiTutor(1)}
            className="h-8 text-xs border-brand-violet/40 bg-brand-violet/10 text-brand-violet hover:bg-brand-violet/20 gap-1.5 font-bold"
          >
            <Bot className="w-3.5 h-3.5" /> AI Mentor
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRunSample}
            disabled={isSubmitting}
            className="h-8 text-xs border-border glass hover:border-brand-cyan/40 gap-1.5 font-medium"
          >
            <Play className="w-3.5 h-3.5 text-brand-cyan" /> Жишээ ажиллуулах
          </Button>

          <Button
            size="sm"
            onClick={() => handleSubmitCode()}
            disabled={isSubmitting}
            className="h-8 text-xs gradient-brand text-white border-0 hover:opacity-90 shadow-md shadow-brand-cyan/20 gap-1.5 font-bold"
          >
            {isSubmitting ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Шалгаж байна...</>
            ) : (
              <><Send className="w-3.5 h-3.5" /> Илгээх</>
            )}
          </Button>
        </div>
      </header>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Side: Statement, Submissions, Leaderboard, Discussion, Editorial */}
        <div className="w-1/2 border-r border-border flex flex-col bg-card/30 overflow-y-auto scrollbar-thin">
          <Tabs defaultValue="statement" className="w-full">
            <div className="px-5 pt-3 border-b border-border flex items-center justify-between shrink-0 bg-secondary/15">
              <TabsList className="bg-secondary p-1 rounded-xl gap-0.5">
                <TabsTrigger value="statement" className="text-[11px] px-2.5 py-1 rounded-lg">Бодлого</TabsTrigger>
                <TabsTrigger value="submissions" className="text-[11px] px-2.5 py-1 rounded-lg">Илгээлтүүд</TabsTrigger>
                <TabsTrigger value="leaderboard" className="text-[11px] px-2.5 py-1 rounded-lg gap-1">
                  <Trophy className="w-3 h-3 text-amber-500" /> Тэргүүлэгчид
                </TabsTrigger>
                <TabsTrigger value="discussion" className="text-[11px] px-2.5 py-1 rounded-lg gap-1">
                  <MessageSquare className="w-3 h-3 text-brand-cyan" /> Хэлэлцүүлэг
                </TabsTrigger>
                <TabsTrigger value="editorial" className="text-[11px] px-2.5 py-1 rounded-lg gap-1">
                  <BookOpen className="w-3 h-3 text-brand-violet" /> Бодолтын заавар
                </TabsTrigger>
              </TabsList>

              <PdfViewerModal
                problemCode={code}
                problemTitle={problem?.title ?? "Бодлого"}
                pdfUrl={problem?.statement_pdf_path ?? "/sample-problem.pdf"}
              />
            </div>

            {/* Tab: Problem Statement */}
            <TabsContent value="statement" className="p-6 space-y-6 m-0">
              <div className="grid grid-cols-3 gap-3">
                <div className="glass rounded-xl p-3 border border-border flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-brand-cyan" />
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-semibold">Цагийн хязгаар</div>
                    <div className="text-xs font-bold font-mono">{problem?.time_limit ?? "…"} сек</div>
                  </div>
                </div>
                <div className="glass rounded-xl p-3 border border-border flex items-center gap-2.5">
                  <Database className="w-4 h-4 text-brand-violet" />
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-semibold">Санах ой</div>
                    <div className="text-xs font-bold font-mono">{problem?.memory_limit ?? "…"} MB</div>
                  </div>
                </div>
                <div className="glass rounded-xl p-3 border border-border flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-brand-amber" />
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase font-semibold">Оноо / XP</div>
                    <div className="text-xs font-bold font-mono">{problem?.points ?? "…"} pt · +{problem?.xp_reward ?? "…"} XP</div>
                  </div>
                </div>
              </div>

              <div className="glass rounded-2xl p-6 border border-border bg-card/45">
                {!problem?.statement_markdown || 
                problem.statement_markdown.trim() === "" || 
                problem.statement_markdown.trim() === "<p></p>" ? (
                  problem?.statement_pdf_path ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
                      <FileText className="w-12 h-12 text-brand-cyan" />
                      <div>
                        <h4 className="text-base font-bold text-foreground">Бодлогын өгүүлбэр PDF форматтай байна</h4>
                        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                          Уг бодлогын дэлгэрэнгүй өгүүлбэрийг хажуугийн PDF харагчаар үзнэ үү.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground italic text-center p-4">
                      Бодлогын өгүүлбэр оруулаагүй байна.
                    </div>
                  )
                ) : (
                  <MarkdownRenderer
                    content={problem?.statement_markdown ?? "Бодлогын өгүүлбэрийг ачаалж байна…"}
                    problemCode={code}
                    isDraft={false}
                  />
                )}
              </div>

              {/* Sample test cases list */}
              <div className="space-y-4 pt-2">
                <h3 className="font-bold text-base text-foreground">Жишээ Тестүүд</h3>
                <div className="space-y-3">
                  {(problem?.sample_testcases ?? []).map((sample, idx) => (
                    <div key={idx} className="glass rounded-xl p-4 border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-brand-cyan">Жишээ {idx + 1}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopySample(sample.input_data, idx)}
                          className="h-6 text-[11px] px-2 text-muted-foreground gap-1 hover:bg-secondary/60"
                        >
                          {copiedIndex === idx ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          Хуулах
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-1">Оролт (stdin):</div>
                          <pre className="bg-secondary/70 p-2.5 rounded-lg overflow-x-auto text-foreground select-text">{sample.input_data}</pre>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-1">Гаралт (stdout):</div>
                          <pre className="bg-secondary/70 p-2.5 rounded-lg overflow-x-auto text-foreground select-text">{sample.output_data}</pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Tab: Submissions list */}
            <TabsContent value="submissions" className="p-6 space-y-4 m-0">
              {mySubmissions.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-12 bg-secondary/15 rounded-2xl border border-dashed border-border/50">
                  Энэ бодлогын илгээсэн код байхгүй байна.
                </div>
              ) : (
                <div className="space-y-3">
                  {mySubmissions.map((submission) => {
                    const isExpanded = expandedSubId === submission.id;
                    const statusColors: Record<string, string> = {
                      "AC": "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
                      "WA": "text-rose-500 bg-rose-500/10 border-rose-500/20",
                      "TLE": "text-amber-500 bg-amber-500/10 border-amber-500/20",
                      "MLE": "text-amber-500 bg-amber-500/10 border-amber-500/20",
                      "RTE": "text-rose-500 bg-rose-500/10 border-rose-500/20",
                      "CE": "text-blue-500 bg-blue-500/10 border-blue-500/20",
                    };
                    
                    return (
                      <div 
                        key={submission.id} 
                        className="glass border border-border/50 rounded-2xl p-4 transition-all duration-300 hover:border-brand-cyan/25"
                      >
                        <div className="flex items-center justify-between gap-4 flex-wrap text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-muted-foreground">#{submission.id}</span>
                            <Badge variant="outline" className={`${statusColors[submission.status] || "text-muted-foreground bg-secondary"} font-bold text-[10px]`}>
                              {submission.status}
                            </Badge>
                            <span className="font-mono text-[10px] text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-lg">
                              {getLanguageLabel(submission.language)}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 font-mono text-[11px]">
                            {/* Detailed score out of total */}
                            <span className="font-bold text-foreground">
                              {submission.score} / {problem?.points ?? 10} pt
                            </span>
                            <span className="text-muted-foreground">{submission.time_ms}ms</span>
                            <span className="text-muted-foreground">
                              {submission.memory_kb >= 1024 
                                ? `${(submission.memory_kb / 1024).toFixed(1)} MB` 
                                : `${submission.memory_kb} KB`
                              }
                            </span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center mt-3 border-t border-border/30 pt-3 text-[10px]">
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedSubId(submission.id);
                                setShowCodeModal(true);
                              }}
                              className="h-6 text-[10px] px-2 rounded-lg text-brand-cyan hover:bg-brand-cyan/10 gap-1"
                            >
                              <Eye className="w-3 h-3" /> Код харах
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownloadCode(submission.id)}
                              className="h-6 text-[10px] px-2 rounded-lg hover:text-foreground gap-1"
                            >
                              <FileDown className="w-3 h-3" /> Татах
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReloadCode(submission.id)}
                              className="h-6 text-[10px] px-2 rounded-lg text-brand-violet hover:bg-brand-violet/10 gap-1"
                            >
                              <RefreshCw className="w-3 h-3" /> Сэргээх
                            </Button>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedSubId(isExpanded ? null : submission.id)}
                            className="h-6 text-[10px] px-2 rounded-lg hover:bg-secondary"
                          >
                            {isExpanded ? "Дэлгэрэнгүй хумих" : "Дэлгэрэнгүй үзэх"}
                          </Button>
                        </div>

                        {isExpanded && (
                          <SubmissionDetailsRow submissionId={submission.id} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Tab: Leaderboard */}
            <TabsContent value="leaderboard" className="p-6 space-y-4 m-0">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5 mb-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                Шилдэг бодолтууд (Leaderboard)
              </h3>
              
              {leaderboardData.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-12 bg-secondary/15 rounded-2xl border border-dashed border-border/50">
                  Энэ бодлогыг зөв бодсон хэрэглэгч хараахан алга байна.
                </div>
              ) : (
                <div className="glass-strong border border-border rounded-xl overflow-hidden text-xs">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2.5 font-bold text-muted-foreground bg-secondary/35 border-b border-border uppercase text-[9px] tracking-wider">
                    <div className="col-span-1">Байр</div>
                    <div className="col-span-4">Хэрэглэгч</div>
                    <div className="col-span-2 text-center">Хэл</div>
                    <div className="col-span-1 text-center">Оноо</div>
                    <div className="col-span-2 text-center">Хугацаа</div>
                    <div className="col-span-2 text-right">Санах ой</div>
                  </div>
                  <div className="divide-y divide-border/30">
                    {leaderboardData.map((item) => (
                      <div key={item.rank} className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-secondary/10">
                        <div className="col-span-1 font-black text-slate-400 font-mono text-center sm:text-left">
                          #{item.rank}
                        </div>
                        <div className="col-span-4 font-semibold text-foreground truncate">
                          {item.full_name || item.username}
                        </div>
                        <div className="col-span-2 text-center font-mono text-[10px] text-muted-foreground">
                          {getLanguageLabel(item.language)}
                        </div>
                        <div className="col-span-1 text-center font-mono font-bold text-emerald-500">
                          {item.score}
                        </div>
                        <div className="col-span-2 text-center font-mono text-[11px]">
                          {item.time_ms} ms
                        </div>
                        <div className="col-span-2 text-right font-mono text-[11px]">
                          {item.memory_kb >= 1024 ? `${(item.memory_kb / 1024).toFixed(1)} MB` : `${item.memory_kb} KB`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Tab: Discussion comment thread */}
            <TabsContent value="discussion" className="p-6 space-y-4 m-0">
              <div className="flex items-center gap-1.5 mb-2">
                <MessageSquare className="w-4 h-4 text-brand-cyan" />
                <h3 className="font-bold text-sm text-foreground">Асуулт хариулт & Хэлэлцүүлэг</h3>
              </div>

              {/* Add comment textarea */}
              <div className="glass rounded-xl p-3 border border-border bg-card/35 space-y-2.5">
                <textarea
                  placeholder="Сэтгэгдэл, асуулт бичих..."
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  className="w-full bg-[#1e1e1e] text-xs text-white p-2.5 rounded-lg border border-border/80 outline-none resize-none h-16 leading-relaxed"
                />
                <div className="flex justify-end">
                  <Button 
                    size="sm"
                    onClick={handleAddComment}
                    className="h-8 text-xs font-bold bg-brand-cyan hover:bg-brand-cyan/90 text-black gap-1 rounded-xl"
                  >
                    Бичих <SendHorizonal className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* Comments list */}
              <div className="space-y-4.5 pt-2">
                {comments.map((comment) => (
                  <div key={comment.id} className="glass border border-border/40 rounded-2xl p-4 bg-card/15 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-brand-cyan">{comment.username}</span>
                        <Badge variant="outline" className={`text-[9px] uppercase font-bold ${
                          comment.role === "teacher" ? "text-brand-violet border-brand-violet/20 bg-brand-violet/5" : "text-slate-400"
                        }`}>
                          {comment.role === "teacher" ? "Багш" : "Сурагч"}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{comment.date}</span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed font-sans">{comment.text}</p>

                    {/* Comment replies */}
                    {comment.replies.length > 0 && (
                      <div className="pl-4 border-l-2 border-brand-violet/30 space-y-3 mt-2">
                        {comment.replies.map((reply) => (
                          <div key={reply.id} className="p-3 rounded-xl bg-brand-violet/5 border border-brand-violet/10 space-y-1.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-brand-violet">{reply.username}</span>
                              </div>
                              <span className="text-muted-foreground">{reply.date}</span>
                            </div>
                            <p className="text-xs text-slate-300 font-sans leading-relaxed">{reply.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Tab: Editorial (locked until solved) */}
            <TabsContent value="editorial" className="p-6 space-y-4 m-0">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5 mb-2">
                <BookOpen className="w-4 h-4 text-brand-violet" />
                Бодолтын заавар (Editorial Tutorial)
              </h3>

              {isAc ? (
                <div className="glass-strong border border-brand-violet/20 bg-brand-violet/5 rounded-2xl p-5 space-y-4 animate-fade-in">
                  <div className="flex items-center gap-2 border-b border-border/40 pb-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <span className="font-black text-sm text-emerald-500 uppercase">Бодлого бодогдсон: Заавар нээлттэй байна</span>
                  </div>

                  <div className="space-y-3 text-xs leading-relaxed text-slate-300 font-sans">
                    <h4 className="font-bold text-foreground text-sm">Хамгийн оновчтой алгоритм (Математик шийдэл):</h4>
                    <p>
                      Энэ бодлогын хувьд өгөгдсөн хоёр тооны нийлбэрийг шууд олох бөгөөд оролт гаралтын хязгаарлалт нь маш том (тэрбум хүртэл) утга авах боломжтой.
                      Иймд 32-бит бүхэл тооны хязгаараас хэтрэх магадлалтай тул хувьсагчийг С++ хэл дээр `long long`, Java дээр `long` хэлбэрээр тодорхойлох нь зөв.
                    </p>
                    <p>
                      Хугацааны хүндрэл нь \(O(1)\), санах ойн хүндрэл нь \(O(1)\) байх бөгөөд C++ хэл дээр Fast I/O ашиглах нь тохиромжтой.
                    </p>
                    
                    <pre className="bg-secondary p-3 rounded-xl border border-border/40 font-mono text-[10px] text-brand-violet overflow-x-auto whitespace-pre leading-snug">
{`#include <iostream>
using namespace std;

int main() {
    // Fast Input/Output
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    
    long long a, b;
    if (cin >> a >> b) {
        cout << a + b << "\\n";
    }
    return 0;
}`}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-12 text-center border border-border border-dashed rounded-2xl bg-secondary/5 space-y-4 animate-fade-in">
                  <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-foreground">Бодолтын заавар цоожтой байна</h4>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">
                      Уг бодлогыг зөв бодож (AC статус авч) оноо авсны дараа алгоритмын оновчтой бодолтын заавар нээгдэх болно.
                    </p>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Side: Monaco Code Editor */}
        <div className="w-1/2 flex flex-col bg-[#1e1e1e] overflow-hidden relative">
          <VisualIde
            code={code}
            sourceCode={sourceCode}
            setSourceCode={setSourceCode}
            language={language}
            setLanguage={setLanguage}
            resolvedTheme={resolvedTheme || "dark"}
            isSubmitting={isSubmitting}
            onSubmit={(finalLang, finalSource) => handleSubmitCode(finalLang, finalSource)}
          />

          {/* Bottom Execution Console Drawer (Dynamically Resizes when Diff is Open) */}
          {consoleOpen && (
            <div className={`${selectedTestCaseId !== null ? "h-96" : "h-56"} border-t border-border bg-card flex flex-col shrink-0 transition-all duration-300 z-10`}>
              <div className="h-9 bg-secondary border-b border-border px-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <Terminal className="w-3.5 h-3.5 text-brand-cyan" />
                  Шалгалтын Дүн (Judge Output)
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setConsoleOpen(false);
                    setSelectedTestCaseId(null);
                  }}
                  className="h-6 text-[10px] text-muted-foreground hover:bg-secondary/65"
                >
                  Хаах
                </Button>
              </div>

              <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-4 scrollbar-thin">
                {judgeResult?.status === "RUNNING" && (
                  <div className="flex items-center gap-2 text-amber-500 py-6 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sandbox-д шалгаж байна...
                  </div>
                )}

                {judgeResult?.status && judgeResult.status !== "RUNNING" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4 mb-1">
                      <Badge className={`${judgeResult.status === "AC" ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" : "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30"} text-xs px-3 py-1 font-bold`}>
                        {judgeResult.status === "AC" ? <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> : <XCircle className="w-3.5 h-3.5 mr-1" />} {judgeResult.status} ({judgeResult.score}/100)
                      </Badge>
                      <span className="text-muted-foreground">Хугацаа: <strong className="text-foreground">{judgeResult.time}</strong></span>
                      <span className="text-muted-foreground">Санах ой: <strong className="text-foreground">{judgeResult.memory}</strong></span>
                    </div>

                    {/* Interactive clickable testcase cards */}
                    <div className="flex gap-2 flex-wrap">
                      {judgeResult.testcases.map((tc, idx) => {
                        const isSelected = selectedTestCaseId === tc.id;
                        return (
                          <button
                            key={tc.id}
                            onClick={() => setSelectedTestCaseId(selectedTestCaseId === tc.id ? null : tc.id)}
                            className={`glass rounded-xl px-3 py-1.5 border text-[10px] flex items-center gap-2 transition-all hover:bg-secondary/80 ${
                              isSelected 
                                ? "border-brand-cyan bg-brand-cyan/15 text-brand-cyan shadow-sm font-bold scale-[1.02]" 
                                : tc.status === "AC" 
                                  ? "border-emerald-500/20 text-emerald-500 bg-emerald-500/5" 
                                  : "border-rose-500/20 text-rose-500 bg-rose-500/5"
                            }`}
                          >
                            <span>Test #{idx + 1}: {tc.status}</span>
                            <span className="text-muted-foreground/70">{tc.time} · {tc.memory}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Selected test case details (stdin, expected, actual) */}
                    {selectedTestCaseId !== null && (() => {
                      const idx = judgeResult.testcases.findIndex(t => t.id === selectedTestCaseId);
                      const tc = judgeResult.testcases[idx];
                      if (!tc) return null;
                      
                      const sample = getSampleForTestCase(tc.testcase_id, idx);
                      
                      return (
                        <div className="mt-4 pt-3 border-t border-border/40 space-y-3.5 animate-fade-in">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-slate-400">Шалгалтын дэлгэрэнгүй (Test Case #{idx + 1}):</span>
                            {tc.status !== "AC" && tc.output_log && (
                              <span className="text-rose-400 font-medium">Checker: {tc.output_log}</span>
                            )}
                          </div>
                          
                          {sample ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-3 text-[10px]">
                                <div>
                                  <div className="text-[9px] text-muted-foreground mb-1 uppercase font-bold tracking-wider">Оролт (stdin):</div>
                                  <pre className="bg-secondary/65 p-2.5 rounded-lg overflow-x-auto text-slate-300 border border-border/30 max-h-20 select-text leading-tight">{sample.input_data}</pre>
                                </div>
                                <div>
                                  <div className="text-[9px] text-muted-foreground mb-1 uppercase font-bold tracking-wider">Зөв хариу (expected stdout):</div>
                                  <pre className="bg-secondary/65 p-2.5 rounded-lg overflow-x-auto text-emerald-400 border border-border/30 max-h-20 select-text leading-tight">{sample.output_data}</pre>
                                </div>
                              </div>
                              
                              <div>
                                <div className="text-[9px] text-muted-foreground mb-1 uppercase font-bold tracking-wider">Харьцуулалт (Diff Output):</div>
                                {tc.actual_output !== undefined && tc.actual_output !== null ? (
                                  renderOutputDiff(sample.output_data, tc.actual_output)
                                ) : (
                                  <div className="text-rose-400 italic text-[10px] bg-rose-500/5 p-3 rounded-xl border border-rose-500/15">
                                    Аюулгүй байдлын үүднээс нууц тестийн гаралтыг харах боломжгүй.
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-muted-foreground italic text-[10px] bg-secondary/30 p-3 rounded-xl border border-border/40">
                              Энэ нь систем дээрх нууц тест кэйс тул Оролт / Гаралтын дүн аюулгүй байдлын үүднээс хаалттай байна.
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Socratic AI Tutor Side Drawer ── */}
        {aiTutorOpen && (
          <div className="absolute right-0 top-0 bottom-0 w-96 glass-strong border-l border-border shadow-2xl z-30 flex flex-col animate-slide-left">
            <div className="p-4 border-b border-border flex items-center justify-between bg-card/80">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-brand-violet/20 flex items-center justify-center text-brand-violet">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-xs">AI Socratic Mentor</h3>
                  <p className="text-[10px] text-muted-foreground">Шат дараалсан ухаалаг чиглүүлэгч</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setAiTutorOpen(false)} className="h-6 w-6 p-0 text-muted-foreground">
                ✕
              </Button>
            </div>

            {/* Hint Tier Selector */}
            <div className="p-3 border-b border-border bg-secondary/50 space-y-1.5">
              <div className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-1">
                Сануулгын Шат Сонгох:
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { level: 1, name: "1. Концепци", cost: "0 XP" },
                  { level: 2, name: "2. Захын утга", cost: "-5 XP" },
                  { level: 3, name: "3. Псевдокод", cost: "-10 XP" },
                ].map((tier) => (
                  <button
                    key={tier.level}
                    onClick={() => handleAskAiTutor(tier.level)}
                    className={`p-2 rounded-xl text-left border text-[11px] font-semibold transition-all ${
                      selectedHintLevel === tier.level
                        ? "bg-brand-violet text-white border-brand-violet shadow-sm"
                        : "bg-card border-border hover:bg-secondary text-muted-foreground"
                    }`}
                  >
                    <div>{tier.name}</div>
                    <div className="text-[9px] opacity-80">{tier.cost}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Conversation Guidance Body */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs leading-relaxed">
              {aiLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-violet" />
                  Кодыг шинжилж, Socratic зөвлөгөө бэлдэж байна...
                </div>
              ) : (
                aiMessage && (
                  <div className="glass rounded-2xl p-4 border border-brand-violet/30 bg-brand-violet/5 space-y-3">
                    <p className="whitespace-pre-line text-foreground">{aiMessage}</p>
                  </div>
                )
              )}
            </div>

            <div className="p-3 border-t border-border bg-card/80 text-[10px] text-muted-foreground text-center">
              🛡️ AI багш хэзээ ч бэлэн код өгөхгүй бөгөөд зөвхөн логикийг олоход чиглүүлнэ.
            </div>
          </div>
        )}
      </div>

      {/* VIEW SUBMISSION CODE MODAL */}
      {showCodeModal && selectedSubId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background w-full max-w-3xl h-[70vh] rounded-3xl border border-border shadow-2xl flex flex-col overflow-hidden">
            <div className="h-14 border-b border-border px-6 flex items-center justify-between shrink-0 bg-card/45">
              <div className="flex items-center gap-2 font-black text-sm">
                <FileText className="w-5 h-5 text-brand-cyan" />
                <span>Илгээсэн код харах (Submission #{selectedSubId})</span>
              </div>
              <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl hover:bg-secondary" onClick={() => { setShowCodeModal(false); setSelectedSubId(null); }}>
                ✕
              </Button>
            </div>
            <div className="flex-1 relative bg-[#1e1e1e]">
              {subDetailsLoading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e1e]/80">
                  <Loader2 className="w-8 h-8 text-brand-cyan animate-spin" />
                </div>
              ) : (
                activeSubDetails && (
                  <Editor
                    height="100%"
                    language={getMonacoLanguage(activeSubDetails.language)}
                    theme="vs-dark"
                    value={activeSubDetails.source_code || ""}
                    options={{
                      readOnly: true,
                      fontSize: 13,
                      fontFamily: "var(--font-mono)",
                      minimap: { enabled: false },
                      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                      lineNumbersMinChars: 3,
                    }}
                  />
                )
              )}
            </div>
            <div className="h-14 border-t border-border px-6 flex items-center justify-between bg-card/25 shrink-0">
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => handleDownloadCode(selectedSubId)}
                  className="h-8 text-xs font-bold rounded-xl"
                >
                  <FileDown className="w-3.5 h-3.5 mr-1 text-brand-cyan" /> Татаж авах
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    handleReloadCode(selectedSubId);
                    setShowCodeModal(false);
                    setSelectedSubId(null);
                  }}
                  className="h-8 text-xs font-bold rounded-xl text-brand-cyan border-brand-cyan/20 bg-brand-cyan/5 hover:bg-brand-cyan/15 animate-pulse-slow"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> Редакторт хуулах
                </Button>
              </div>
              <Button onClick={() => { setShowCodeModal(false); setSelectedSubId(null); }} className="h-8 px-4 text-xs font-bold rounded-xl bg-secondary hover:bg-secondary/80">
                Хаах
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
