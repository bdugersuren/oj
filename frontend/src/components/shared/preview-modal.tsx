"use client";

import React from "react";
import { Eye, X, Lock, Unlock, Check, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MarkdownRenderer } from "@/components/markdown-renderer";

interface PreviewModalProps {
  title: string;
  content: string; // Tiptap HTML or Markdown content
  quizzes?: any[];
}

interface MockGatedQuizCardProps {
  quiz: any;
  isSolved: boolean;
  onSolve: () => void;
}

function MockGatedQuizCard({ quiz, isSolved, onSolve }: MockGatedQuizCardProps) {
  const [selectedSingle, setSelectedSingle] = React.useState<number | null>(null);
  const [selectedMultiple, setSelectedMultiple] = React.useState<number[]>([]);
  const [textAnswer, setTextAnswer] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "success" | "error">("idle");
  const [feedbackMsg, setFeedbackMsg] = React.useState("");

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

    let isCorrect = false;

    if (quiz.quiz_type === "single" || !quiz.quiz_type) {
      if (selectedSingle === null) return;
      isCorrect = selectedSingle === quiz.correct_option_index;
    } else if (quiz.quiz_type === "multiple") {
      if (selectedMultiple.length === 0) return;
      try {
        const correctList = JSON.parse(quiz.correct_answers_json || "[]");
        const correctSet = new Set(correctList.map((x: any) => parseInt(x)));
        const userSet = new Set(selectedMultiple);
        isCorrect = correctSet.size === userSet.size && [...correctSet].every((x: any) => userSet.has(x));
      } catch (err) {
        isCorrect = false;
      }
    } else if (quiz.quiz_type === "text") {
      if (!textAnswer.trim()) return;
      try {
        let correctList = JSON.parse(quiz.correct_answers_json || "[]");
        if (!Array.isArray(correctList)) correctList = [correctList];
        const userStr = textAnswer.trim().toLowerCase();
        isCorrect = correctList.map((x: any) => String(x).trim().toLowerCase()).includes(userStr);
      } catch (err) {
        isCorrect = false;
      }
    }

    if (isCorrect) {
      setStatus("success");
      setFeedbackMsg("Зөв хариуллаа! (Симуляци) 🌟");
      setTimeout(() => {
        onSolve();
      }, 600);
    } else {
      setStatus("error");
      setFeedbackMsg("Хариулт буруу байна. (Симуляци)");
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
              <span>Нээгдсэн (Симуляци)</span>
              <Check className="w-3.5 h-3.5" />
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 font-medium text-left">
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

  const options = quiz.options || [];

  return (
    <div className="my-6 border border-brand-cyan/20 bg-secondary/15 rounded-3xl p-6 space-y-4 shadow-sm relative overflow-hidden text-left">
      <div className="absolute top-0 right-0 w-24 h-24 bg-brand-cyan/5 rounded-full filter blur-xl" />
      
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-brand-cyan" />
          <span className="text-xs font-bold text-brand-cyan uppercase tracking-wider">Гүүр Тест (Симуляци)</span>
        </div>
        <Badge variant="secondary" className="text-[9px] bg-brand-cyan/15 text-brand-cyan font-bold">
          {quiz.quiz_type === "single" || !quiz.quiz_type ? "Нэг сонголттой" : quiz.quiz_type === "multiple" ? "Олон сонголттой" : "Нөхөх тест"}
        </Badge>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold text-foreground">
          <MarkdownRenderer content={quiz.question} />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {(quiz.quiz_type === "single" || !quiz.quiz_type) && (
            <div className="grid sm:grid-cols-2 gap-2">
              {options.map((option: string, idx: number) => {
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
              {options.map((option: string, idx: number) => {
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
              className="gradient-brand text-white text-xs font-bold rounded-xl h-9 px-5 shadow-sm"
            >
              Хариулт илгээх
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

export function PreviewModal({ title, content, quizzes = [] }: PreviewModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [solvedQuizIds, setSolvedQuizIds] = React.useState<number[]>([]);
  
  // Resizable state
  const [size, setSize] = React.useState({ width: 1000, height: 700 });
  const [isResizing, setIsResizing] = React.useState(false);

  // Initialize size based on current window viewport
  React.useEffect(() => {
    if (isOpen && typeof window !== "undefined") {
      setSize({
        width: Math.min(1000, window.innerWidth * 0.85),
        height: Math.min(700, window.innerHeight * 0.8),
      });
      setSolvedQuizIds([]); // Reset solved quizzes on open
    }
  }, [isOpen]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = size.width;
    const startHeight = size.height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Calculate delta. Double it because the dialog is centered via left-50% top-50% translate-50%.
      const deltaX = (moveEvent.clientX - startX) * 2;
      const deltaY = (moveEvent.clientY - startY) * 2;

      const newWidth = Math.max(500, Math.min(window.innerWidth * 0.98, startWidth + deltaX));
      const newHeight = Math.max(400, Math.min(window.innerHeight * 0.95, startHeight + deltaY));

      setSize({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const segments = parseGatedContent(content || "");
  const hasQuizzes = segments.some(seg => seg.type === "quiz");

  const renderedElements = [];
  let isLocked = false;

  for (const seg of segments) {
    if (isLocked) break;

    if (seg.type === "markdown") {
      renderedElements.push(
        <MarkdownRenderer key={seg.value.substring(0, 30) + Math.random()} content={seg.value} />
      );
    } else if (seg.type === "quiz" && seg.quizId) {
      const quiz = quizzes.find((q: any) => q.id === seg.quizId);
      if (quiz) {
        const isSolved = solvedQuizIds.includes(quiz.id);
        renderedElements.push(
          <MockGatedQuizCard
            key={quiz.id}
            quiz={quiz}
            isSolved={isSolved}
            onSolve={() => {
              setSolvedQuizIds(prev => [...prev, quiz.id]);
            }}
          />
        );
        if (!isSolved) {
          isLocked = true;
        }
      }
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger>
        <Button
          type="button"
          variant="outline"
          className="h-10 text-xs border-border glass gap-1.5 font-medium hover:border-brand-cyan/40 cursor-pointer rounded-xl"
          onClick={() => setIsOpen(true)}
        >
          <Eye className="w-4 h-4 text-brand-cyan" />
          Урьдчилан харах
        </Button>
      </DialogTrigger>

      <DialogContent 
        className="flex flex-col p-0 glass-strong border-border text-foreground overflow-hidden rounded-3xl shadow-2xl transition-none"
        style={{
          width: `${size.width}px`,
          height: `${size.height}px`,
          maxWidth: "98vw",
          maxHeight: "95vh",
        }}
      >
        {/* Header (Windows Window Style with Icon and Title) */}
        <DialogHeader className="p-4 border-b border-border flex flex-row items-center justify-between shrink-0 bg-card/65 select-none">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand-cyan/15 flex items-center justify-center text-brand-cyan">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-black flex items-center gap-2 text-foreground">
                <span>{title || "Урьдчилан харах"}</span>
              </DialogTitle>
              <p className="text-[9px] text-muted-foreground">Сурагчдад харагдах бодит байдал (Гүүр тестийн симуляци идэвхтэй)</p>
            </div>
          </div>
          
        </DialogHeader>

        {/* Content Viewer Area using MarkdownRenderer */}
        <div className="flex-1 bg-card/10 p-8 overflow-y-auto scrollbar-thin">
          {content && content.trim() !== "" ? (
            <div className="space-y-4">
              {renderedElements}
              {isLocked && (
                <div className="p-5 border border-dashed border-white/10 rounded-2xl text-center bg-card/20 flex flex-col items-center justify-center py-8 space-y-2 select-none">
                  <Lock className="w-6 h-6 text-muted-foreground animate-pulse" />
                  <span className="text-xs text-muted-foreground font-semibold">Унших хэсэг түгжигдсэн байна. Дээд талын тестийг зөв хариулж нээнү үү.</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-sm text-muted-foreground italic">
              Агуулга хоосон байна. Редакторт текст бичиж урьдчилан харна уу.
            </div>
          )}
        </div>

        {/* Footer (with close button at the bottom) */}
        <div className="p-4 border-t border-border bg-card/45 flex justify-end shrink-0 relative">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsOpen(false)}
            className="rounded-xl px-5 text-xs font-bold h-9 cursor-pointer"
          >
            Хаах
          </Button>

          {/* Diagonal drag resize handle */}
          <div
            onMouseDown={handleMouseDown}
            className="absolute bottom-1 right-1 w-5.5 h-5.5 cursor-se-resize flex items-end justify-end p-0.5 select-none group active:scale-95"
            title="Чирж хэмжээг өөрчлөх"
          >
            <svg
              className="w-3.5 h-3.5 text-muted-foreground/45 group-hover:text-brand-cyan/70 transition-colors"
              viewBox="0 0 100 100"
              fill="none"
              stroke="currentColor"
              strokeWidth="14"
              strokeLinecap="round"
            >
              <line x1="80" y1="20" x2="20" y2="80" />
              <line x1="80" y1="50" x2="50" y2="80" />
              <line x1="80" y1="80" x2="80" y2="80" />
            </svg>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
