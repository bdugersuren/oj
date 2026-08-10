"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search, BookOpen, Code2, Trophy, Globe,
  FileText, Star, ArrowRight, CornerDownLeft, Sparkles
} from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

interface SearchItem {
  id: string;
  title: string;
  category: string;
  href: string;
  badge?: string;
  icon: React.ReactNode;
}

const SEARCH_ITEMS: SearchItem[] = [
  { id: "1", title: "#1001: A+B Нийлбэр", category: "Бодлого", href: "/problems/1001", badge: "Bronze", icon: <Code2 className="w-4 h-4 text-brand-cyan" /> },
  { id: "2", title: "#1002: Хамгийн Их Элемент", category: "Бодлого", href: "/problems/1002", badge: "Bronze", icon: <Code2 className="w-4 h-4 text-brand-cyan" /> },
  { id: "3", title: "#1003: Анхны Тооны Шалгуур", category: "Бодлого", href: "/problems/1003", badge: "Bronze", icon: <Code2 className="w-4 h-4 text-brand-cyan" /> },
  { id: "4", title: "#1004: Хоёртын Хайлт ба Завсар", category: "Бодлого", href: "/problems/1004", badge: "Silver", icon: <Code2 className="w-4 h-4 text-brand-cyan" /> },
  { id: "5", title: "Олимпиадын Математик: Анхны Тоо ба O(√N)", category: "Онол", href: "/lessons/prime-numbers-math", badge: "+30 XP", icon: <BookOpen className="w-4 h-4 text-purple-400" /> },
  { id: "6", title: "Хоёртын Хайлтын Үндэс ба Оновчлол", category: "Онол", href: "/lessons/binary-search-foundations", badge: "+40 XP", icon: <BookOpen className="w-4 h-4 text-purple-400" /> },
  { id: "7", title: "Олимпиад Аяллын Замнал (World Map)", category: "Хуудас", href: "/worlds", icon: <Globe className="w-4 h-4 text-emerald-400" /> },
  { id: "8", title: "Алгоритмуудын Шаталсан Мод (Taxonomy)", category: "Хуудас", href: "/algorithms", icon: <Sparkles className="w-4 h-4 text-amber-400" /> },
  { id: "9", title: "Тэргүүлэгчдийн Самбар (Leaderboard)", category: "Хуудас", href: "/leaderboard", icon: <Trophy className="w-4 h-4 text-amber-400" /> },
  { id: "10", title: "Багшийн TipTap Studio", category: "Багш", href: "/teacher/editor", icon: <FileText className="w-4 h-4 text-rose-400" /> },
];

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  // Keyboard shortcut listener (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filtered = SEARCH_ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (href: string) => {
    setIsOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl p-0 glass-strong border-border text-foreground rounded-3xl overflow-hidden shadow-2xl">
        {/* Search Input Header */}
        <div className="flex items-center px-4 py-3.5 border-b border-border bg-card/80">
          <Search className="w-5 h-5 text-muted-foreground mr-3 shrink-0" />
          <input
            type="text"
            placeholder="Бодлого, онолын хичээл, хуудас хайх... (эсвэл сум товч дарна уу)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded-lg border border-border">
            ESC
          </kbd>
        </div>

        {/* Search Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1 scrollbar-thin">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              Хайлтын үр дүн олдсонгүй.
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelect(item.href)}
                className="w-full flex items-center justify-between p-3 rounded-2xl text-left hover:bg-secondary/70 transition-colors group cursor-pointer border border-transparent hover:border-border"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center">
                    {item.icon}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                      <span>{item.title}</span>
                      {item.badge && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-secondary text-muted-foreground font-mono">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{item.category}</div>
                  </div>
                </div>

                <CornerDownLeft className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-secondary/40 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground font-medium">
          <span>Шилжих: <strong className="text-foreground">Enter ↵</strong></span>
          <span>Нээх: <kbd className="bg-card px-1.5 py-0.5 rounded border border-border text-[10px]">Ctrl + K</kbd></span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
