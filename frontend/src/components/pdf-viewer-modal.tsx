"use client";

import React, { useEffect, useState } from "react";
import { FileDown, FileText, ExternalLink, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { problemApi } from "@/lib/api/problems";

interface PdfViewerModalProps {
  pdfUrl?: string;
  problemCode: string;
  problemTitle: string;
}

export function PdfViewerModal({
  pdfUrl = "/sample-problem.pdf",
  problemCode,
  problemTitle,
}: PdfViewerModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    
    // Fetch dynamic presigned URL from backend
    const fetchPdfUrl = async () => {
      setIsLoading(true);
      try {
        const res = await problemApi.getStatementPdf(problemCode);
        if (res.url) {
          setLoadedUrl(res.url);
        } else {
          setLoadedUrl(pdfUrl);
        }
      } catch (err) {
        console.error("Error loading PDF statement URL:", err);
        setLoadedUrl(pdfUrl); // fallback
      } finally {
        setIsLoading(false);
      }
    };

    void fetchPdfUrl();
  }, [isOpen, problemCode, pdfUrl]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs border-border glass gap-1.5 font-medium hover:border-brand-cyan/40 cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5 text-brand-cyan" />
          PDF Өгүүлбэр
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 glass-strong border-border text-foreground overflow-hidden rounded-3xl">
        <DialogHeader className="p-4 border-b border-border flex flex-row items-center justify-between shrink-0 bg-card">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-cyan/15 flex items-center justify-center text-brand-cyan">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-black flex items-center gap-2">
                <span>#{problemCode} — {problemTitle}</span>
              </DialogTitle>
              <p className="text-xs text-muted-foreground">Олимпиад форматын албан ёсны PDF эх хувь</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {loadedUrl && (
              <a href={loadedUrl} download={`problem-${problemCode}.pdf`} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 rounded-xl border-border">
                  <FileDown className="w-3.5 h-3.5 text-brand-emerald" /> Татаж авах
                </Button>
              </a>
            )}
          </div>
        </DialogHeader>

        {/* Embedded PDF iframe / Document viewer */}
        <div className="flex-1 bg-secondary/30 p-2 relative flex flex-col items-center justify-center">
          {isLoading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-brand-cyan" />
              <span className="text-xs text-muted-foreground">PDF файлыг ачаалж байна...</span>
            </div>
          ) : loadedUrl ? (
            <iframe
              src={`${loadedUrl}#toolbar=0`}
              className="w-full h-full rounded-2xl border border-border shadow-inner bg-white"
              title={`PDF Statement for ${problemCode}`}
            />
          ) : (
            <span className="text-xs text-muted-foreground">PDF файл ачаалж чадсангүй.</span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
