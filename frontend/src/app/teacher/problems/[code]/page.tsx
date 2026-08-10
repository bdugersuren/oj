"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { problemApi } from "@/lib/api/problems";
import { 
  ArrowLeft, Save, Sparkles, AlertCircle, FileText, Upload, 
  Trash2, Plus, Edit2, Check, RefreshCw, Layers 
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TipTapEditor } from "@/components/tiptap-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import toast from "react-hot-toast";
import { RoleGate } from "@/components/role-gate";
import { useAuthStore } from "@/store/auth";
import { PreviewModal } from "@/components/shared/preview-modal";

export default function EditProblemPage() {
  const { code } = useParams() as { code: string };
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data: problem, isLoading, refetch } = useQuery({
    queryKey: ["edit-problem", code],
    queryFn: () => problemApi.get(code),
  });

  const [formData, setFormData] = useState<any>({
    title: "",
    difficulty: "Bronze",
    topic: "Brute Force",
    time_limit: 1.0,
    memory_limit: 64,
    points: 100,
    xp_reward: 20,
    olympiad_scope: "TRAINING",
    division: "SENIOR",
    olympiad_year: 2026,
    source_citation: "",
    is_visible: true,
  });

  const [statement, setStatement] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  // Hint Management state
  const [hints, setHints] = useState<any[]>([]);
  const [newHint, setNewHint] = useState({
    level: 1,
    title: "",
    hint_text: "",
    xp_penalty: 5,
  });
  const [editingHintId, setEditingHintId] = useState<number | null>(null);

  useEffect(() => {
    if (problem) {
      setFormData({
        title: problem.title,
        difficulty: problem.difficulty,
        topic: problem.topic,
        time_limit: problem.time_limit,
        memory_limit: problem.memory_limit,
        points: problem.points,
        xp_reward: problem.xp_reward,
        olympiad_scope: problem.olympiad_scope,
        division: problem.division,
        olympiad_year: problem.olympiad_year ?? 2026,
        source_citation: problem.source_citation ?? "",
        is_visible: problem.is_visible,
      });
      setStatement(problem.statement_markdown || "");
      setHints(problem.hints || []);
    }
  }, [problem]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => problemApi.update(code, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["edit-problem", code] });
      toast.success("Бодлогын мэдээлэл шинэчлэгдлээ.");
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Алдаа гарлаа.";
      toast.error(msg);
    }
  });

  const uploadPdfMutation = useMutation({
    mutationFn: (file: File) => problemApi.uploadPdf(code, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["edit-problem", code] });
      toast.success("PDF амжилттай байршлаа.");
      setPdfFile(null);
    },
    onError: () => toast.error("PDF оруулахад алдаа гарлаа.")
  });

  const addHintMutation = useMutation({
    mutationFn: (data: any) => problemApi.addHint(code, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["edit-problem", code] });
      toast.success("Зөвлөмж нэмэгдлээ.");
      setNewHint({ level: 1, title: "", hint_text: "", xp_penalty: 5 });
    },
    onError: () => toast.error("Зөвлөмж нэмэхэд алдаа гарлаа.")
  });

  const updateHintMutation = useMutation({
    mutationFn: ({ id, data }: { id: number, data: any }) => problemApi.updateHint(code, id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["edit-problem", code] });
      toast.success("Зөвлөмж шинэчлэгдлээ.");
      setEditingHintId(null);
    },
    onError: () => toast.error("Зөвлөмж засварлахад алдаа гарлаа.")
  });

  const deleteHintMutation = useMutation({
    mutationFn: (id: number) => problemApi.deleteHint(code, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["edit-problem", code] });
      toast.success("Зөвлөмж устлаа.");
    },
    onError: () => toast.error("Зөвлөмж устгахад алдаа гарлаа.")
  });

  const handleSubmitGeneral = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const handleSaveStatement = () => {
    updateMutation.mutate({ statement_markdown: statement });
  };

  const handlePdfUpload = () => {
    if (pdfFile) {
      uploadPdfMutation.mutate(pdfFile);
    }
  };

  const handleAddHint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHint.title.trim()) return toast.error("Гарчиг оруулна уу.");
    if (!newHint.hint_text.trim()) return toast.error("Агуулга оруулна уу.");
    addHintMutation.mutate(newHint);
  };

  const handleSaveEditHint = (hintId: number) => {
    const hint = hints.find(h => h.id === hintId);
    if (!hint.title.trim() || !hint.hint_text.trim()) return toast.error("Гарчиг болон агуулга оруулна уу.");
    updateHintMutation.mutate({
      id: hintId,
      data: {
        level: hint.level,
        title: hint.title,
        hint_text: hint.hint_text,
        xp_penalty: hint.xp_penalty,
      }
    });
  };

  const handleHintChange = (hintId: number, field: string, value: any) => {
    setHints(prev => prev.map(h => h.id === hintId ? { ...h, [field]: value } : h));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 text-brand-cyan animate-spin" />
      </div>
    );
  }

  const isOwner = user?.role === "admin" || problem?.created_by_id === user?.id;

  return (
    <RoleGate roles={["teacher", "admin"]}>
      <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto bg-background/50 min-h-screen">
        {/* Back Link */}
        <Link href="/teacher/problems" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-all">
          <ArrowLeft className="w-4 h-4" />
          Бодлогын жагсаалт
        </Link>

        {/* Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-brand-cyan" />
              Бодлого засах: <span className="text-brand-violet">{code}</span>
            </h1>
            <p className="text-muted-foreground text-xs mt-1">
              Үндсэн тохиргоо, өгүүлбэр, тест кэйсүүд болон шаталсан зөвлөмжүүд
            </p>
          </div>
          <Link href={`/teacher/problems/${code}/testcases`} className={buttonVariants({ variant: "outline", className: "rounded-xl border-white/10 hover:bg-white/5 text-xs font-bold shrink-0" })}>
            <Layers className="w-4 h-4 mr-2" /> Тест кэйс удирдлага
          </Link>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="bg-secondary/40 p-1 rounded-2xl border border-white/5">
            <TabsTrigger value="general" className="rounded-xl px-4 py-2 text-xs font-bold">Үндсэн тохиргоо</TabsTrigger>
            <TabsTrigger value="statement" className="rounded-xl px-4 py-2 text-xs font-bold">Өгүүлбэр (Statement)</TabsTrigger>
            <TabsTrigger value="hints" className="rounded-xl px-4 py-2 text-xs font-bold">Зөвлөмжүүд (Hints)</TabsTrigger>
          </TabsList>

          {/* Tab 1: General */}
          <TabsContent value="general">
            <form onSubmit={handleSubmitGeneral} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-strong border-white/5 p-6 rounded-3xl space-y-4">
                <h3 className="text-sm font-bold text-brand-cyan uppercase tracking-wider mb-2">Үндсэн мэдээлэл</h3>
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-xs font-bold">Бодлогын нэр</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="h-10 rounded-xl bg-card"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Хүндрэлийн түвшин</Label>
                    <select
                      value={formData.difficulty}
                      onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
                      className="w-full bg-card border border-border text-foreground px-3 py-2.5 rounded-xl text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-brand-cyan"
                    >
                      <option value="Bronze">Bronze</option>
                      <option value="Silver">Silver</option>
                      <option value="Gold">Gold</option>
                      <option value="Platinum">Platinum</option>
                      <option value="Diamond">Diamond</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="topic" className="text-xs font-bold">Сэдэв</Label>
                    <Input
                      id="topic"
                      value={formData.topic}
                      onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                      className="h-10 rounded-xl bg-card"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="time_limit" className="text-xs font-bold">Цагийн хязгаар (сек)</Label>
                    <Input
                      id="time_limit"
                      type="number"
                      step="0.1"
                      value={formData.time_limit}
                      onChange={(e) => setFormData({ ...formData, time_limit: parseFloat(e.target.value) })}
                      className="h-10 rounded-xl bg-card font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="memory_limit" className="text-xs font-bold">Санах ойн хязгаар (МБ)</Label>
                    <Input
                      id="memory_limit"
                      type="number"
                      value={formData.memory_limit}
                      onChange={(e) => setFormData({ ...formData, memory_limit: parseInt(e.target.value) })}
                      className="h-10 rounded-xl bg-card font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="points" className="text-xs font-bold">Оноо</Label>
                    <Input
                      id="points"
                      type="number"
                      value={formData.points}
                      onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) })}
                      className="h-10 rounded-xl bg-card font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="xp_reward" className="text-xs font-bold">XP шагнал</Label>
                    <Input
                      id="xp_reward"
                      type="number"
                      value={formData.xp_reward}
                      onChange={(e) => setFormData({ ...formData, xp_reward: parseInt(e.target.value) })}
                      className="h-10 rounded-xl bg-card font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="glass-strong border-white/5 p-6 rounded-3xl space-y-4">
                <h3 className="text-sm font-bold text-brand-violet uppercase tracking-wider mb-2">Олимпиадын мэдээлэл</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Хамрах хүрээ</Label>
                    <select
                      value={formData.olympiad_scope}
                      onChange={(e) => setFormData({ ...formData, olympiad_scope: e.target.value })}
                      className="w-full bg-card border border-border text-foreground px-3 py-2.5 rounded-xl text-sm font-semibold"
                    >
                      <option value="Сургалтын Дасгал">Сургалтын Дасгал</option>
                      <option value="Дүүрэг / Сургууль">Дүүрэг / Сургууль</option>
                      <option value="Аймаг / Нийслэл">Аймаг / Нийслэл</option>
                      <option value="Улсын Олимпиад (Finals)">Улсын Олимпиад (Finals)</option>
                      <option value="Олон Улс (IOI, APIO)">Олон Улс (IOI, APIO)</option>
                      <option value="Их Дээд Сургууль (ICPC)">Их Дээд Сургууль (ICPC)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Ангилал</Label>
                    <select
                      value={formData.division}
                      onChange={(e) => setFormData({ ...formData, division: e.target.value })}
                      className="w-full bg-card border border-border text-foreground px-3 py-2.5 rounded-xl text-sm font-semibold"
                    >
                      <option value="Ерөнхий">Ерөнхий</option>
                      <option value="Бага анги (3-5 анги)">Бага анги (3-5 анги)</option>
                      <option value="Дунд анги (6-9 анги)">Дунд анги (6-9 анги)</option>
                      <option value="Ахлах анги (10-12 анги)">Ахлах анги (10-12 анги)</option>
                      <option value="Багш нарын ангилал">Багш нарын ангилал</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="olympiad_year" className="text-xs font-bold">Хийгдсэн он</Label>
                    <Input
                      id="olympiad_year"
                      type="number"
                      value={formData.olympiad_year}
                      onChange={(e) => setFormData({ ...formData, olympiad_year: parseInt(e.target.value) })}
                      className="h-10 rounded-xl bg-card"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="source_citation" className="text-xs font-bold">Их сурвалж дурдалт</Label>
                    <Input
                      id="source_citation"
                      value={formData.source_citation}
                      onChange={(e) => setFormData({ ...formData, source_citation: e.target.value })}
                      className="h-10 rounded-xl bg-card"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl mt-4">
                  <Label className="text-sm font-bold">Сурагчдад харагдах эсэх</Label>
                  <input
                    type="checkbox"
                    checked={formData.is_visible}
                    onChange={(e) => setFormData({ ...formData, is_visible: e.target.checked })}
                    className="w-5 h-5 accent-brand-cyan rounded-md"
                  />
                </div>

                <div className="pt-4 flex justify-end">
                  <Button type="submit" disabled={updateMutation.isPending} className="rounded-xl bg-brand-cyan text-black font-bold">
                    <Save className="w-4 h-4 mr-2" /> Мэдээлэл хадгалах
                  </Button>
                </div>
              </div>
            </form>
          </TabsContent>

          {/* Tab 2: Statement */}
          <TabsContent value="statement" className="space-y-6">
            <div className="glass-strong border-white/5 p-6 rounded-3xl space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-brand-cyan uppercase tracking-wider">Өгүүлбэр Засах</h3>
                  <p className="text-muted-foreground text-[10px] mt-0.5">KaTeX математик томъёо ашиглахдаа $x^2$ хэлбэртэй бичнэ.</p>
                </div>
                <div className="flex gap-2">
                  <PreviewModal title={formData.title} content={statement} />
                  <Button onClick={handleSaveStatement} disabled={updateMutation.isPending} className="rounded-xl bg-brand-cyan text-black font-bold h-9">
                    <Save className="w-4 h-4 mr-2" /> Өгүүлбэр хадгалах
                  </Button>
                </div>
              </div>
              <TipTapEditor 
                initialContent={statement}
                onChange={(html) => setStatement(html)}
              />
            </div>

            {/* PDF Upload */}
            <div className="glass-strong border-white/5 p-6 rounded-3xl space-y-4">
              <h3 className="text-sm font-bold text-brand-violet uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Өгүүлбэр PDF байршуулах (Заавал биш)
              </h3>
              <p className="text-xs text-muted-foreground">Хэрэв сурагчид PDF файл татаж харах боломжтой болгох бол эндээс сонгоно уу.</p>
              
              <div className="flex items-center gap-4">
                <Input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  className="max-w-md h-10 rounded-xl bg-card border-white/10"
                />
                <Button
                  onClick={handlePdfUpload}
                  disabled={!pdfFile || uploadPdfMutation.isPending}
                  className="rounded-xl bg-white text-black font-bold h-10"
                >
                  <Upload className="w-4 h-4 mr-2" /> Байршуулах
                </Button>
              </div>
              {problem?.statement_pdf_path && (
                <p className="text-[10px] text-brand-emerald">
                  ✓ Одоогийн байршсан PDF: <span className="font-mono">{problem.statement_pdf_path}</span>
                </p>
              )}
            </div>
          </TabsContent>

          {/* Tab 3: Hints */}
          <TabsContent value="hints" className="space-y-6">
            {/* New Hint Form */}
            <Card className="glass-strong border-white/5 rounded-3xl p-6">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Plus className="w-4 h-4 text-brand-cyan" />
                  Шинэ зөвлөмж нэмэх
                </CardTitle>
                <CardDescription>Сурагчид бодлого дээр гацсан үед XP оноогоороо нээж үзэх шаталсан тусламж.</CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <form onSubmit={handleAddHint} className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Зөвлөмжийн шат</Label>
                      <select
                        value={newHint.level}
                        onChange={(e) => setNewHint({ ...newHint, level: parseInt(e.target.value) })}
                        className="w-full bg-card border border-border text-foreground px-3 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                      >
                        <option value={1}>Шат 1: Ерөнхий логик (Concept)</option>
                        <option value={2}>Шат 2: Булангийн тохиолдол (Edge Case)</option>
                        <option value={3}>Шат 3: Псевдокод (Pseudocode)</option>
                      </select>
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label className="text-xs font-bold">Гарчиг</Label>
                      <Input
                        value={newHint.title}
                        onChange={(e) => setNewHint({ ...newHint, title: e.target.value })}
                        placeholder="Жишээ: Жижиг N болон том N-ийн хязгаарыг шалгах"
                        className="h-9 rounded-xl bg-card text-xs"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-1.5 col-span-3">
                      <Label className="text-xs font-bold">Зөвлөмжийн агуулга</Label>
                      <Input
                        value={newHint.hint_text}
                        onChange={(e) => setNewHint({ ...newHint, hint_text: e.target.value })}
                        placeholder="Сурагчийг чиглүүлэх тайлбар үг эсвэл код..."
                        className="h-9 rounded-xl bg-card text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">XP Торгууль</Label>
                      <Input
                        type="number"
                        value={newHint.xp_penalty}
                        onChange={(e) => setNewHint({ ...newHint, xp_penalty: parseInt(e.target.value) })}
                        className="h-9 rounded-xl bg-card text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" className="rounded-xl bg-brand-cyan text-black font-bold">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Зөвлөмж нэмэх
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* List of Existing Hints */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-foreground">Бүртгэлтэй зөвлөмжүүд ({hints.length})</h3>
              {hints.length > 0 ? (
                <div className="space-y-4">
                  {hints.map((hint) => (
                    <div key={hint.id} className="glass-strong border-white/5 p-5 rounded-3xl space-y-3 relative">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className="text-[10px] py-0 px-2 bg-brand-cyan/15 text-brand-cyan">
                            Шат {hint.level}
                          </Badge>
                          <span className="text-xs text-muted-foreground">-{hint.xp_penalty} XP</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {editingHintId === hint.id ? (
                            <>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleSaveEditHint(hint.id)}
                                className="h-8 w-8 rounded-lg text-brand-emerald hover:bg-brand-emerald/10"
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => setEditingHintId(null)}
                                className="h-8 w-8 rounded-lg text-muted-foreground"
                              >
                                <ArrowLeft className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => setEditingHintId(hint.id)}
                                className="h-8 w-8 rounded-lg text-brand-cyan hover:bg-brand-cyan/10"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => deleteHintMutation.mutate(hint.id)}
                                className="h-8 w-8 rounded-lg text-rose-500 hover:bg-rose-500/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {editingHintId === hint.id ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold">Гарчиг</Label>
                              <Input
                                value={hint.title}
                                onChange={(e) => handleHintChange(hint.id, "title", e.target.value)}
                                className="h-8 rounded-lg text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold">XP Торгууль</Label>
                              <Input
                                type="number"
                                value={hint.xp_penalty}
                                onChange={(e) => handleHintChange(hint.id, "xp_penalty", parseInt(e.target.value))}
                                className="h-8 rounded-lg text-xs font-mono"
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold">Агуулга</Label>
                            <Input
                              value={hint.hint_text}
                              onChange={(e) => handleHintChange(hint.id, "hint_text", e.target.value)}
                              className="h-8 rounded-lg text-xs"
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <h4 className="text-sm font-bold text-foreground">{hint.title}</h4>
                          <p className="text-xs text-muted-foreground mt-1.5 bg-white/5 p-3 rounded-2xl font-mono">
                            {hint.hint_text}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 border border-dashed border-white/10 rounded-3xl text-center text-xs text-muted-foreground">
                  Энэ бодлогод одоогоор зөвлөмж байхгүй байна.
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </RoleGate>
  );
}
