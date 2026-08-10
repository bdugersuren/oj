"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Calendar, Trophy } from "lucide-react";
import { contestApi, type ContestStatus } from "@/lib/api/contests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const labels: Record<ContestStatus, string> = { running: "🔴 ЯВАГДАЖ БАЙНА", upcoming: "⏰ УДАХГҮЙ", ended: "ДУУССАН" };

export default function ContestsPage() {
  const [filter, setFilter] = useState<ContestStatus | "all">("all");
  const { data: contests = [], isLoading, isError } = useQuery({ queryKey: ["contests"], queryFn: contestApi.list });
  const visible = contests.filter((contest) => filter === "all" || contest.status === filter);
  return <div className="min-h-screen bg-background text-foreground pb-20"><header className="sticky top-0 z-40 glass border-b border-border h-16"><div className="max-w-7xl mx-auto px-4 h-full flex justify-between items-center"><Link href="/" className="flex gap-2 items-center"><Trophy className="w-5 text-brand-amber" /><b>OJ Platform</b></Link><div className="flex gap-4 items-center"><Link href="/dashboard">Dashboard</Link><Link href="/contests" className="text-primary font-bold">Тэмцээнүүд</Link><ThemeToggle /></div></div></header><main className="max-w-5xl mx-auto px-4 pt-10 space-y-6"><div className="flex justify-between gap-4 items-center"><div><h1 className="text-3xl font-black">Тэмцээний Танхим</h1><p className="text-sm text-muted-foreground">Бодит цагийн олимпиад ба дүнгийн самбар</p></div><div className="glass rounded-xl p-1">{(["all", "running", "upcoming", "ended"] as const).map((status) => <button key={status} onClick={() => setFilter(status)} className={`px-3 py-2 text-xs rounded-lg ${filter === status ? "gradient-brand text-white" : "text-muted-foreground"}`}>{status === "all" ? "Бүгд" : labels[status]}</button>)}</div></div>{isLoading && <p className="text-sm text-muted-foreground">Тэмцээнүүдийг ачаалж байна…</p>}{isError && <p className="text-sm text-rose-500">Тэмцээнүүдийг ачаалж чадсангүй.</p>}<div className="space-y-4">{visible.map((contest) => <article key={contest.id} className="glass-strong border border-border rounded-3xl p-6 flex flex-col md:flex-row justify-between gap-4"><div><Badge>{labels[contest.status]}</Badge><h2 className="text-xl font-black mt-3">{contest.title}</h2><p className="text-sm text-muted-foreground mt-2">{contest.description}</p><p className="text-xs text-muted-foreground mt-4 flex gap-1"><Calendar className="w-3" />{new Date(contest.start_time).toLocaleString()}</p></div><Link href={`/contests/${contest.id}`}><Button className="gradient-brand text-white">{contest.status === "running" ? "Тэмцээнд орох" : "Дэлгэрэнгүй"}<ArrowRight /></Button></Link></article>)}</div></main></div>;
}
