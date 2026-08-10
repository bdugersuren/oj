"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Sparkles, Save, Eye, Code2,
  BookOpen, Calculator, FileText, CheckCircle2, Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TipTapEditor } from "@/components/tiptap-editor";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import toast from "react-hot-toast";

const INITIAL_DEMO_MARKDOWN = `### 📝 Олимпиадын Бодлогын Өгүүлбэр

Танд дараах алгебрийн бутархай тэгшитгэл өгөгдсөн:

$$\\frac{x-1}{x^2-1} = 5$$

Энэхүү илэрхийллийг хялбарчилбал $x \\ne 1$ үед:

$$\\frac{x-1}{(x-1)(x+1)} = \\frac{1}{x+1} = 5 \\implies x = -\\frac{4}{5}$$

Та өгөгдсөн $A$ ба $B$ бүхэл тоонуудын хувьд $\\frac{A-1}{A^2-1} = B$ харьцааг хангаж буй $A+B$ нийлбэрийг олж хэвлэнэ үү.

---

### 📊 Алгоритмын Загвар Зураг
![Алгоритмын Төлөвийн Шилжилтийн Диаграм](/images/algorithm-diagram.svg)

---

### 📥 Оролт
Нэг мөрөнд зайгаар тусгаарлагдсан хоёр бүхэл тоо $A$ ба $B$ өгөгдөнө ($-10^9 \\le A, B \\le 10^9$).

### 📤 Гаралт
$A + B$-ийн утгыг илэрхийлэх ганц бүхэл тоог хэвлэнэ.`;

export default function TeacherEditorPage() {
  const [content, setContent] = useState<string>(INITIAL_DEMO_MARKDOWN);
  const [outputFormat, setOutputFormat] = useState<"preview" | "raw_html" | "json">("preview");

  const handleSave = () => {
    toast.success("✅ Хичээлийн өгөгдөл амжилттай хадгалагдлаа!");
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* ── Main Split View ── */}
      <main className="max-w-7xl mx-auto px-4 pt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Page Header */}
        <div className="lg:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="bg-brand-violet/15 text-brand-violet border-none text-[10px] font-bold">
                TipTap Studio
              </Badge>
              <h1 className="text-3xl font-black">Онол & Бодлого Бэлтгэх Редактор</h1>
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              WYSIWYG + KaTeX Математик Томьёо + Зураг Рэндэрлэх хянах самбар
            </p>
          </div>
          <Button
            onClick={handleSave}
            className="gradient-brand text-white border-0 text-xs font-bold gap-1.5 rounded-xl shadow-md shadow-brand-cyan/20 h-10 px-4 cursor-pointer"
          >
            <Save className="w-4 h-4" /> Өөрчлөлтийг хадгалах
          </Button>
        </div>
        {/* Left: TipTap WYSIWYG Editor */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-cyan" />
              1. TipTap Visual Editor (Оруулах хэсэг)
            </h2>
            <span className="text-xs text-muted-foreground">Шууд бичиж засварлана</span>
          </div>

          <div className="space-y-3">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Markdown болон математик томьёогоо энд бичнэ үү..."
              className="w-full h-[520px] bg-card text-foreground font-mono text-xs p-5 rounded-3xl border border-border outline-none focus:border-brand-cyan/60 transition-colors shadow-inner resize-none leading-relaxed"
            />
          </div>

          {/* Quick Insert Helpers */}
          <div className="glass rounded-2xl p-3 border border-border flex items-center gap-2 text-xs">
            <span className="font-bold text-muted-foreground">Түргэн Томьёо:</span>
            <button
              onClick={() => setContent((prev) => prev + "\n\n$$\\frac{x-1}{x^2-1} = 5$$")}
              className="px-2.5 py-1 rounded-lg bg-secondary font-mono text-[11px] hover:bg-brand-cyan/20 hover:text-brand-cyan transition-colors"
            >
              \frac&#123;a&#125;&#123;b&#125;
            </button>
            <button
              onClick={() => setContent((prev) => prev + "\n\n$$O(\\sqrt{N})$$")}
              className="px-2.5 py-1 rounded-lg bg-secondary font-mono text-[11px] hover:bg-brand-violet/20 hover:text-brand-violet transition-colors"
            >
              O(√N)
            </button>
            <button
              onClick={() => setContent((prev) => prev + "\n\n![Диаграм](/images/algorithm-diagram.svg)")}
              className="px-2.5 py-1 rounded-lg bg-secondary font-mono text-[11px] hover:bg-brand-emerald/20 hover:text-brand-emerald transition-colors"
            >
              + Зураг
            </button>
          </div>
        </div>

        {/* Right: Live Rendered Output */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black flex items-center gap-2">
              <Eye className="w-4 h-4 text-brand-emerald" />
              2. Бодит Цагийн Рэндэр (Live Rendered Preview)
            </h2>
            <div className="flex items-center gap-1 bg-secondary p-1 rounded-xl text-xs">
              <button
                onClick={() => setOutputFormat("preview")}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${outputFormat === "preview" ? "bg-card text-foreground font-bold shadow-xs" : "text-muted-foreground"}`}
              >
                Харагдах байдал
              </button>
              <button
                onClick={() => setOutputFormat("raw_html")}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${outputFormat === "raw_html" ? "bg-card text-foreground font-bold shadow-xs" : "text-muted-foreground"}`}
              >
                JSON / Code
              </button>
            </div>
          </div>

          <div className="glass-strong rounded-3xl p-8 border border-border min-h-[520px] max-h-[600px] overflow-y-auto scrollbar-thin">
            {outputFormat === "preview" ? (
              <MarkdownRenderer content={content} />
            ) : (
              <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                {JSON.stringify({ markdown: content, format: "katex-gfm-v1" }, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
