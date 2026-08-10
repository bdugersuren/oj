"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { classroomApi } from "@/lib/api/classrooms";
import { problemApi } from "@/lib/api/problems";
import { lessonApi } from "@/lib/api/lessons";
import { 
  Users, BookOpen, Compass, BarChart3, TrendingUp, Sparkles, 
  Flame, Award, AlertCircle, RefreshCw 
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { motion } from "framer-motion";
import { RoleGate } from "@/components/role-gate";

export default function TeacherDashboard() {
  const { data: classrooms = [], isLoading: classroomsLoading, refetch: refetchClassrooms } = useQuery({
    queryKey: ["classrooms"],
    queryFn: classroomApi.list,
  });

  const { data: problems = [], isLoading: problemsLoading } = useQuery({
    queryKey: ["admin-problems"],
    queryFn: () => problemApi.list({ visible_only: false }),
  });

  const { data: lessons = [], isLoading: lessonsLoading } = useQuery({
    queryKey: ["admin-lessons"],
    queryFn: () => lessonApi.adminList(),
  });

  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const activeClassId = selectedClassId ?? classrooms[0]?.id ?? null;

  const { data: classroom, isLoading: classroomLoading } = useQuery({
    queryKey: ["classroom", activeClassId],
    queryFn: () => classroomApi.get(activeClassId!),
    enabled: activeClassId !== null,
  });

  const { data: heatmap = {} } = useQuery({
    queryKey: ["classroom-heatmap", activeClassId],
    queryFn: () => classroomApi.heatmap(activeClassId!),
    enabled: activeClassId !== null,
  });

  const { data: mastery = [] } = useQuery({
    queryKey: ["classroom-mastery", activeClassId],
    queryFn: () => classroomApi.mastery(activeClassId!),
    enabled: activeClassId !== null,
  });

  // Calculate totals
  const totalStudents = classrooms.reduce((acc, c) => acc + c.students_count, 0);
  const myProblems = problems.filter(p => p.is_visible); // or all
  const publishedLessons = lessons.filter(l => l.is_published);

  // Heatmap chart data
  const heatmapData = Object.entries(heatmap).map(([topic, count]) => ({
    name: topic,
    value: count,
  })).sort((a, b) => b.value - a.value).slice(0, 8);

  // Mastery chart data
  const masteryData = mastery.map(m => ({
    name: m.topic,
    solved: m.total_solved,
    attempted: m.total_attempted,
    percentage: Math.round(m.average_mastery),
  })).sort((a, b) => b.percentage - a.percentage).slice(0, 8);

  const colors = ["#00F2FE", "#4FACFE", "#00FF87", "#FF007F", "#F5A623", "#9B5DE5", "#FF5964", "#35A7FF"];

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { 
      opacity: 1, 
      y: 0, 
      transition: { duration: 0.4 } 
    }
  };

  return (
    <RoleGate roles={["teacher", "admin"]}>
      <div className="p-6 md:p-8 space-y-8 bg-background/50 min-h-screen">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-brand-cyan animate-pulse" />
              Багшийн хянах самбар
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Сургалтын үйл явц, систем ахиц болон аналитик мэдээлэл
            </p>
          </div>
          <div className="flex items-center gap-3">
            {classrooms.length > 0 && (
              <select
                value={activeClassId ?? ""}
                onChange={(e) => setSelectedClassId(Number(e.target.value))}
                className="bg-card border border-border text-foreground px-4 py-2 rounded-xl text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-cyan"
              >
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.students_count} сурагч)
                  </option>
                ))}
              </select>
            )}
            <Button variant="outline" size="icon" onClick={() => refetchClassrooms()} className="rounded-xl">
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          <motion.div variants={itemVariants}>
            <Card className="glass-strong border-white/5 shadow-md rounded-3xl relative overflow-hidden group hover:border-brand-cyan/20 transition-all">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-bold text-muted-foreground">Нийт сурагчид</CardTitle>
                <div className="p-2.5 bg-brand-cyan/10 rounded-2xl">
                  <Users className="w-5 h-5 text-brand-cyan" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black">{totalStudents}</div>
                <p className="text-xs text-muted-foreground mt-1">Бүх ангийн сурагчдын тоо</p>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-cyan to-blue-500 opacity-30 group-hover:opacity-100 transition-opacity" />
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="glass-strong border-white/5 shadow-md rounded-3xl relative overflow-hidden group hover:border-brand-emerald/20 transition-all">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-bold text-muted-foreground">Онолын хичээлүүд</CardTitle>
                <div className="p-2.5 bg-brand-emerald/10 rounded-2xl">
                  <BookOpen className="w-5 h-5 text-brand-emerald" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black">{lessons.length}</div>
                <p className="text-xs text-muted-foreground mt-1">{publishedLessons.length} нь нийтлэгдсэн</p>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-emerald to-teal-500 opacity-30 group-hover:opacity-100 transition-opacity" />
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="glass-strong border-white/5 shadow-md rounded-3xl relative overflow-hidden group hover:border-brand-violet/20 transition-all">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-bold text-muted-foreground">Бодлогын сан</CardTitle>
                <div className="p-2.5 bg-brand-violet/10 rounded-2xl">
                  <Compass className="w-5 h-5 text-brand-violet" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black">{problems.length}</div>
                <p className="text-xs text-muted-foreground mt-1">{myProblems.length} нь идэвхтэй харагдаж байна</p>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-violet to-purple-500 opacity-30 group-hover:opacity-100 transition-opacity" />
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="glass-strong border-white/5 shadow-md rounded-3xl relative overflow-hidden group hover:border-brand-amber/20 transition-all">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-bold text-muted-foreground">Нийт ангиуд</CardTitle>
                <div className="p-2.5 bg-brand-amber/10 rounded-2xl">
                  <BarChart3 className="w-5 h-5 text-brand-amber" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-black">{classrooms.length}</div>
                <p className="text-xs text-muted-foreground mt-1">Идэвхтэй удирдан чиглүүлж буй</p>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-amber to-orange-500 opacity-30 group-hover:opacity-100 transition-opacity" />
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* Analytics Section */}
        {activeClassId ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Charts Column (Left) */}
            <div className="lg:col-span-2 space-y-8">
              {/* Topic Mastery Chart */}
              <Card className="glass-strong border-white/5 shadow-md rounded-3xl p-6">
                <CardHeader className="px-0 pt-0">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-brand-cyan" />
                    Сэдвийн дундаж эзэмшилт (%)
                  </CardTitle>
                  <CardDescription>Ангийн сурагчдын алгоритмын сэдвүүдийг эзэмшсэн дундаж хувь</CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-0 h-80">
                  {masteryData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={masteryData} barSize={24}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: "rgba(30, 41, 59, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px" }}
                          labelStyle={{ fontWeight: "bold", color: "#fff" }}
                        />
                        <Bar dataKey="percentage" name="Эзэмшилт" radius={[8, 8, 0, 0]}>
                          {masteryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                      <AlertCircle className="w-8 h-8 text-muted-foreground/50" />
                      <span className="text-sm">Аналитик мэдээлэл хараахан цуглараагүй байна.</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Topic Heatmap (Failure heatmap) */}
              <Card className="glass-strong border-white/5 shadow-md rounded-3xl p-6">
                <CardHeader className="px-0 pt-0">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-rose-500" />
                    Бэрхшээлтэй сэдвүүд (Алдаатай бодолтууд)
                  </CardTitle>
                  <CardDescription>Сурагчид хамгийн их алдсан (WA, TLE, MLE) сэдвүүдийн жагсаалт</CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-0 h-80">
                  {heatmapData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={heatmapData} layout="vertical" barSize={16}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis dataKey="name" type="category" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={120} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: "rgba(30, 41, 59, 0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px" }}
                          labelStyle={{ fontWeight: "bold", color: "#fff" }}
                        />
                        <Bar dataKey="value" name="Алдааны тоо" fill="#FF5964" radius={[0, 8, 8, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                      <AlertCircle className="w-8 h-8 text-muted-foreground/50" />
                      <span className="text-sm">Алдааны өгөгдөл байхгүй байна.</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Students List Column (Right) */}
            <div>
              <Card className="glass-strong border-white/5 shadow-md rounded-3xl p-6 h-full flex flex-col">
                <CardHeader className="px-0 pt-0">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Award className="w-5 h-5 text-brand-amber" />
                    Сурагчдын идэвх
                  </CardTitle>
                  <CardDescription>Ангийн сурагчдын бодсон бодлогын тоо болон одоогийн XP</CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-0 flex-1 overflow-y-auto max-h-[680px] space-y-4">
                  {classroomLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-16 w-full bg-white/5 rounded-2xl animate-pulse" />
                      ))}
                    </div>
                  ) : classroom?.students && classroom.students.length > 0 ? (
                    classroom.students.map((student, idx) => (
                      <div 
                        key={student.student_id} 
                        className="flex items-center justify-between p-3.5 bg-white/5 rounded-2xl border border-white/5 hover:border-white/10 hover:bg-white/10 transition-all duration-200"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 flex items-center justify-center bg-white/10 text-muted-foreground rounded-lg text-xs font-bold shrink-0">
                            {idx + 1}
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-foreground truncate max-w-[120px]">
                              {student.full_name || student.username}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge className="text-[9px] px-1 py-0" style={{ backgroundColor: student.level_color || "#94a3b8" }}>
                                {student.level}
                              </Badge>
                              {student.current_streak > 0 && (
                                <span className="flex items-center gap-0.5 text-orange-500 font-bold text-xs">
                                  <Flame className="w-3.5 h-3.5 fill-current" />
                                  {student.current_streak}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-black text-brand-cyan">{student.total_xp.toLocaleString()} XP</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{student.solved_count} бодсон</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                      <Users className="w-8 h-8 text-muted-foreground/30" />
                      <span className="text-sm">Энэ ангид сурагч байхгүй байна.</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <Card className="glass-strong border-white/5 shadow-md rounded-3xl p-12 text-center flex flex-col items-center justify-center gap-4">
            <Users className="w-12 h-12 text-brand-cyan" />
            <div>
              <h3 className="text-lg font-bold text-foreground">Үүсгэсэн анги одоогоор байхгүй байна</h3>
              <p className="text-muted-foreground text-sm mt-1">Хянах самбарт аналитик харахын тулд эхлээд анги үүсгэнэ үү.</p>
            </div>
            <Link href="/teacher" className={buttonVariants({ className: "rounded-2xl bg-gradient-brand text-white font-bold" })}>
              Шинэ анги үүсгэх
            </Link>
          </Card>
        )}
      </div>
    </RoleGate>
  );
}
