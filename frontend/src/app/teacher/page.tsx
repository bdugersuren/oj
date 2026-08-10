"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Users, Check, X, Grid, FileText, CheckCircle2, BookOpen, Trash2, ArrowUp, ArrowDown, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { classroomApi } from "@/lib/api/classrooms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RoleGate } from "@/components/role-gate";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function TeacherPortalPage() {
  const client = useQueryClient();
  const { data: classrooms = [], isLoading } = useQuery({
    queryKey: ["classrooms"],
    queryFn: classroomApi.list,
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const classId = selectedId ?? classrooms[0]?.id ?? null;

  const { data: classroom } = useQuery({
    queryKey: ["classroom", classId],
    queryFn: () => classroomApi.get(classId!),
    enabled: classId !== null,
  });

  const { data: mastery = [] } = useQuery({
    queryKey: ["classroom", classId, "mastery"],
    queryFn: () => classroomApi.mastery(classId!),
    enabled: classId !== null,
  });

  const { data: matrixData } = useQuery({
    queryKey: ["classroom-matrix", classId],
    queryFn: () => classroomApi.progressMatrix(classId!),
    enabled: classId !== null,
  });

  const { data: classroomLessons = [], refetch: refetchClassroomLessons } = useQuery({
    queryKey: ["classroom-lessons", classId],
    queryFn: () => classroomApi.listLessons(classId!),
    enabled: classId !== null,
  });

  const { data: availableLessons = [], refetch: refetchAvailableLessons } = useQuery({
    queryKey: ["available-lessons", classId],
    queryFn: () => classroomApi.listAvailableLessons(classId!),
    enabled: classId !== null,
  });

  const linkLessonMutation = useMutation({
    mutationFn: (lessonId: number) => classroomApi.linkLesson(classId!, lessonId),
    onSuccess: () => {
      void refetchClassroomLessons();
      void refetchAvailableLessons();
      void client.invalidateQueries({ queryKey: ["classroom-matrix", classId] });
      toast.success("Хичээлийг ангид холболоо.");
    },
    onError: () => toast.error("Холбоход алдаа гарлаа.")
  });

  const unlinkLessonMutation = useMutation({
    mutationFn: (lessonId: number) => classroomApi.unlinkLesson(classId!, lessonId),
    onSuccess: () => {
      void refetchClassroomLessons();
      void refetchAvailableLessons();
      void client.invalidateQueries({ queryKey: ["classroom-matrix", classId] });
      toast.success("Хичээлийн холбоосыг салгалаа.");
    },
    onError: () => toast.error("Холбоос салгахад алдаа гарлаа.")
  });

  const updateLessonPropertiesMutation = useMutation({
    mutationFn: ({ lessonId, data }: { lessonId: number; data: { order?: number; is_published?: boolean } }) => 
      classroomApi.updateLessonProperties(classId!, lessonId, data),
    onSuccess: () => {
      void refetchClassroomLessons();
      void client.invalidateQueries({ queryKey: ["classroom-matrix", classId] });
    },
    onError: () => toast.error("Тохиргоог өөрчлөхөд алдаа гарлаа.")
  });

  const handleMoveLesson = async (index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= classroomLessons.length) return;

    const currentLesson = classroomLessons[index];
    const siblingLesson = classroomLessons[nextIndex];

    const currentOrder = currentLesson.order;
    const siblingOrder = siblingLesson.order;

    try {
      await classroomApi.updateLessonProperties(classId!, currentLesson.id, { order: siblingOrder });
      await classroomApi.updateLessonProperties(classId!, siblingLesson.id, { order: currentOrder });
      void refetchClassroomLessons();
    } catch {
      toast.error("Дараалал солиход алдаа гарлаа.");
    }
  };

  const [activeTab, setActiveTab] = useState<"overview" | "requests" | "matrix" | "lessons">("overview");
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () => classroomApi.create(name),
    onSuccess: () => {
      setName("");
      void client.invalidateQueries({ queryKey: ["classrooms"] });
      toast.success("Анги үүслээ.");
    },
    onError: () => toast.error("Анги үүсгэхэд алдаа гарлаа."),
  });

  const approveMutation = useMutation({
    mutationFn: (studentId: string) => classroomApi.approve(classId!, studentId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["classroom", classId] });
      void client.invalidateQueries({ queryKey: ["classroom-matrix", classId] });
      toast.success("Элсэх хүсэлтийг зөвшөөрлөө.");
    },
    onError: () => toast.error("Хүсэлт зөвшөөрөхөд алдаа гарлаа.")
  });

  const rejectMutation = useMutation({
    mutationFn: (studentId: string) => classroomApi.reject(classId!, studentId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["classroom", classId] });
      toast.success("Хүсэлтийг цуцаллаа.");
    },
    onError: () => toast.error("Цуцлахад алдаа гарлаа.")
  });

  const download = async () => {
    if (!classId) return;
    try {
      const blob = await classroomApi.exportReport(classId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `classroom-${classId}-report.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Тайлан татаж чадсангүй.");
    }
  };

  return (
    <RoleGate roles={["teacher", "admin"]}>
      <div className="min-h-screen bg-background text-foreground pb-20">
        <main className="max-w-7xl mx-auto px-4 pt-8 space-y-8">
          
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black flex items-center gap-3">
                <Users className="w-8 h-8 text-brand-cyan" />
                Багшийн самбар (Teacher Portal)
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Ангийн ахиц, сурагчдын идэвх ба сэдвийн эзэмшилтийн шинжилгээ
              </p>
            </div>
            <Button
              variant="outline"
              onClick={download}
              disabled={!classId}
              className="h-10 rounded-xl font-bold border-border/80 hover:bg-secondary/40"
            >
              <Download className="w-4 h-4 mr-2" /> CSV тайлан татах
            </Button>
          </div>

          {/* Classrooms Selector & Add Class */}
          <div className="flex gap-4 flex-wrap items-center">
            {classrooms.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedId(item.id);
                  setActiveTab("overview");
                }}
                className={`rounded-2xl border p-4 text-left min-w-[200px] transition-all cursor-pointer ${
                  item.id === classId
                    ? "border-brand-cyan bg-brand-cyan/5 shadow-xs"
                    : "border-border/60 hover:bg-secondary/40"
                }`}
              >
                <b className="text-sm font-black block text-foreground">{item.name}</b>
                <p className="text-xs text-muted-foreground mt-1">
                  {item.students_count} сурагч · Код: <span className="font-mono font-bold text-foreground">{item.invite_code}</span>
                </p>
              </button>
            ))}

            <div className="flex gap-2 items-center bg-card/40 border border-border/60 p-2 rounded-2xl">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Шинэ ангийн нэр..."
                className="h-9 rounded-xl text-xs bg-surface-1/50 border-none w-48 focus-visible:ring-1"
              />
              <Button
                size="sm"
                onClick={() => name && create.mutate()}
                disabled={create.isPending || !name}
                className="h-9 rounded-xl gradient-brand text-white font-bold border-0 shadow-xs cursor-pointer text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Үүсгэх
              </Button>
            </div>
          </div>

          {isLoading && (
            <div className="space-y-3 animate-pulse">
              <div className="h-12 w-full bg-secondary/50 rounded-2xl" />
              <div className="h-48 w-full bg-secondary/30 rounded-2xl" />
            </div>
          )}

          {classroom && (
            <div className="space-y-6">
              
              {/* Classroom Overview */}
              <section className="glass-md rounded-3xl border border-border/60 p-6 md:p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-brand-cyan/10 to-brand-violet/10 rounded-full blur-3xl pointer-events-none" />
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                  <div>
                    <h2 className="text-2xl font-black">{classroom.name}</h2>
                    <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
                      {classroom.description || "Энэ ангид одоогоор тайлбар ороогүй байна."}
                    </p>
                    <div className="mt-4 flex items-center gap-4 text-xs font-semibold">
                      <span>Урилгын код: <b className="text-brand-cyan font-mono text-sm">{classroom.invite_code}</b></span>
                      <span className="text-muted-foreground">|</span>
                      <span>{classroom.students_count} сурагч баталгаажсан</span>
                    </div>
                  </div>

                  {/* Custom Tab Toggles */}
                  <div className="flex bg-secondary/65 border border-border/40 p-1 rounded-2xl gap-1 shrink-0">
                    <button
                      onClick={() => setActiveTab("overview")}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        activeTab === "overview"
                          ? "bg-card text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" /> Аналитик & Сурагчид
                    </button>
                    
                    <button
                      onClick={() => setActiveTab("requests")}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 relative ${
                        activeTab === "requests"
                          ? "bg-card text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" /> Хүсэлтүүд
                      {classroom.pending_requests && classroom.pending_requests.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[9px] font-black leading-none">
                          {classroom.pending_requests.length}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => setActiveTab("matrix")}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        activeTab === "matrix"
                          ? "bg-card text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Grid className="w-3.5 h-3.5" /> Явцын Матриц
                    </button>

                    <button
                      onClick={() => {
                        setActiveTab("lessons");
                        void refetchClassroomLessons();
                        void refetchAvailableLessons();
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                        activeTab === "lessons"
                          ? "bg-card text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5" /> Хичээлүүд
                    </button>
                  </div>
                </div>
              </section>

              {/* TAB 1: Overview & Analytics */}
              {activeTab === "overview" && (
                <section className="grid md:grid-cols-2 gap-6">
                  
                  {/* Topic Mastery */}
                  <div className="glass-strong rounded-3xl border border-border/60 p-6 space-y-4">
                    <h3 className="text-sm font-black text-muted-foreground uppercase tracking-wider">
                      Сэдвийн дундаж эзэмшилт (Topic Mastery)
                    </h3>
                    <div className="space-y-4 pt-2">
                      {mastery.map((item) => (
                        <div key={item.topic} className="space-y-1">
                          <div className="flex justify-between text-xs font-bold text-foreground">
                            <span>{item.topic}</span>
                            <span className="text-brand-cyan">{item.average_mastery}%</span>
                          </div>
                          <Progress value={item.average_mastery} className="h-1.5 bg-secondary" />
                        </div>
                      ))}
                      {mastery.length === 0 && (
                        <p className="text-xs text-muted-foreground py-6 text-center">
                          Сэдвийн аналитик өгөгдөл одоогоор алга.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Students Progress */}
                  <div className="glass-strong rounded-3xl border border-border/60 p-6">
                    <h3 className="text-sm font-black text-muted-foreground uppercase tracking-wider mb-4">
                      Идэвхтэй сурагчид ({classroom.students.length})
                    </h3>
                    <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 scrollbar-thin">
                      {classroom.students.map((student) => (
                        <div
                          key={student.student_id}
                          className="flex justify-between items-center border-b border-border/40 pb-3 last:border-0 text-xs"
                        >
                          <div>
                            <b className="text-sm font-black text-foreground block">
                              {student.full_name || student.username}
                            </b>
                            <span className="text-[10px] text-muted-foreground font-mono block mt-0.5">
                              @{student.username} · {student.level}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-black text-foreground block">{student.solved_count} бодлого</span>
                            <span className="text-[10px] text-brand-cyan font-bold block mt-0.5">
                              {student.total_xp.toLocaleString()} XP
                            </span>
                          </div>
                        </div>
                      ))}
                      
                      {classroom.students.length === 0 && (
                        <p className="text-xs text-muted-foreground py-10 text-center">
                          Энэ ангид одоогоор элссэн сурагч байхгүй байна.
                        </p>
                      )}
                    </div>
                  </div>

                </section>
              )}

              {/* TAB 2: Pending Join Requests */}
              {activeTab === "requests" && (
                <section className="glass-strong rounded-3xl border border-border/60 p-6 space-y-4">
                  <h3 className="text-sm font-black text-muted-foreground uppercase tracking-wider">
                    Элсэх хүсэлтүүд ({classroom.pending_requests?.length || 0})
                  </h3>

                  <div className="space-y-3 pt-2">
                    {classroom.pending_requests?.map((student) => (
                      <div
                        key={student.student_id}
                        className="flex items-center justify-between border-b border-border/40 pb-4 last:border-0"
                      >
                        <div className="space-y-1">
                          <b className="text-sm font-black text-foreground block">
                            {student.full_name || student.username}
                          </b>
                          <p className="text-xs text-muted-foreground">
                            @{student.username} · {student.email}
                          </p>
                          <span className="text-[10px] text-muted-foreground font-mono block">
                            Хүсэлт өгсөн: {new Date(student.joined_at).toLocaleString()}
                          </span>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 h-9 rounded-xl font-bold text-xs"
                            onClick={() => approveMutation.mutate(student.student_id)}
                            disabled={approveMutation.isPending}
                          >
                            <Check className="w-3.5 h-3.5 mr-1" /> Батлах
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-500 hover:bg-rose-500/10 h-9 rounded-xl font-bold text-xs"
                            onClick={() => rejectMutation.mutate(student.student_id)}
                            disabled={rejectMutation.isPending}
                          >
                            <X className="w-3.5 h-3.5 mr-1" /> Татгалзах
                          </Button>
                        </div>
                      </div>
                    ))}

                    {(!classroom.pending_requests || classroom.pending_requests.length === 0) && (
                      <p className="text-xs text-muted-foreground py-10 text-center">
                        Шинээр элсэх хүсэлт байхгүй байна.
                      </p>
                    )}
                  </div>
                </section>
              )}

              {/* TAB 3: Progress Matrix Heatmap */}
              {activeTab === "matrix" && (
                <section className="glass-strong rounded-3xl border border-border/60 p-6 space-y-4 overflow-hidden">
                  <h3 className="text-sm font-black text-muted-foreground uppercase tracking-wider">
                    Ангийн явцын матриц
                  </h3>
                  
                  {matrixData && matrixData.lessons.length > 0 && matrixData.students.length > 0 ? (
                    <div className="overflow-x-auto border border-border/50 rounded-2xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-secondary/40 border-b border-border">
                            <th className="p-3 font-bold text-foreground min-w-[200px] sticky left-0 bg-background/95 backdrop-blur-xs">Сурагчийн нэр</th>
                            {matrixData.lessons.map((lesson) => (
                              <th key={lesson.id} className="p-3 font-bold text-muted-foreground min-w-[120px] text-center border-l border-border/40">
                                <span className="line-clamp-1 max-w-[110px]" title={lesson.title}>{lesson.title}</span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {matrixData.students.map((student) => (
                            <tr key={student.student_id} className="border-b border-border/40 hover:bg-secondary/20 transition-colors">
                              <td className="p-3 font-bold text-foreground sticky left-0 bg-background/95 backdrop-blur-xs">
                                <div>{student.full_name}</div>
                                <div className="text-[10px] font-mono text-muted-foreground">@{student.username}</div>
                              </td>
                              {matrixData.lessons.map((lesson) => {
                                const prog = student.lesson_progress[lesson.id];
                                const isCompleted = prog?.is_completed;
                                const score = prog?.quiz_score ?? 0;
                                return (
                                  <td key={lesson.id} className="p-3 text-center border-l border-border/40">
                                    {isCompleted ? (
                                      <div className="inline-flex flex-col items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 px-2.5 py-1 rounded-lg">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span className="text-[9px] font-black mt-0.5">{score} оноо</span>
                                      </div>
                                    ) : (
                                      <div className="inline-flex flex-col items-center justify-center bg-secondary/30 border border-border/40 text-muted-foreground px-2.5 py-1 rounded-lg">
                                        <span className="text-[10px] font-bold">—</span>
                                        <span className="text-[9px] text-muted-foreground/60 mt-0.5">дуусаагүй</span>
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-10 text-center">
                      Матриц харуулахад хангалттай өгөгдөл алга (Хичээл эсвэл Сурагчид бүртгэлгүй байна).
                    </p>
                  )}
                </section>
              )}

              {/* TAB 4: Classroom Lessons (Pattern 3) */}
              {activeTab === "lessons" && (
                <section className="glass-strong rounded-3xl border border-border/60 p-6 space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <h3 className="text-sm font-black text-muted-foreground uppercase tracking-wider">
                        Ангийн хичээлүүд ({classroomLessons.length})
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Энэ ангийн сурагчдын үзэх хичээлүүд болон тэдгээрийн харагдах дараалал
                      </p>
                    </div>
                    
                    {/* Link Lesson Modal trigger */}
                    <Dialog>
                      <DialogTrigger>
                        <Button
                          size="sm"
                          className="h-9 rounded-xl gradient-brand text-white font-bold text-xs cursor-pointer shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1.5" /> Хичээл холбох
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md bg-card/95 border border-white/5 text-foreground">
                        <DialogHeader>
                          <DialogTitle className="text-base font-black">Хичээл холбох</DialogTitle>
                          <DialogDescription className="text-xs text-muted-foreground">
                            Таны бэлтгэсэн хичээлүүдээс энэ ангид судалж болохоор нэмэх:
                          </DialogDescription>
                        </DialogHeader>
                        
                        <div className="mt-4 max-h-[300px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                          {availableLessons.map((l) => (
                            <div key={l.id} className="flex justify-between items-center bg-white/5 border border-white/5 p-3 rounded-xl hover:bg-white/10 transition-colors">
                              <div>
                                <b className="text-xs font-bold block">{l.title}</b>
                                <span className="text-[10px] text-muted-foreground font-semibold">{l.topic} · {l.difficulty}</span>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2.5 rounded-lg border-border/60 text-[10px] font-bold cursor-pointer"
                                onClick={() => linkLessonMutation.mutate(l.id)}
                                disabled={linkLessonMutation.isPending}
                              >
                                Холбох
                              </Button>
                            </div>
                          ))}
                          {availableLessons.length === 0 && (
                            <p className="text-xs text-center text-muted-foreground py-6">
                              Холбох боломжтой шинэ хичээл байхгүй байна.
                            </p>
                          )}
                        </div>
                        
                        <DialogFooter className="mt-6">
                          <DialogClose>
                            <Button variant="outline" className="h-9 rounded-xl text-xs font-bold cursor-pointer">Хаах</Button>
                          </DialogClose>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>

                  <div className="space-y-3">
                    {classroomLessons.map((item, index) => (
                      <div
                        key={item.id}
                        className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white/5 border border-white/5 p-4 rounded-2xl animate-fade-in"
                      >
                        <div className="flex items-center gap-3">
                          {/* Reordering Controls */}
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => handleMoveLesson(index, "up")}
                              disabled={index === 0}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors cursor-pointer"
                              title="Дээшлүүлэх"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleMoveLesson(index, "down")}
                              disabled={index === classroomLessons.length - 1}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors cursor-pointer"
                              title="Доошлуулах"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          
                          <div>
                            <div className="flex items-center gap-2">
                              <b className="text-sm font-black text-foreground">{item.title}</b>
                              {!item.is_published && (
                                <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[9px] font-bold px-1.5 py-0.5">
                                  Ноорог (Сурагчдад харагдахгүй)
                                </Badge>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground block mt-0.5">
                              {item.category} · {item.topic} · {item.difficulty}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 self-end sm:self-auto">
                          {/* Publish/Unpublish toggle */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className={`h-8 px-2.5 rounded-lg text-xs font-semibold cursor-pointer ${
                              item.is_published ? "text-emerald-500" : "text-amber-500"
                            }`}
                            onClick={() => updateLessonPropertiesMutation.mutate({
                              lessonId: item.id,
                              data: { is_published: !item.is_published }
                            })}
                            disabled={updateLessonPropertiesMutation.isPending}
                            title={item.is_published ? "Нуух" : "Нийтлэх"}
                          >
                            {item.is_published ? (
                              <Eye className="w-4 h-4 mr-1.5" />
                            ) : (
                              <EyeOff className="w-4 h-4 mr-1.5" />
                            )}
                            {item.is_published ? "Нээлттэй" : "Нууцлагдсан"}
                          </Button>

                          {/* Unlink button */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-500 hover:bg-rose-500/10 h-8 px-2.5 rounded-lg text-xs font-semibold cursor-pointer"
                            onClick={() => unlinkLessonMutation.mutate(item.id)}
                            disabled={unlinkLessonMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4 mr-1.5" /> Салгах
                          </Button>
                        </div>
                      </div>
                    ))}

                    {classroomLessons.length === 0 && (
                      <p className="text-xs text-muted-foreground py-12 text-center">
                        Энэ ангид одоогоор ямар нэг хичээл холбогдоогүй байна. "Хичээл холбох" товчийг ашиглан хичээлүүд нэмнэ үү.
                      </p>
                    )}
                  </div>
                </section>
              )}

            </div>
          )}

        </main>
      </div>
    </RoleGate>
  );
}
