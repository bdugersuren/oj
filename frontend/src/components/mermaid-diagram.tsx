"use client";

import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { useTheme } from "next-themes";
import { Loader2 } from "lucide-react";

interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

export function MermaidDiagram({ chart, className = "" }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let isMounted = true;
    const renderChart = async () => {
      try {
        setLoading(true);
        const isDark = resolvedTheme === "dark";
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          securityLevel: "loose",
          fontFamily: "system-ui, sans-serif",
          themeVariables: isDark
            ? {
                primaryColor: "#3b82f6",
                primaryTextColor: "#f8fafc",
                primaryBorderColor: "#60a5fa",
                lineColor: "#94a3b8",
                secondaryColor: "#8b5cf6",
                tertiaryColor: "#1e293b",
              }
            : {
                primaryColor: "#0284c7",
                primaryTextColor: "#0f172a",
                primaryBorderColor: "#0369a1",
                lineColor: "#64748b",
                secondaryColor: "#7c3aed",
                tertiaryColor: "#f1f5f9",
              },
        });

        const uniqueId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
        const { svg } = await mermaid.render(uniqueId, chart.trim());

        if (isMounted) {
          setSvgContent(svg);
          setLoading(false);
        }
      } catch (err) {
        console.error("Mermaid render error:", err);
        if (isMounted) {
          setSvgContent(`<div class="p-4 rounded-xl bg-rose-500/10 text-rose-500 text-xs font-mono">Mermaid диаграмын синтакс алдаатай байна.</div>`);
          setLoading(false);
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart, resolvedTheme]);

  return (
    <div className={`my-6 p-6 rounded-3xl glass border border-border flex flex-col items-center justify-center overflow-x-auto ${className}`}>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-6">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          Диаграмыг рэндэрлэж байна...
        </div>
      ) : (
        <div
          ref={containerRef}
          className="w-full flex justify-center [&>svg]:max-w-full [&>svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      )}
    </div>
  );
}
