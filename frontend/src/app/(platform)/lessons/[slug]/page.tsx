"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  BookOpen, CheckCircle2, ChevronLeft, Code2, 
  HelpCircle, Play, Sparkles, Lock, Unlock, Check, AlertCircle 
} from "lucide-react";
import toast from "react-hot-toast";
import { lessonApi } from "@/lib/api/lessons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { ThemeToggle } from "@/components/theme-toggle";

interface GatedQuizCardProps {
  quiz: any;
  slug: string;
  isSolved: boolean;
  onSolved: () => void;
}

function GatedQuizCard({ quiz, slug, isSolved, onSolved }: GatedQuizCardProps) {
  const queryClient = useQueryClient();
  const [selectedSingle, setSelectedSingle] = useState<number | null>(null);
  const [selectedMultiple, setSelectedMultiple] = useState<number[]>([]);
  const [textAnswer, setTextAnswer] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [feedbackMsg, setFeedbackMsg] = useState("");

  const submitMutation = useMutation({
    mutationFn: (answer: any) => lessonApi.submitQuizIndividual(slug, quiz.id, answer),
    onSuccess: (res) => {
      if (res.success) {
        setStatus("success");
        setFeedbackMsg("Зөв хариуллаа, баяр хүргэе! 🌟");
        toast.success("Зөв хариуллаа!");
        onSolved();
      } else {
        setStatus("error");
        setFeedbackMsg(res.message || "Хариулт буруу байна. Дахин оролдоно уу.");
        toast.error("Хариулт буруу байна.");
      }
    },
    onError: () => {
      setStatus("error");
      setFeedbackMsg("Сервертэй холбогдоход алдаа гарлаа.");
      toast.error("Илгээхэд алдаа гарлаа.");
    }
  });

  const handleToggleMultiple = (idx: number) => {
    setSelectedMultiple(prev => 
      prev.includes(idx) ? prev.filter(x => x !== idx) : [...prev, idx]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSolved) return;

    setStatus("idle");
    setFeedbackMsg("");

    if (quiz.quiz_type === "single") {
      if (selectedSingle === null) {
        toast.error("Хариултаа сонгоно уу.");
        return;
      }
      submitMutation.mutate(selectedSingle);
    } else if (quiz.quiz_type === "multiple") {
      if (selectedMultiple.length === 0) {
        toast.error("Хариултаа сонгоно уу.");
        return;
      }
      submitMutation.mutate(selectedMultiple);
    } else if (quiz.quiz_type === "text") {
      if (!textAnswer.trim()) {
        toast.error("Хариултаа оруулна уу.");
        return;
      }
      submitMutation.mutate(textAnswer.trim());
    }
  };

  if (isSolved) {
    return (
      <div className="my-6 p-5 border border-emerald-500/25 bg-emerald-500/5 rounded-2xl flex items-center justify-between gap-4 transition-all">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-500">
            <Unlock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-1.5">
              <span>Нээгдсэн</span>
              <Check className="w-3.5 h-3.5" />
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 font-medium">
              Уг хэсэгт байсан гүүр тестийг амжилттай нээсэн.
            </div>
          </div>
        </div>
        <Badge variant="outline" className="border-emerald-500/20 text-emerald-500/90 text-[10px] bg-emerald-500/5 font-bold">
          Зөв хариулсан
        </Badge>
      </div>
    );
  }

  return (
    <div className="my-6 border border-brand-cyan/20 bg-secondary/15 rounded-3xl p-6 space-y-4 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-brand-cyan/5 rounded-full filter blur-xl" />
      
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-brand-cyan" />
          <span className="text-xs font-bold text-brand-cyan uppercase tracking-wider">Гүүр Тест (Түгжээ)</span>
        </div>
        <Badge variant="secondary" className="text-[9px] bg-brand-cyan/15 text-brand-cyan font-bold">
          {quiz.quiz_type === "single" ? "Нэг сонголттой" : quiz.quiz_type === "multiple" ? "Олон сонголттой" : "Нөхөх тест"}
        </Badge>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold text-foreground">
          <MarkdownRenderer content={quiz.question} />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {quiz.quiz_type === "single" && (
            <div className="grid sm:grid-cols-2 gap-2">
              {quiz.options.map((option: string, idx: number) => {
                const isSelected = selectedSingle === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedSingle(idx)}
                    className={`rounded-xl p-3 text-left text-xs border transition-all flex items-start gap-2.5 ${
                      isSelected 
                        ? "gradient-brand text-white border-primary font-bold shadow-md scale-[1.01]" 
                        : "bg-card border-border hover:bg-secondary/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                      isSelected ? "bg-white text-primary" : "bg-secondary text-muted-foreground"
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
          )}

          {quiz.quiz_type === "multiple" && (
            <div className="grid sm:grid-cols-2 gap-2">
              {quiz.options.map((option: string, idx: number) => {
                const isSelected = selectedMultiple.includes(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleToggleMultiple(idx)}
                    className={`rounded-xl p-3 text-left text-xs border transition-all flex items-start gap-2.5 ${
                      isSelected 
                        ? "gradient-brand text-white border-primary font-bold shadow-md scale-[1.01]" 
                        : "bg-card border-border hover:bg-secondary/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 ${
                      isSelected ? "bg-white text-primary" : "bg-secondary text-muted-foreground"
                    }`}>
                      {isSelected ? "✓" : String.fromCharCode(65 + idx)}
                    </span>
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
          )}

          {quiz.quiz_type === "text" && (
            <div className="space-y-2">
              <Input
                type="text"
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                placeholder="Хариултаа энд бичнэ үү..."
                className="h-10 rounded-xl bg-card border-border text-xs focus:ring-1 focus:ring-brand-cyan"
              />
            </div>
          )}

          {status !== "idle" && (
            <div className={`p-3 rounded-xl text-xs flex items-center gap-2 font-medium ${
              status === "success" 
                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" 
                : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
            }`}>
              {status === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{feedbackMsg}</span>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              disabled={submitMutation.isPending}
              className="gradient-brand text-white text-xs font-bold rounded-xl h-9 px-5 shadow-sm"
            >
              {submitMutation.isPending ? "Шалгаж байна..." : "Хариулт илгээх"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function parseGatedContent(content: string) {
  const quizRegex = /\[quiz-(\d+)\]/g;
  const segments: { type: "markdown" | "quiz"; value: string; quizId?: number }[] = [];
  
  let lastIndex = 0;
  let match;
  
  while ((match = quizRegex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index);
    if (textBefore.trim()) {
      segments.push({ type: "markdown", value: textBefore });
    }
    
    const quizId = parseInt(match[1]);
    segments.push({ type: "quiz", value: match[0], quizId });
    
    lastIndex = quizRegex.lastIndex;
  }
  
  const remainingText = content.substring(lastIndex);
  if (remainingText.trim()) {
    segments.push({ type: "markdown", value: remainingText });
  }
  
  return segments;
}

export default function LessonDetailPage() {
  const params = useParams();
  const slug = (params?.slug as string) || "";
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const { data: lesson, isLoading, isError } = useQuery({ 
    queryKey: ["lesson", slug], 
    queryFn: () => lessonApi.get(slug), 
    enabled: Boolean(slug) 
  });
  
  const complete = useMutation({
    mutationFn: (selected: number[]) => lessonApi.complete(slug, selected),
    onSuccess: (result) => {
      setSubmitted(true);
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["lesson", slug] });
      void queryClient.invalidateQueries({ queryKey: ["lessons"] });
      void queryClient.invalidateQueries({ queryKey: ["progress", "me"] });
    },
    onError: () => toast.error("Квизийн хариуг хадгалж чадсангүй."),
  });

  if (isLoading) return <main className="p-8 text-sm text-muted-foreground">Хичээлийг ачаалж байна…</main>;
  if (isError || !lesson) return <main className="p-8 text-sm text-rose-500">Хичээлийг ачаалж чадсангүй.</main>;

  const submitQuizLegacy = () => {
    if (Object.keys(answers).length !== lesson.quizzes.length) return toast.error("Бүх асуултад хариулна уу.");
    complete.mutate(lesson.quizzes.map((_, index) => answers[index]));
  };

  const solvedQuizIds = lesson.solved_quizzes || [];
  const segments = parseGatedContent(lesson.content_markdown || "");
  const hasGatedQuizzes = segments.some(seg => seg.type === "quiz");

  const renderedElements = [];
  let isLocked = false;
  
  for (const seg of segments) {
    if (isLocked) break;
    
    if (seg.type === "markdown") {
      renderedElements.push(
        <MarkdownRenderer key={seg.value.substring(0, 30) + Math.random()} content={seg.value} />
      );
    } else if (seg.type === "quiz" && seg.quizId) {
      const quiz = lesson.quizzes.find((q: any) => q.id === seg.quizId);
      if (quiz) {
        const isSolved = solvedQuizIds.includes(quiz.id);
        renderedElements.push(
          <GatedQuizCard 
            key={quiz.id}
            quiz={quiz}
            slug={slug}
            isSolved={isSolved}
            onSolved={() => {
              void queryClient.invalidateQueries({ queryKey: ["lesson", slug] });
            }}
          />
        );
        if (!isSolved) {
          isLocked = true; // Stop rendering subsequent blocks
        }
      }
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <header className="sticky top-0 z-40 glass border-b border-border h-16 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/lessons">
              <Button variant="ghost" size="icon" className="rounded-xl">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <div className="flex gap-2 items-center">
                <span className="text-xs font-bold text-brand-cyan">{lesson.topic}</span>
                <Badge variant="outline">{lesson.difficulty}</Badge>
              </div>
              <h1 className="text-sm font-black truncate max-w-md">{lesson.title}</h1>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <ThemeToggle />
            <Badge className="bg-brand-amber/15 text-brand-amber border-brand-amber/30">
              <Sparkles className="w-3.5 h-3.5 mr-1" />+{lesson.xp_reward} XP
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <article className="glass-strong rounded-3xl p-8 border border-border space-y-4">
            {renderedElements}
            
            {isLocked && (
              <div className="p-5 border border-dashed border-white/10 rounded-2xl text-center bg-card/20 flex flex-col items-center justify-center py-8 space-y-2 select-none">
                <Lock className="w-6 h-6 text-muted-foreground animate-pulse" />
                <span className="text-xs text-muted-foreground font-semibold">Унших хэсэг түгжигдсэн байна. Дээд талын тестийг зөв хариулж нээнэ үү.</span>
              </div>
            )}
          </article>

          {/* Fallback Legacy Quiz container if no gating tags are present in the markdown */}
          {!hasGatedQuizzes && lesson.quizzes.length > 0 && (
            <section className="glass-strong rounded-3xl p-8 border border-border space-y-6">
              <div>
                <h2 className="text-xl font-black flex gap-2 items-center">
                  <HelpCircle className="w-5 h-5 text-brand-cyan" />Ойлголтыг Шалгах Тест
                </h2>
                <p className="text-xs text-muted-foreground mt-1">Хариуг сервер шалгаж, оноо болон XP-г бүртгэнэ.</p>
              </div>
              {lesson.is_completed && (
                <Badge className="bg-emerald-500/20 text-emerald-500">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Хичээл үзсэн ({lesson.quiz_score}%)
                </Badge>
              )}
              {lesson.quizzes.map((quiz, questionIndex) => (
                <div key={quiz.id} className="rounded-2xl border border-border p-5 space-y-3">
                  <div className="font-bold text-sm">{questionIndex + 1}. {quiz.question}</div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {quiz.options.map((option, optionIndex) => (
                      <button
                        key={optionIndex}
                        disabled={submitted}
                        onClick={() => setAnswers((current) => ({ ...current, [questionIndex]: optionIndex }))}
                        className={`rounded-xl p-3 text-left text-xs border ${
                          answers[questionIndex] === optionIndex 
                            ? "gradient-brand text-white border-primary" 
                            : "bg-card border-border hover:bg-secondary"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex justify-end">
                <Button 
                  onClick={submitQuizLegacy} 
                  disabled={complete.isPending || submitted} 
                  className="gradient-brand text-white"
                >
                  {complete.isPending ? "Шалгаж байна…" : "Хариу Шалгах & Дуусгах"}
                </Button>
              </div>
            </section>
          )}
        </div>

        <aside className="glass-strong rounded-3xl p-6 border border-border h-fit sticky top-24 space-y-4">
          <h3 className="font-black flex gap-2">
            <Code2 className="w-4 h-4 text-brand-cyan" />Дадлага бодлогууд
          </h3>
          {lesson.practice_problems.map((problem) => (
            <div key={problem.code} className="rounded-2xl border border-border p-4 space-y-3">
              <div className="flex justify-between">
                <span className="font-mono text-xs text-brand-cyan">#{problem.code}</span>
                <Badge variant="outline">{problem.difficulty}</Badge>
              </div>
              <p className="font-bold text-sm">{problem.title}</p>
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>+{problem.xp_reward} XP · {problem.points} pt</span>
                <Link href={`/problems/${problem.code}`}>
                  <Button size="sm" className="gradient-brand text-white">
                    <Play className="w-3 h-3" />Бодох
                  </Button>
                </Link>
              </div>
            </div>
          ))}
          {lesson.practice_problems.length === 0 && (
            <p className="text-xs text-muted-foreground">Дадлага бодлого оруулаагүй байна.</p>
          )}
        </aside>
      </main>
    </div>
  );
}
