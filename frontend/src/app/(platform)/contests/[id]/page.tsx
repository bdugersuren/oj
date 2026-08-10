"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Clock, Play, Trophy } from "lucide-react";
import toast from "react-hot-toast";
import { contestApi, type StandingRow } from "@/lib/api/contests";
import { useWebsocket } from "@/hooks/use-websocket";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme-toggle";

export default function ContestDetailPage() {
  const params = useParams();
  const id = Number(params?.id);
  const client = useQueryClient();
  const { data: contest, isLoading, isError } = useQuery({ queryKey: ["contest", id], queryFn: () => contestApi.get(id), enabled: Number.isFinite(id) });
  const { data: standings = [] } = useQuery({ queryKey: ["contest", id, "standings"], queryFn: () => contestApi.standings(id), enabled: Number.isFinite(id), refetchInterval: 15000 });
  const [liveRows, setLiveRows] = useState<StandingRow[] | null>(null);
  const register = useMutation({ mutationFn: () => contestApi.register(id), onSuccess: () => { toast.success("Тэмцээнд бүртгүүллээ."); void client.invalidateQueries({ queryKey: ["contest", id] }); void client.invalidateQueries({ queryKey: ["contests"] }); }, onError: () => toast.error("Бүртгүүлэхэд алдаа гарлаа.") });
  useWebsocket(Number.isFinite(id) ? `contests/${id}/scoreboard` : null, (event) => { if (Array.isArray(event)) setLiveRows(event as StandingRow[]); else void client.invalidateQueries({ queryKey: ["contest", id, "standings"] }); });
  const [remaining, setRemaining] = useState("");
  useEffect(() => { if (!contest) return; const update = () => { const ms = new Date(contest.end_time).getTime() - Date.now(); setRemaining(ms <= 0 ? "Дууссан" : new Date(ms).toISOString().slice(11, 19)); }; update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer); }, [contest]);
  if (isLoading) return <main className="p-8 text-sm text-muted-foreground">Тэмцээнийг ачаалж байна…</main>;
  if (isError || !contest) return <main className="p-8 text-sm text-rose-500">Тэмцээн олдсонгүй.</main>;
  const rows = liveRows ?? standings;
  return <div className="min-h-screen bg-background text-foreground pb-20"><header className="sticky top-0 z-40 glass border-b border-border h-16"><div className="max-w-6xl mx-auto px-4 h-full flex justify-between items-center"><div className="flex gap-3 items-center"><Link href="/contests"><Button variant="ghost" size="icon"><ChevronLeft /></Button></Link><div><h1 className="font-black">{contest.title}</h1><p className="text-xs text-muted-foreground">{contest.description}</p></div></div><div className="flex items-center gap-3"><Badge className="font-mono"><Clock className="w-3 mr-1" />{remaining}</Badge><ThemeToggle /></div></div></header><main className="max-w-6xl mx-auto px-4 pt-8"><Tabs defaultValue="problems"><div className="flex justify-between border-b border-border pb-4"><TabsList><TabsTrigger value="problems">Бодлогууд ({contest.problems.length})</TabsTrigger><TabsTrigger value="standings">Live Standings</TabsTrigger></TabsList>{!contest.is_registered && <Button onClick={() => register.mutate()} disabled={register.isPending} className="gradient-brand text-white">{register.isPending ? "Бүртгэж байна…" : "Бүртгүүлэх"}</Button>}</div><TabsContent value="problems" className="grid md:grid-cols-2 gap-4 pt-6">{contest.problems.map((problem, index) => <article key={problem.id} className="glass-strong rounded-2xl border border-border p-5"><div className="flex justify-between"><Badge>{String.fromCharCode(65 + index)}</Badge><span className="text-xs text-brand-amber">{problem.points} pt</span></div><h2 className="font-bold mt-3">{problem.title}</h2><Link href={`/problems/${problem.code}`}><Button className="mt-4 gradient-brand text-white"><Play className="w-3" />Бодох</Button></Link></article>)}</TabsContent><TabsContent value="standings" className="pt-6"><div className="rounded-2xl border border-border overflow-x-auto"><table className="w-full text-sm"><thead className="bg-secondary"><tr><th className="p-3">#</th><th className="p-3 text-left">Оролцогч</th><th className="p-3">Оноо</th><th className="p-3">Хугацаа</th></tr></thead><tbody>{rows.map((row) => <tr key={row.user_id} className="border-t border-border"><td className="p-3 text-center">{row.rank}</td><td className="p-3">{row.username}</td><td className="p-3 text-center font-bold text-brand-cyan">{row.total_score}</td><td className="p-3 text-center">{Math.round(row.total_time_ms / 60000)}м</td></tr>)}</tbody></table></div></TabsContent></Tabs></main></div>;
}
