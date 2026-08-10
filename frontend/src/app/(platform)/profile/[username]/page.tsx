"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Award, CheckCircle2, ChevronLeft, Flame, Sparkles, Zap } from "lucide-react";
import { progressApi } from "@/lib/api/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ThemeToggle } from "@/components/theme-toggle";

export default function ProfilePage() {
  const params = useParams();
  const requested = String(params?.username ?? "");
  const { data: progress, isLoading, isError } = useQuery({ queryKey: ["progress", requested], queryFn: () => progressApi.byUsername(requested), enabled: Boolean(requested) });
  if (isLoading) return <main className="p-8 text-sm text-muted-foreground">Профайлыг ачаалж байна…</main>;
  if (isError || !progress) return <main className="p-8 text-sm text-rose-500">Профайлыг харахын тулд нэвтэрнэ үү.</main>;
  return <div className="min-h-screen bg-background text-foreground pb-20"><header className="sticky top-0 z-40 glass border-b border-border h-16"><div className="max-w-5xl mx-auto h-full px-4 flex justify-between items-center"><div className="flex gap-3 items-center"><Link href="/dashboard"><Button variant="ghost" size="icon"><ChevronLeft /></Button></Link><h1 className="font-black">Сурагчийн профайл</h1></div><ThemeToggle /></div></header><main className="max-w-5xl mx-auto px-4 pt-8 space-y-6"><section className="glass-strong rounded-3xl p-8 border border-border flex justify-between gap-4"><div><h2 className="text-3xl font-black">@{progress.username}</h2><Badge className="mt-3" style={{ color: progress.level_color, borderColor: progress.level_color }}>{progress.level_name}</Badge><div className="flex gap-4 mt-5 text-sm"><span className="flex gap-1"><Flame className="w-4 text-amber-500" />{progress.current_streak} өдөр</span><span className="flex gap-1"><Sparkles className="w-4 text-brand-cyan" />{progress.total_xp} XP</span><span className="flex gap-1"><CheckCircle2 className="w-4 text-emerald-500" />{progress.solved_count} бодлого</span></div></div><div className="text-right"><Zap className="w-8 h-8 text-brand-amber ml-auto" /><p className="text-2xl font-black mt-2">{progress.elo_rating}</p><p className="text-xs text-muted-foreground">Elo рейтинг</p></div></section><section className="glass-strong rounded-3xl p-6 border border-border"><h3 className="font-black flex gap-2"><Award className="w-4 text-brand-cyan" />Сэдвийн эзэмшилт</h3><div className="space-y-4 mt-5">{progress.topic_masteries.map((topic) => <div key={topic.topic_slug}><div className="flex justify-between text-xs"><span>{topic.topic_slug}</span><span>{topic.mastery_percentage}% · {topic.solved_count} бодсон</span></div><Progress value={topic.mastery_percentage} className="mt-2" /></div>)}{progress.topic_masteries.length === 0 && <p className="text-sm text-muted-foreground">Эзэмшилтийн өгөгдөл үүсээгүй байна.</p>}</div></section></main></div>;
}
