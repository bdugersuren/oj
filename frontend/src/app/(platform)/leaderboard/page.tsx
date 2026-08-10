"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Trophy, Medal, Flame, Star,
  Search, Crown, Sparkles, TrendingUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { progressApi } from "@/lib/api/progress";
import { useAuthStore } from "@/store/auth";

interface LeaderboardUser {
  rank: number;
  username: string;
  name: string;
  level: string;
  levelColor: string;
  totalXp: number;
  solvedCount: number;
  streak: number;
  isCurrentUser?: boolean;
}

export default function LeaderboardPage() {
  const currentUser = useAuthStore((state) => state.user);
  const { data = [], isLoading } = useQuery({ queryKey: ["leaderboard"], queryFn: progressApi.leaderboard });
  const leaderboard: LeaderboardUser[] = data.map((entry) => ({ rank: entry.rank, username: entry.username, name: entry.full_name ?? entry.username, level: entry.level, levelColor: entry.level_color, totalXp: entry.total_xp, solvedCount: entry.solved_count, streak: entry.streak, isCurrentUser: entry.username === currentUser?.username }));
  const topThree = leaderboard.slice(0, 3);

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* ── Main Content ── */}
      <main className="max-w-4xl mx-auto px-4 pt-8">
        
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-black flex items-center gap-3">
            <Trophy className="w-8 h-8 text-brand-amber" />
            Ерөнхий Рейтинг (Leaderboard)
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Платформын шилдэг алгоритмчид ба сурагчид
          </p>
        </div>
        {isLoading && <p className="text-center text-sm text-muted-foreground">Рейтинг ачаалж байна…</p>}
        {!isLoading && topThree.length < 3 && <p className="text-center text-sm text-muted-foreground">Рейтинг харуулах хангалттай өгөгдөл алга.</p>}
        {topThree.length >= 3 && <>
        {/* Podium Top 3 */}
        <div className="grid grid-cols-3 gap-4 items-end mb-12 max-w-2xl mx-auto">
          {/* 2nd Place */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center"
          >
            <Avatar className="w-16 h-16 border-2 border-slate-300 ring-4 ring-slate-300/20 mb-3">
              <AvatarFallback className="bg-surface-2 font-bold text-slate-300">2</AvatarFallback>
            </Avatar>
            <div className="text-center font-bold text-xs truncate max-w-[100px]">{topThree[1].username}</div>
            <div className="text-[10px] text-muted-foreground font-mono">{topThree[1].totalXp.toLocaleString()} XP</div>
            <div className="h-28 w-full glass-md rounded-t-2xl mt-3 flex items-center justify-center border-t-4 border-slate-300">
              <Medal className="w-8 h-8 text-slate-300" />
            </div>
          </motion.div>

          {/* 1st Place */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col items-center"
          >
            <Crown className="w-8 h-8 text-amber-400 mb-1 animate-bounce" />
            <Avatar className="w-20 h-20 border-4 border-amber-400 ring-4 ring-amber-400/30 mb-3">
              <AvatarFallback className="gradient-brand font-black text-white text-xl">1</AvatarFallback>
            </Avatar>
            <div className="text-center font-black text-sm text-amber-400 truncate max-w-[120px]">{topThree[0].username}</div>
            <div className="text-xs text-muted-foreground font-mono font-bold">{topThree[0].totalXp.toLocaleString()} XP</div>
            <div className="h-36 w-full glass-strong rounded-t-2xl mt-3 flex items-center justify-center border-t-4 border-amber-400 bg-amber-500/10">
              <Trophy className="w-10 h-10 text-amber-400" />
            </div>
          </motion.div>

          {/* 3rd Place */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col items-center"
          >
            <Avatar className="w-14 h-14 border-2 border-amber-700 ring-4 ring-amber-700/20 mb-3">
              <AvatarFallback className="bg-surface-2 font-bold text-amber-700">3</AvatarFallback>
            </Avatar>
            <div className="text-center font-bold text-xs truncate max-w-[100px]">{topThree[2].username}</div>
            <div className="text-[10px] text-muted-foreground font-mono">{topThree[2].totalXp.toLocaleString()} XP</div>
            <div className="h-20 w-full glass-md rounded-t-2xl mt-3 flex items-center justify-center border-t-4 border-amber-700">
              <Medal className="w-7 h-7 text-amber-700" />
            </div>
          </motion.div>
        </div>

        {/* Full Table */}
        <div className="glass-strong rounded-2xl overflow-hidden border border-white/10">
          <div className="grid grid-cols-12 gap-4 px-6 py-3.5 border-b border-white/10 text-xs font-semibold text-muted-foreground uppercase bg-surface-1/50">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-4">Сурагч</div>
            <div className="col-span-3">Цол / Түвшин</div>
            <div className="col-span-2 text-center">Бодсон</div>
            <div className="col-span-2 text-right">Нийт XP</div>
          </div>

          <div className="divide-y divide-white/5">
            {leaderboard.map((user) => (
              <div
                key={user.username}
                className={`grid grid-cols-12 gap-4 px-6 py-4 items-center transition-colors ${
                  user.isCurrentUser ? "bg-brand-cyan/10 border-l-4 border-brand-cyan" : "hover:bg-white/5"
                }`}
              >
                <div className="col-span-1 text-center font-mono font-black text-sm">
                  {user.rank <= 3 ? (
                    <span className="text-amber-400">#{user.rank}</span>
                  ) : (
                    <span className="text-muted-foreground">#{user.rank}</span>
                  )}
                </div>

                <div className="col-span-4 flex items-center gap-3">
                  <Avatar className="w-9 h-9">
                    <AvatarFallback className="bg-surface-3 text-xs font-bold">
                      {user.username[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-bold text-sm text-foreground flex items-center gap-2">
                      {user.username}
                      {user.streak >= 5 && (
                        <span className="text-xs text-amber-400 font-mono flex items-center">
                          <Flame className="w-3.5 h-3.5" />{user.streak}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{user.name}</div>
                  </div>
                </div>

                <div className="col-span-3">
                  <Badge variant="outline" className="text-xs font-semibold px-2.5 py-0.5" style={{ color: user.levelColor, borderColor: user.levelColor + "40", background: user.levelColor + "15" }}>
                    <Star className="w-3 h-3 mr-1" /> {user.level}
                  </Badge>
                </div>

                <div className="col-span-2 text-center font-mono text-xs text-muted-foreground">
                  <strong className="text-foreground">{user.solvedCount}</strong> бодлого
                </div>

                <div className="col-span-2 text-right font-mono text-xs font-black text-brand-cyan">
                  {user.totalXp.toLocaleString()} XP
                </div>
              </div>
            ))}
          </div>
        </div>
        </>}
      </main>
    </div>
  );
}
