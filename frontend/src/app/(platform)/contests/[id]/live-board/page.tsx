"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Search, Trophy, Users } from "lucide-react";
import { contestApi, type StandingRow } from "@/lib/api/contests";
import { useWebsocket } from "@/hooks/use-websocket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";

export default function IndividualOlympiadLiveBoardPage() {
  const params = useParams();
  const id = Number(params?.id);
  const client = useQueryClient();
  const [liveRows, setLiveRows] = useState<StandingRow[] | null>(null);
  const [search, setSearch] = useState("");
  const { data: contest } = useQuery({ queryKey: ["contest", id], queryFn: () => contestApi.get(id), enabled: Number.isFinite(id) });
  const { data: standings = [] } = useQuery({ queryKey: ["contest", id, "standings"], queryFn: () => contestApi.standings(id), enabled: Number.isFinite(id), refetchInterval: 15000 });
  useWebsocket(Number.isFinite(id) ? `contests/${id}/scoreboard` : null, (event) => { if (Array.isArray(event)) setLiveRows(event as StandingRow[]); else void client.invalidateQueries({ queryKey: ["contest", id, "standings"] }); });
  const rows = (liveRows ?? standings).filter((row) => row.username.toLowerCase().includes(search.toLowerCase()));
  return <div className="min-h-screen bg-background text-foreground"><header className="sticky top-0 z-40 glass border-b border-border h-16"><div className="max-w-6xl mx-auto px-4 h-full flex justify-between items-center"><div className="flex gap-3 items-center"><Link href={`/contests/${id}`}><Button variant="ghost" size="icon"><ChevronLeft /></Button></Link><div><h1 className="font-black flex gap-2"><Trophy className="w-4 text-brand-amber" />Live Scoreboard</h1><p className="text-xs text-muted-foreground">{contest?.title ?? "Тэмцээн"} · WebSocket live</p></div></div><ThemeToggle /></div></header><main className="max-w-6xl mx-auto p-6 space-y-5"><div className="relative max-w-sm"><Search className="absolute left-3 top-3 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Оролцогч хайх" /></div><div className="rounded-3xl border border-border overflow-x-auto glass-strong"><table className="w-full text-sm"><thead className="bg-secondary"><tr><th className="p-4">Байр</th><th className="p-4 text-left">Оролцогч</th><th className="p-4">Оноо</th><th className="p-4">Нийт хугацаа</th><th className="p-4">Бодлогууд</th></tr></thead><tbody>{rows.map((row) => <tr key={row.user_id} className="border-t border-border hover:bg-secondary/40"><td className="p-4 text-center font-black">{row.rank}</td><td className="p-4 font-bold flex items-center gap-2"><Users className="w-4 text-brand-cyan" />{row.username}</td><td className="p-4 text-center text-brand-cyan font-black">{row.total_score}</td><td className="p-4 text-center">{Math.round(row.total_time_ms / 60000)}м</td><td className="p-4"><div className="flex gap-2">{row.problem_results.map((result) => <span key={result.problem_code} className={result.score > 0 ? "text-emerald-500" : "text-muted-foreground"}>{result.problem_code}: {result.score}</span>)}</div></td></tr>)}</tbody></table>{rows.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">Оролцогчийн дүн байхгүй байна.</p>}</div></main></div>;
}
