"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Editor from "@monaco-editor/react";
import {
  ChevronLeft, Play, Send, Copy, Check, FileDown, FileText,
  HelpCircle, Clock, Database, Terminal, CheckCircle2,
  XCircle, AlertTriangle, Loader2, Sparkles, RefreshCw,
  BookOpen, Bot, Lightbulb, ShieldAlert, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { PdfViewerModal } from "@/components/pdf-viewer-modal";
import { TestcaseDiffDebugger } from "@/components/testcase-diff-debugger";
import { useTheme } from "next-themes";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { problemApi, type Submission } from "@/lib/api/problems";
import { aiTutorApi } from "@/lib/api/ai-tutor";
import { useWebsocket } from "@/hooks/use-websocket";

const DEFAULT_CODE: Record<string, string> = {
  cpp: `#include <iostream>
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
  python: `import sys

def solve():
    lines = sys.stdin.read().split()
    if not lines:
        return
    a, b = map(int, lines[:2])
    print(a + b)

if __name__ == '__main__':
    solve()
`,
  java: `import java.util.Scanner;

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
};

function judgeResultFromSubmission(submission: Submission) {
  return {
    status: submission.status,
    time: `${submission.time_ms}ms`,
    memory: `${submission.memory_kb}KB`,
    score: submission.score,
    testcases: submission.judge_results.map((result) => ({ id: result.id, status: result.status, time: `${result.time_ms}ms`, memory: `${result.memory_kb}KB` })),
  };
}

export default function ProblemDetailPage() {
  const params = useParams();
  const code = (params?.code as string) || "1001";
  const { resolvedTheme } = useTheme();
  const queryClient = useQueryClient();

  const [language, setLanguage] = useState<string>("cpp");
  const [sourceCode, setSourceCode] = useState<string>(DEFAULT_CODE["cpp"]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Modals & Drawers
  const [aiTutorOpen, setAiTutorOpen] = useState<boolean>(false);
  const [selectedHintLevel, setSelectedHintLevel] = useState<number>(1);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  // Judge execution states
  const [consoleOpen, setConsoleOpen] = useState<boolean>(false);
  const [judgeResult, setJudgeResult] = useState<{
    status: string | null;
    time: string;
    memory: string;
    score: number;
    testcases: Array<{ id: number; status: string; time: string; memory: string }>;
  } | null>(null);
  const [submissionId, setSubmissionId] = useState<number | null>(null);
  const { data: problem } = useQuery({ queryKey: ["problem", code], queryFn: () => problemApi.get(code) });
  const { data: mySubmissions = [] } = useQuery({ queryKey: ["submissions", "mine", code], queryFn: () => problemApi.mySubmissions(code) });
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
        void queryClient.invalidateQueries({ queryKey: ["submissions", "mine", code] });
        void queryClient.invalidateQueries({ queryKey: ["progress", "me"] });
        void queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      }
    }, 0);
    return () => window.clearTimeout(update);
  }, [polledSubmission, code, queryClient]);

  useWebsocket(submissionId ? `submissions/${submissionId}` : null, (event) => {
    const status = String(event.status ?? "RUNNING");
    setJudgeResult({
      status,
      time: `${event.time_ms ?? 0}ms`, memory: `${event.memory_kb ?? 0}KB`, score: Number(event.score ?? 0),
      testcases: Array.isArray(event.judge_results) ? event.judge_results as Array<{ id: number; status: string; time: string; memory: string }> : [],
    });
    if (!["PENDING", "RUNNING", "CONNECTED"].includes(status)) {
      setIsSubmitting(false);
      setSubmissionId(null);
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

  const handleRunSample = () => {
    setConsoleOpen(true);
    setJudgeResult({ status: "RUNNING", time: "...", memory: "...", score: 0, testcases: [] });
    setTimeout(() => {
      setJudgeResult({
        status: "AC",
        time: "12ms",
        memory: "2.4MB",
        score: 100,
        testcases: [
          { id: 1, status: "AC", time: "4ms", memory: "1.8MB" },
          { id: 2, status: "AC", time: "8ms", memory: "2.4MB" },
        ],
      });
      toast.success("Жишээ тестүүд амжилттай давлаа!");
    }, 1200);
  };

  const handleSubmitCode = async () => {
    setIsSubmitting(true);
    setConsoleOpen(true);
    setJudgeResult({ status: "RUNNING", time: "...", memory: "...", score: 0, testcases: [] });
    try {
      const submission = await problemApi.submit(code, language === "python" ? "python3" : language, sourceCode);
      setSubmissionId(submission.submission_id);
    } catch {
      setIsSubmitting(false);
      toast.error("Илгээлт илгээхэд алдаа гарлаа.");
    }
  };

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
              <span className="text-[10px] text-muted-foreground hidden sm:inline">2024 Улсын Олимпиад</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <ThemeToggle />

          {/* Socratic AI Mentor Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAskAiTutor(1)}
            className="h-8 text-xs border-brand-violet/40 bg-brand-violet/10 text-brand-violet hover:bg-brand-violet/20 gap-1.5 font-bold"
          >
            <Bot className="w-3.5 h-3.5" /> AI Mentor (Hint)
          </Button>

          {/* Related Theory Link */}
          <Link href="/lessons/prime-numbers-math">
            <Button variant="outline" size="sm" className="h-8 text-xs border-border glass gap-1.5 font-medium">
              <BookOpen className="w-3.5 h-3.5 text-brand-cyan" /> Онол үзэх
            </Button>
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRunSample}
            disabled={isSubmitting}
            className="h-8 text-xs border-border glass hover:border-brand-cyan/40 gap-1.5 font-medium"
          >
            <Play className="w-3.5 h-3.5 text-brand-cyan" /> Жишээ
          </Button>

          <Button
            size="sm"
            onClick={handleSubmitCode}
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
        {/* Left Side: Statement & Testcases */}
        <div className="w-1/2 border-r border-border flex flex-col bg-card/30 overflow-y-auto scrollbar-thin">
          <Tabs defaultValue="statement" className="w-full">
            <div className="px-6 pt-4 border-b border-border flex items-center justify-between">
              <TabsList className="bg-secondary p-1 rounded-xl">
                <TabsTrigger value="statement" className="text-xs rounded-lg">Бодлогын өгүүлбэр</TabsTrigger>
                <TabsTrigger value="submissions" className="text-xs rounded-lg">Миний илгээлтүүд</TabsTrigger>
              </TabsList>

              <PdfViewerModal
                problemCode={code}
                problemTitle="A+B Нийлбэр"
                pdfUrl={problem?.statement_pdf_path ?? "/sample-problem.pdf"}
              />
            </div>

            <TabsContent value="statement" className="p-6 space-y-6 m-0">
              {/* Limits Cards */}
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

              {/* Rich Markdown & KaTeX Statement */}
              <div className="glass rounded-2xl p-6 border border-border">
                {!problem?.statement_markdown || 
                problem.statement_markdown.trim() === "" || 
                problem.statement_markdown.trim() === "<p></p>" || 
                problem.statement_markdown.trim() === "<p>Сэдвийн онолын хэсэг, жишээ тайлбар, зургуудыг энд оруулна уу...</p>" || 
                problem.statement_markdown.trim() === "<p>Бодлогын өгүүлбэр, оролт гаралтын хэлбэр, болон хязгаарлалтуудыг энд бичнэ үү...</p>" ? (
                  problem?.statement_pdf_path ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
                      <FileText className="w-12 h-12 text-brand-cyan" />
                      <div>
                        <h4 className="text-base font-bold text-foreground">Бодлогын өгүүлбэр PDF форматтай байна</h4>
                        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                          Уг бодлого нь онооны олимпиад форматтай тул өгүүлбэрийг PDF хэлбэрээр үзнэ үү.
                        </p>
                      </div>
                      <PdfViewerModal
                        problemCode={code}
                        problemTitle={problem.title}
                        pdfUrl={problem.statement_pdf_path}
                      />
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground italic text-center p-4">
                      Бодлогын өгүүлбэр оруулаагүй байна.
                    </div>
                  )
                ) : (
                  <MarkdownRenderer
                    content={problem?.statement_markdown ?? "Бодлогын өгүүлбэрийг ачаалж байна…"}
                  />
                )}
              </div>

              {/* Sample Testcases */}
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
                          className="h-6 text-[11px] px-2 text-muted-foreground gap-1"
                        >
                          {copiedIndex === idx ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          Хуулах
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-1">Оролт (stdin):</div>
                          <pre className="bg-secondary p-2.5 rounded-lg overflow-x-auto text-foreground">{sample.input_data}</pre>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground mb-1">Гаралт (stdout):</div>
                          <pre className="bg-secondary p-2.5 rounded-lg overflow-x-auto text-foreground">{sample.output_data}</pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="submissions" className="p-6">
              {mySubmissions.length === 0 ? <div className="text-xs text-muted-foreground text-center py-8">Энэ бодлого дээр таны илгээсэн код одоогоор алга.</div> : (
                <div className="space-y-2">{mySubmissions.map((submission) => <div key={submission.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-xs"><span className="font-mono">#{submission.id} · {submission.language}</span><span className="font-bold">{submission.status}</span><span>{submission.score} pt · {submission.time_ms}ms</span></div>)}</div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Side: Monaco Code Editor */}
        <div className="w-1/2 flex flex-col bg-[#1e1e1e]">
          {/* Editor Sub-Header */}
          <div className="h-10 bg-[#252526] border-b border-white/5 px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Хэл:</span>
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="bg-[#333333] text-xs text-white px-2.5 py-1 rounded-lg border border-white/10 outline-none cursor-pointer"
              >
                <option value="cpp">C++ (G++ 17)</option>
                <option value="python">Python 3.12</option>
                <option value="java">Java 21</option>
              </select>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSourceCode(DEFAULT_CODE[language] || "")}
              className="h-7 text-xs text-slate-400 hover:text-white gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Reset Code
            </Button>
          </div>

          {/* Monaco Editor */}
          <div className="flex-1 relative">
            <Editor
              height="100%"
              language={language === "cpp" ? "cpp" : language === "python" ? "python" : "java"}
              theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
              value={sourceCode}
              onChange={(value) => setSourceCode(value || "")}
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 12, bottom: 12 },
                fontFamily: "JetBrains Mono, monospace",
              }}
            />
          </div>

          {/* Bottom Execution Console Drawer */}
          {consoleOpen && (
            <div className="h-48 border-t border-border bg-card flex flex-col shrink-0 animate-slide-up">
              <div className="h-8 bg-secondary border-b border-border px-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <Terminal className="w-3.5 h-3.5 text-brand-cyan" />
                  Шалгалтын Дүн (Judge Output)
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConsoleOpen(false)}
                  className="h-6 text-[10px] text-muted-foreground"
                >
                  Хаах
                </Button>
              </div>

              <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-3">
                {judgeResult?.status === "RUNNING" && (
                  <div className="flex items-center gap-2 text-amber-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    DMOJ Sandbox-д шалгаж байна...
                  </div>
                )}

                {judgeResult?.status && judgeResult.status !== "RUNNING" && (
                  <div>
                    <div className="flex items-center gap-4 mb-3">
                      <Badge className={`${judgeResult.status === "AC" ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" : "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30"} text-xs px-3 py-1 font-bold`}>
                        {judgeResult.status === "AC" ? <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> : <XCircle className="w-3.5 h-3.5 mr-1" />} {judgeResult.status} ({judgeResult.score}/100)
                      </Badge>
                      <span className="text-muted-foreground">Хугацаа: <strong className="text-foreground">{judgeResult.time}</strong></span>
                      <span className="text-muted-foreground">Санах ой: <strong className="text-foreground">{judgeResult.memory}</strong></span>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      {judgeResult.testcases.map((tc) => (
                        <div key={tc.id} className="glass rounded-lg px-3 py-1.5 border border-border text-[11px] flex items-center gap-2">
                          <span className={tc.status === "AC" ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}>Test #{tc.id}: {tc.status}</span>
                          <span className="text-muted-foreground">{tc.time} · {tc.memory}</span>
                        </div>
                      ))}
                    </div>
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
    </div>
  );
}
