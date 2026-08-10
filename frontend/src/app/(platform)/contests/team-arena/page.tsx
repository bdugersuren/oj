"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Trophy, Flame, Clock, Award, Star,
  CheckCircle2, XCircle, ArrowUp, ArrowDown, Play,
  Pause, RotateCcw, Sparkles, ChevronLeft, Shield, Zap,
  Plus, UserPlus, Copy, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { contestApi, TeamOut, TeamStandingRow } from "@/lib/api/contests";
import { websocketUrl } from "@/lib/api/client";
import toast from "react-hot-toast";

const BALLOON_HEX = ["#ef4444", "#10b981", "#06b6d4", "#f59e0b", "#8b5cf6"];

function TeamArenaContent() {
  const searchParams = useSearchParams();
  const contestId = Number(searchParams.get("contest_id") || "1");

  const [contestTitle, setContestTitle] = useState("2026 Улсын Багийн Програмчлалын Олимпиад");
  const [standings, setStandings] = useState<TeamStandingRow[]>([]);
  const [myTeam, setMyTeam] = useState<TeamOut | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const [problemsList, setProblemsList] = useState<{ code: string; title: string }[]>([]);

  // Team Action Modals/Forms State
  const [teamName, setTeamName] = useState("");
  const [teamSchool, setTeamSchool] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isActionPending, setIsActionPending] = useState(false);

  const fetchTeamAndStandings = async () => {
    setIsLoading(true);
    try {
      // 1. Get Contest details
      const contest = await contestApi.get(contestId);
      setContestTitle(contest.title);
      if (contest.problems) {
        setProblemsList(contest.problems.map(p => ({ code: p.code, title: p.title })));
      }

      // 2. Get User's Team if any
      try {
        const team = await contestApi.getMyTeam();
        setMyTeam(team);
      } catch (err) {
        setMyTeam(null);
      }

      // 3. Get team standings
      const std = await contestApi.teamStandings(contestId);
      setStandings(std);
    } catch (err) {
      console.error(err);
      toast.error("Тэмцээний өгөгдөл татахад алдаа гарлаа.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamAndStandings();
  }, [contestId]);

  // Connect to Live Scoreboard WebSocket
  useEffect(() => {
    if (!contestId) return;

    const wsUrl = websocketUrl(`/contests/${contestId}/team-scoreboard`);
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // If it's a heartbeat/CONNECTED ignore
        if (data.status === "CONNECTED") return;

        // Compare standings to see if a team solved a problem to trigger toast/confetti
        const newStandings = data as TeamStandingRow[];
        setStandings((prevStandings) => {
          if (prevStandings.length > 0) {
            newStandings.forEach((newTeam) => {
              const prevTeam = prevStandings.find((t) => t.team_id === newTeam.team_id);
              if (prevTeam && newTeam.solved_count > prevTeam.solved_count) {
                // Find which problem was newly solved
                const newlySolved = newTeam.problem_results.find(
                  (res) => res.is_solved && !prevTeam.problem_results.find((pr) => pr.problem_code === res.problem_code)?.is_solved
                );
                
                if (newlySolved) {
                  const eventMsg = `🚀 ${newTeam.team_name} баг [Бодлого ${newlySolved.problem_code}]-г бодож 🎈 хүртлээ!`;
                  setLastEvent(eventMsg);
                  toast.success(eventMsg, { duration: 5000 });
                }
              }
            });
          }
          return newStandings;
        });
      } catch (err) {
        console.error("WS parse error", err);
      }
    };

    ws.onerror = (err) => {
      console.error("WS Connection Error", err);
    };

    return () => {
      ws.close();
    };
  }, [contestId]);

  // CTFd-style team creation
  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName) return;
    setIsActionPending(true);
    try {
      const team = await contestApi.createTeam({ name: teamName, school: teamSchool || undefined });
      setMyTeam(team);
      setTeamName("");
      setTeamSchool("");
      toast.success(`'${team.name}' баг амжилттай үүсгэгдлээ!`);
      fetchTeamAndStandings();
    } catch (err: any) {
      toast.error(err.message || "Баг үүсгэхэд алдаа гарлаа.");
    } finally {
      setIsActionPending(false);
    }
  };

  // Join existing team via code
  const handleJoinTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode) return;
    setIsActionPending(true);
    try {
      const team = await contestApi.joinTeam({ invite_code: inviteCode });
      setMyTeam(team);
      setInviteCode("");
      toast.success(`'${team.name}' багт амжилттай нэгдлээ!`);
      fetchTeamAndStandings();
    } catch (err: any) {
      toast.error(err.message || "Багт элсэхэд алдаа гарлаа. Урилгын кодоо шалгана уу.");
    } finally {
      setIsActionPending(false);
    }
  };

  // Register team for contest
  const handleRegisterTeam = async () => {
    if (!myTeam) return;
    setIsActionPending(true);
    try {
      await contestApi.registerTeam(contestId);
      toast.success("Баг тэмцээнд амжилттай бүртгэгдлээ!");
      fetchTeamAndStandings();
    } catch (err: any) {
      toast.error(err.message || "Тэмцээнд бүртгүүлэхэд алдаа гарлаа.");
    } finally {
      setIsActionPending(false);
    }
  };

  const copyInviteCode = () => {
    if (!myTeam) return;
    navigator.clipboard.writeText(myTeam.invite_code);
    toast.success("Урилгын код санах ойд хуулагдлаа!");
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* ── Top Bar ── */}
      <header className="sticky top-0 z-40 glass border-b border-border h-16 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/contests">
              <Button variant="ghost" size="icon" className="rounded-xl">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-[10px] font-bold">
                  ICPC / Багийн Тэмцээний Арена
                </Badge>
                <h1 className="text-sm font-black">{contestTitle}</h1>
              </div>
              <p className="text-xs text-muted-foreground">Бодит цагийн багийн scoreboard болон ICPC бөмбөлгийн систем</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button
              onClick={fetchTeamAndStandings}
              variant="outline"
              size="sm"
              className="rounded-xl border-border h-8 text-xs gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Шинэчлэх
            </Button>
          </div>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="max-w-7xl mx-auto px-4 pt-8 space-y-8">
        
        {/* Live Notification Bar */}
        <AnimatePresence>
          {lastEvent && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="glass-strong rounded-2xl p-4 border border-brand-cyan/40 bg-brand-cyan/10 flex items-center justify-between shadow-lg shadow-brand-cyan/10"
            >
              <div className="flex items-center gap-2.5 text-xs font-bold text-foreground">
                <Flame className="w-4 h-4 text-amber-500 fill-amber-500 animate-bounce" />
                <span>{lastEvent}</span>
              </div>
              <Badge className="bg-emerald-500 text-white border-none text-[10px]">
                LIVE SCOREBOARD UPDATE 🎈
              </Badge>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Team Management Panel ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Create/Join Team Forms */}
          {!myTeam ? (
            <>
              <Card className="glass-strong border-border shadow-md md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6 p-6">
                <form onSubmit={handleCreateTeam} className="space-y-4">
                  <h3 className="font-black text-sm flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-purple-500" /> Шинэ Баг Үүсгэх
                  </h3>
                  <div className="space-y-1.5 text-xs">
                    <Label htmlFor="create-team-name">Багийн нэр</Label>
                    <Input
                      id="create-team-name"
                      placeholder="e.g. Coder Titans"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      className="rounded-xl text-xs"
                      required
                    />
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <Label htmlFor="create-team-school">Сургууль / Байгууллага</Label>
                    <Input
                      id="create-team-school"
                      placeholder="e.g. МУИС"
                      value={teamSchool}
                      onChange={(e) => setTeamSchool(e.target.value)}
                      className="rounded-xl text-xs"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isActionPending}
                    className="w-full text-xs font-bold rounded-xl gradient-brand text-white border-none cursor-pointer"
                  >
                    Баг үүсгэх
                  </Button>
                </form>

                <form onSubmit={handleJoinTeam} className="space-y-4 border-t sm:border-t-0 sm:border-l border-border pt-6 sm:pt-0 sm:pl-6">
                  <h3 className="font-black text-sm flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4 text-brand-cyan" /> Багт Элсэх
                  </h3>
                  <div className="space-y-1.5 text-xs">
                    <Label htmlFor="join-invite-code">Багийн урилгын код</Label>
                    <Input
                      id="join-invite-code"
                      placeholder="e.g. A3B8C1D0"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      className="rounded-xl text-xs uppercase"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Багийн ахлагчаас урилгын кодыг авч энд оруулан багт нэгдэнэ. Баг хамгийн ихдээ 3 гишүүнтэй байна.
                  </p>
                  <Button
                    type="submit"
                    disabled={isActionPending}
                    variant="outline"
                    className="w-full text-xs font-bold rounded-xl border-border cursor-pointer"
                  >
                    Багт элсэх
                  </Button>
                </form>
              </Card>

              <Card className="glass-strong border-border shadow-md flex flex-col justify-center items-center p-6 text-center text-xs text-muted-foreground">
                <Users className="w-10 h-10 text-muted-foreground/40 mb-3" />
                <p>Та ямар нэгэн багт нэгдээгүй байна.</p>
                <p className="text-[10px] mt-1">Тэмцээнд оролцохын тулд эхлээд баг үүсгэх эсвэл багт элсэнэ үү.</p>
              </Card>
            </>
          ) : (
            // Display My Team Details & Register status
            <>
              <Card className="glass-strong border-border shadow-md md:col-span-2 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-foreground">🛡️ {myTeam.name}</span>
                    {myTeam.school && (
                      <Badge variant="outline" className="border-border text-[10px] font-bold">
                        {myTeam.school}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs font-medium text-muted-foreground">
                    <span>Гишүүд:</span>
                    {myTeam.members.map((m) => (
                      <Badge key={m.user_id} className="bg-secondary text-foreground border-none text-[10px] px-2 py-0.5">
                        {m.username}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[10px] text-muted-foreground block font-bold">БАГИЙН УРИЛГЫН КОД:</span>
                    <span className="font-mono text-sm font-black text-purple-500 uppercase">{myTeam.invite_code}</span>
                  </div>
                  <Button
                    onClick={copyInviteCode}
                    variant="ghost"
                    size="icon"
                    className="rounded-xl border border-border h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>

              <Card className="glass-strong border-border shadow-md p-6 flex flex-col justify-center items-center text-center">
                {standings.find((row) => row.team_id === myTeam.id) ? (
                  <>
                    <Badge className="bg-emerald-500/20 text-emerald-500 border-none font-black text-xs px-3 py-1 rounded-full mb-2">
                      ТЭМЦЭЭНД БҮРТГЭЛТЭЙ ✅
                    </Badge>
                    <span className="text-xs text-muted-foreground">Танай баг тэмцээнд бүртгэгдсэн байна.</span>
                  </>
                ) : (
                  <>
                    <Badge className="bg-rose-500/20 text-rose-500 border-none font-black text-xs px-3 py-1 rounded-full mb-2">
                      БҮРТГЭЛГҮЙ ❌
                    </Badge>
                    <Button
                      onClick={handleRegisterTeam}
                      disabled={isActionPending}
                      className="w-full text-xs font-bold rounded-xl gradient-brand text-white border-none cursor-pointer mt-1"
                    >
                      Багаа тэмцээнд бүртгүүлэх
                    </Button>
                  </>
                )}
              </Card>
            </>
          )}

        </div>

        {/* ── Problem Balloon Legend Bar ── */}
        <div className="glass-strong rounded-3xl p-5 border border-border flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Бодлогын Бөмбөлгүүд (Balloons):
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs font-bold">
            {problemsList.map((prob, idx) => {
              const color = BALLOON_HEX[idx % BALLOON_HEX.length];
              return (
                <div key={prob.code} className="flex items-center gap-1.5" title={prob.title}>
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[11px] shadow-sm font-black"
                    style={{ backgroundColor: color }}
                  >
                    {prob.code}
                  </div>
                  <span className="text-muted-foreground">{prob.code}-р Бодлого</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Live Scoreboard Table ── */}
        <div className="glass-strong rounded-3xl border border-border overflow-hidden shadow-2xl">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-secondary/80 border-b border-border text-muted-foreground font-bold">
              <tr>
                <th className="p-4 w-16 text-center"># Байр</th>
                <th className="p-4">Багийн Нэр & Гишүүд</th>
                <th className="p-4">Сургууль</th>
                <th className="p-4 text-center">Бодсон (🎈)</th>
                <th className="p-4 text-center">Нийт Торгууль</th>
                {problemsList.map((prob) => (
                  <th key={prob.code} className="p-4 text-center w-24">
                    {prob.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                <tr>
                  <td colSpan={5 + problemsList.length} className="text-center py-20 text-muted-foreground text-xs">
                    Мэдээллийг ачаалж байна...
                  </td>
                </tr>
              ) : standings.length === 0 ? (
                <tr>
                  <td colSpan={5 + problemsList.length} className="text-center py-20 text-muted-foreground text-xs">
                    Тэмцээнд бүртгэлтэй баг байхгүй байна.
                  </td>
                </tr>
              ) : (
                <AnimatePresence>
                  {standings.map((row) => {
                    const isUserTeam = myTeam && row.team_id === myTeam.id;

                    return (
                      <motion.tr
                        key={row.team_id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 350,
                          damping: 25,
                        }}
                        className={`transition-colors ${
                          row.rank === 1
                            ? "bg-amber-500/10 hover:bg-amber-500/15"
                            : isUserTeam
                            ? "bg-primary/10 hover:bg-primary/15 font-bold"
                            : "hover:bg-secondary/40"
                        }`}
                      >
                        {/* Rank */}
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {row.rank === 1 ? (
                              <span className="w-7 h-7 rounded-xl bg-amber-500 text-white font-black flex items-center justify-center shadow-md">
                                1 👑
                              </span>
                            ) : row.rank === 2 ? (
                              <span className="w-7 h-7 rounded-xl bg-slate-400 text-white font-black flex items-center justify-center shadow-md">
                                2 🥈
                              </span>
                            ) : row.rank === 3 ? (
                              <span className="w-7 h-7 rounded-xl bg-amber-700 text-white font-black flex items-center justify-center shadow-md">
                                3 🥉
                              </span>
                            ) : (
                              <span className="font-mono font-bold text-muted-foreground">{row.rank}</span>
                            )}
                          </div>
                        </td>

                        {/* Team Info */}
                        <td className="p-4">
                          <div className="font-black text-sm text-foreground flex items-center gap-2">
                            <span>{row.team_name}</span>
                            {isUserTeam && (
                              <Badge className="bg-purple-500 text-white border-none text-[8px] px-1 py-0.2 uppercase font-black">
                                Таны баг
                              </Badge>
                            )}
                            {/* Balloons showcase */}
                            <div className="flex gap-0.5 ml-2">
                              {row.balloons.map((bColor, bIdx) => (
                                <div
                                  key={bIdx}
                                  className="w-3 h-3 rounded-full shadow-sm animate-bounce"
                                  style={{ backgroundColor: bColor, animationDelay: `${bIdx * 0.1}s` }}
                                />
                              ))}
                            </div>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                            Гишүүд: {row.members.join(" · ") || "Одоогоор байхгүй"}
                          </div>
                        </td>

                        {/* School */}
                        <td className="p-4 text-muted-foreground font-medium">{row.school || "—"}</td>

                        {/* Solved */}
                        <td className="p-4 text-center">
                          <div className="text-base font-black text-purple-500 flex items-center justify-center gap-1">
                            <span>{row.solved_count}</span>
                            <span className="text-xs">🎈</span>
                          </div>
                        </td>

                        {/* Penalty */}
                        <td className="p-4 text-center font-mono font-bold text-muted-foreground">
                          {row.total_penalty} мин
                        </td>

                        {/* Problems */}
                        {problemsList.map((prob) => {
                          const res = row.problem_results.find((pr) => pr.problem_code === prob.code);
                          const isAc = res?.is_solved;
                          const hasAttempts = res && res.attempts > 0;

                          return (
                            <td key={prob.code} className="p-4 text-center font-mono">
                              {isAc ? (
                                <div className="inline-flex flex-col items-center">
                                  <span className="px-2 py-0.5 rounded-lg text-white font-black text-[11px] bg-emerald-500 shadow-xs">
                                    +{res.attempts}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground mt-0.5">{Math.round(res.time_minutes)}м</span>
                                </div>
                              ) : hasAttempts ? (
                                <span className="px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-500 font-bold text-[11px]">
                                  -{res.attempts}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/30 font-bold">.</span>
                              )}
                            </td>
                          );
                        })}
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

export default function TeamContestArenaPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
      </div>
    }>
      <TeamArenaContent />
    </Suspense>
  );
}
