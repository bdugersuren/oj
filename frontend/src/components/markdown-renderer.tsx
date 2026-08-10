"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import "katex/dist/katex.min.css";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import toast from "react-hot-toast";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);

  const handleCopy = (codeStr: string) => {
    navigator.clipboard.writeText(codeStr);
    setCopiedCode(codeStr);
    toast.success("Код хуулагдлаа!");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className={`prose dark:prose-invert max-w-none text-foreground leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl sm:text-3xl font-black text-foreground mt-6 mb-4 border-b border-border pb-2 tracking-tight">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-black text-foreground mt-6 mb-3 tracking-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-bold text-foreground mt-4 mb-2">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-4">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1.5 text-sm text-slate-700 dark:text-slate-300 mb-4">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1.5 text-sm text-slate-700 dark:text-slate-300 mb-4">
              {children}
            </ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-primary bg-primary/5 p-4 rounded-r-2xl my-4 text-sm text-foreground italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 rounded-2xl border border-border">
              <table className="w-full text-xs text-left border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="bg-secondary p-3 font-bold border-b border-border text-foreground">{children}</th>
          ),
          td: ({ children }) => (
            <td className="p-3 border-b border-border/50 text-slate-700 dark:text-slate-300">{children}</td>
          ),
          img: ({ src, alt }) => (
            <span className="block my-4 text-center">
              <img
                src={src}
                alt={alt || "Зураг"}
                className="rounded-2xl max-w-full h-auto mx-auto border border-border shadow-md"
              />
              {alt && <span className="text-xs text-muted-foreground mt-1.5 block font-medium">{alt}</span>}
            </span>
          ),
          code: ({ inline, className, children, ...props }: React.ComponentPropsWithoutRef<"code"> & { inline?: boolean }) => {
            const codeText = String(children).replace(/\n$/, "");
            const match = /language-(\w+)/.exec(className || "");
            const lang = match ? match[1] : "";

            if (lang === "mermaid") {
              return <MermaidDiagram chart={codeText} />;
            }

            if (inline) {
              return (
                <code className="bg-secondary text-primary px-1.5 py-0.5 rounded-md font-mono text-xs font-bold" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <div className="relative my-4 rounded-2xl overflow-hidden bg-[#1e1e1e] border border-border text-slate-200">
                <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-white/5 text-xs text-slate-400 font-mono">
                  <span>{lang ? `${lang.toUpperCase()} жишээ` : "Кодын жишээ"}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(codeText)}
                    className="h-6 text-[11px] px-2 text-slate-400 hover:text-white gap-1"
                  >
                    {copiedCode === codeText ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    Хуулах
                  </Button>
                </div>
                <pre className="p-4 font-mono text-xs overflow-x-auto leading-relaxed">
                  <code>{children}</code>
                </pre>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
