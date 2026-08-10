"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { lessonApi } from "@/lib/api/lessons";
import { classroomApi } from "@/lib/api/classrooms";
import { problemApi } from "@/lib/api/problems";
import { 
  ArrowLeft, Save, Sparkles, AlertCircle, Trash2, Plus, 
  Edit2, Check, RefreshCw, Layers, PlusCircle, HelpCircle, Code
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TipTapEditor } from "@/components/tiptap-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import toast from "react-hot-toast";
import { RoleGate } from "@/components/role-gate";
import { PreviewModal } from "@/components/shared/preview-modal";

export default function EditLessonPage() {
  const { slug } = useParams() as { slug: string };
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: lesson, isLoading, refetch } = useQuery({
    queryKey: ["edit-lesson", slug],
    queryFn: () => lessonApi.get(slug),
  });

  const [formData, setFormData] = useState<any>({
    title: "",
    category: "ALGORITHMS",
    topic: "",
    difficulty: "Bronze",
    estimated_minutes: 15,
    xp_reward: 25,
    summary: "",
    order: 1,
    is_published: true,
    is_public: true,
  });

  const [selectedClassrooms, setSelectedClassrooms] = useState<number[]>([]);

  const { data: classrooms = [] } = useQuery({
    queryKey: ["classrooms"],
    queryFn: classroomApi.list,
  });

  const [content, setContent] = useState("");

  // Quiz Management state
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [newQuiz, setNewQuiz] = useState({
    question: "",
    options: ["Сонголт A", "Сонголт B"],
    correct_option_index: 0,
    correct_answers_json: "[]",
    quiz_type: "single",
    explanation: "",
    order: 1,
  });

  // Practice Problems state
  const [linkedProblems, setLinkedProblems] = useState<any[]>([]);
  const [targetProblemCode, setTargetProblemCode] = useState("");
  const [isRecommended, setIsRecommended] = useState(true);

  useEffect(() => {
    if (lesson) {
      setFormData({
        title: lesson.title,
        category: lesson.category,
        topic: lesson.topic,
        difficulty: lesson.difficulty,
        estimated_minutes: lesson.estimated_minutes,
        xp_reward: lesson.xp_reward,
        summary: lesson.summary,
        order: lesson.order,
        is_published: lesson.is_published,
        is_public: lesson.is_public ?? true,
      });
      setSelectedClassrooms(lesson.classroom_ids || []);
      setContent(lesson.content_markdown || "");
      setQuizzes(lesson.quizzes || []);
      setLinkedProblems(lesson.practice_problems || []);
    }
  }, [lesson]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => lessonApi.update(slug, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["edit-lesson", slug] });
      toast.success("Хичээлийн мэдээлэл шинэчлэгдлээ.");
    },
    onError: () => toast.error("Засахад алдаа гарлаа.")
  });

  const addQuizMutation = useMutation({
    mutationFn: (data: any) => lessonApi.addQuiz(slug, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["edit-lesson", slug] });
      toast.success("Quiz амжилттай нэмэгдлээ.");
      setNewQuiz({
        question: "",
        options: ["Сонголт A", "Сонголт B"],
        correct_option_index: 0,
        correct_answers_json: "[]",
        quiz_type: "single",
        explanation: "",
        order: quizzes.length + 2,
      });
    },
    onError: () => toast.error("Quiz нэмэхэд алдаа гарлаа.")
  });

  const deleteQuizMutation = useMutation({
    mutationFn: (quizId: number) => lessonApi.deleteQuiz(slug, quizId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["edit-lesson", slug] });
      toast.success("Quiz устлаа.");
    },
    onError: () => toast.error("Quiz устгахад алдаа гарлаа.")
  });

  const addProblemMutation = useMutation({
    mutationFn: ({ code, isRec }: { code: string, isRec: boolean }) => 
      lessonApi.addProblem(slug, code, isRec, linkedProblems.length + 1),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["edit-lesson", slug] });
      toast.success("Бодлого амжилттай холбогдлоо.");
      setTargetProblemCode("");
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Бодлого холбоход алдаа гарлаа.";
      toast.error(msg);
    }
  });

  const removeProblemMutation = useMutation({
    mutationFn: (lpId: number) => lessonApi.removeProblem(slug, lpId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["edit-lesson", slug] });
      toast.success("Бодлого салгагдлаа.");
    },
    onError: () => toast.error("Бодлого салгахад алдаа гарлаа.")
  });

  const handleSubmitGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lesson) return;
    
    // Save general details
    updateMutation.mutate({
      title: formData.title,
      category: formData.category,
      topic: formData.topic,
      difficulty: formData.difficulty,
      estimated_minutes: formData.estimated_minutes,
      xp_reward: formData.xp_reward,
      summary: formData.summary,
      order: formData.order,
      is_published: formData.is_published,
      is_public: formData.is_public,
    });

    // Link/Unlink classrooms
    const oldClassroomIds = lesson?.classroom_ids || [];
    const toLink = selectedClassrooms.filter(id => !oldClassroomIds.includes(id));
    const toUnlink = oldClassroomIds.filter(id => !selectedClassrooms.includes(id));

    try {
      if (toLink.length > 0) {
        await Promise.all(toLink.map(classId => classroomApi.linkLesson(classId, lesson.id)));
      }
      if (toUnlink.length > 0) {
        await Promise.all(toUnlink.map(classId => classroomApi.unlinkLesson(classId, lesson.id)));
      }
      if (toLink.length > 0 || toUnlink.length > 0) {
        toast.success("Ангийн холбоосууд шинэчлэгдлээ.");
        void refetch();
      }
    } catch (err) {
      toast.error("Ангиудын холбоосыг шинэчлэхэд алдаа гарлаа.");
    }
  };

  const handleSaveContent = () => {
    updateMutation.mutate({ content_markdown: content });
  };

  const handleToggleMultipleCorrect = (idx: number) => {
    setNewQuiz(prev => {
      let currentList: number[] = [];
      try {
        currentList = JSON.parse(prev.correct_answers_json || "[]");
        if (!Array.isArray(currentList)) currentList = [];
      } catch (e) {
        currentList = [];
      }
      const newList = currentList.includes(idx)
        ? currentList.filter(x => x !== idx)
        : [...currentList, idx];
      return {
        ...prev,
        correct_answers_json: JSON.stringify(newList)
      };
    });
  };

  const handleAddQuiz = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuiz.question.trim()) return toast.error("Асуултаа оруулна уу.");
    
    let optionsToSubmit = newQuiz.options;
    let answersJson = "[]";
    let fallbackIndex = 0;

    if (newQuiz.quiz_type === "single") {
      if (newQuiz.options.some(o => !o.trim())) return toast.error("Бүх сонголтуудыг бөглөнө үү.");
      answersJson = JSON.stringify([newQuiz.correct_option_index]);
      fallbackIndex = newQuiz.correct_option_index;
    } else if (newQuiz.quiz_type === "multiple") {
      if (newQuiz.options.some(o => !o.trim())) return toast.error("Бүх сонголтуудыг бөглөнө үү.");
      try {
        const parsed = JSON.parse(newQuiz.correct_answers_json || "[]");
        if (!Array.isArray(parsed) || parsed.length === 0) {
          return toast.error("Хамгийн багадаа 1 зөв сонголт тэмдэглэнэ үү.");
        }
        answersJson = JSON.stringify(parsed.map((x: any) => parseInt(x)));
        fallbackIndex = parsed[0];
      } catch (err) {
        return toast.error("Зөв сонголтуудыг тэмдэглэнэ үү.");
      }
    } else if (newQuiz.quiz_type === "text") {
      optionsToSubmit = [];
      const parts = newQuiz.correct_answers_json
        .split(",")
        .map(x => x.trim())
        .filter(x => x.length > 0);
      if (parts.length === 0) {
        return toast.error("Нөхөх тестийн зөв хариултуудыг таслалаар тусгаарлан оруулна уу.");
      }
      answersJson = JSON.stringify(parts);
      fallbackIndex = 0;
    }

    addQuizMutation.mutate({
      question: newQuiz.question,
      options: optionsToSubmit,
      correct_option_index: fallbackIndex,
      correct_answers_json: answersJson,
      quiz_type: newQuiz.quiz_type,
      explanation: newQuiz.explanation,
      order: newQuiz.order,
    });
  };

  const handleAddOption = () => {
    setNewQuiz(prev => ({
      ...prev,
      options: [...prev.options, `Сонголт ${String.fromCharCode(65 + prev.options.length)}`],
    }));
  };

  const handleRemoveOption = (index: number) => {
    if (newQuiz.options.length <= 2) return toast.error("Хамгийн багадаа 2 сонголттой байх ёстой.");
    setNewQuiz(prev => {
      const newOptions = prev.options.filter((_, i) => i !== index);
      return {
        ...prev,
        options: newOptions,
        correct_option_index: prev.correct_option_index >= newOptions.length ? 0 : prev.correct_option_index,
      };
    });
  };

  const handleOptionChange = (index: number, val: string) => {
    setNewQuiz(prev => {
      const opts = [...prev.options];
      opts[index] = val;
      return { ...prev, options: opts };
    });
  };

  const handleLinkProblem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetProblemCode.trim()) return toast.error("Бодлогын код оруулна уу.");
    addProblemMutation.mutate({ code: targetProblemCode.trim(), isRec: isRecommended });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 text-brand-emerald animate-spin" />
      </div>
    );
  }

  return (
    <RoleGate roles={["teacher", "admin"]}>
      <div className="p-4 md:p-8 space-y-6 w-full min-h-screen bg-background/50">
        {/* Back Link */}
        <Link href="/teacher/lessons" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-all">
          <ArrowLeft className="w-4 h-4" />
          Хичээлийн жагсаалт
        </Link>

        {/* Title Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-brand-emerald" />
              Хичээл засах: <span className="text-brand-cyan">{formData.title}</span>
            </h1>
            <p className="text-muted-foreground text-xs mt-1">
              Онолын агуулга, бататгах Quiz асуултууд болон практик бодлогуудыг удирдах
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="bg-secondary/40 p-1 rounded-2xl border border-white/5">
            <TabsTrigger value="general" className="rounded-xl px-4 py-2 text-xs font-bold">Үндсэн тохиргоо</TabsTrigger>
            <TabsTrigger value="content" className="rounded-xl px-4 py-2 text-xs font-bold">Агуулга</TabsTrigger>
            <TabsTrigger value="quizzes" className="rounded-xl px-4 py-2 text-xs font-bold">Интерактив</TabsTrigger>
            <TabsTrigger value="problems" className="rounded-xl px-4 py-2 text-xs font-bold">Практик бодлогууд</TabsTrigger>
          </TabsList>

          {/* Tab 1: General */}
          <TabsContent value="general">
            <form onSubmit={handleSubmitGeneral} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-strong border-white/5 p-6 rounded-3xl space-y-4">
                <h3 className="text-sm font-bold text-brand-emerald uppercase tracking-wider mb-2">Үндсэн мэдээлэл</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-xs font-bold">Хичээлийн нэр</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="h-10 rounded-xl bg-card"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Ангилал</Label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full bg-card border border-border text-foreground px-3 py-2.5 rounded-xl text-sm font-semibold focus:outline-none"
                    >
                      <option value="Алгоритм (Algorithms & CP)">Алгоритм (Algorithms & CP)</option>
                      <option value="Математик (Math for Olympiad)">Математик (Math for Olympiad)</option>
                      <option value="Өгөгдлийн Бүтэц (Data Structures)">Өгөгдлийн Бүтэц (Data Structures)</option>
                      <option value="Хиймэл Оюун ба Логик (AI/ML & Logic)">Хиймэл Оюун ба Логик (AI/ML & Logic)</option>
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

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3.5 bg-white/5 border border-white/5 rounded-2xl">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-bold text-foreground">Нийтийн хичээл үүсгэх үү?</Label>
                      <p className="text-[10px] text-muted-foreground">Идэвхжүүлбэл бүх сурагчдад харагдана. Үгүй бол зөвхөн холбосон ангийн сурагчдад харагдана.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.is_public}
                      onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                      className="w-5 h-5 accent-brand-emerald rounded-md cursor-pointer"
                    />
                  </div>

                  {!formData.is_public && (
                    <div className="space-y-2 bg-white/5 p-4 rounded-2xl border border-white/5">
                      <Label className="text-xs font-bold">Холбох ангиуд</Label>
                      {classrooms.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Таны үүсгэсэн идэвхтэй анги олдсонгүй.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                          {classrooms.map((c: any) => (
                            <label key={c.id} className="flex items-center gap-2 text-xs text-foreground cursor-pointer p-1 hover:bg-white/5 rounded">
                              <input
                                type="checkbox"
                                checked={selectedClassrooms.includes(c.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedClassrooms(prev => [...prev, c.id]);
                                  } else {
                                    setSelectedClassrooms(prev => prev.filter(id => id !== c.id));
                                  }
                                }}
                                className="w-4 h-4 accent-brand-emerald rounded-md cursor-pointer"
                              />
                              {c.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="summary" className="text-xs font-bold">Хураангуй (Summary)</Label>
                  <Input
                    id="summary"
                    value={formData.summary}
                    onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                    className="h-10 rounded-xl bg-card"
                  />
                </div>
              </div>

              <div className="glass-strong border-white/5 p-6 rounded-3xl space-y-4">
                <h3 className="text-sm font-bold text-brand-cyan uppercase tracking-wider mb-2">Үзүүлэлтүүд</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold">Хүндрэл</Label>
                    <select
                      value={formData.difficulty}
                      onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
                      className="w-full bg-card border border-border text-foreground px-3 py-2.5 rounded-xl text-sm font-semibold focus:outline-none"
                    >
                      <option value="Bronze">Bronze</option>
                      <option value="Silver">Silver</option>
                      <option value="Gold">Gold</option>
                      <option value="Platinum">Platinum</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="estimated_minutes" className="text-xs font-bold">Зарцуулах хугацаа (мин)</Label>
                    <Input
                      id="estimated_minutes"
                      type="number"
                      value={formData.estimated_minutes}
                      onChange={(e) => setFormData({ ...formData, estimated_minutes: parseInt(e.target.value) })}
                      className="h-10 rounded-xl bg-card font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="xp_reward" className="text-xs font-bold">XP Шагнал</Label>
                    <Input
                      id="xp_reward"
                      type="number"
                      value={formData.xp_reward}
                      onChange={(e) => setFormData({ ...formData, xp_reward: parseInt(e.target.value) })}
                      className="h-10 rounded-xl bg-card font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="order" className="text-xs font-bold">Хичээлийн эрэмбэ (Order)</Label>
                    <Input
                      id="order"
                      type="number"
                      value={formData.order}
                      onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) })}
                      className="h-10 rounded-xl bg-card font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl">
                  <Label className="text-sm font-bold">Нийтлэгдсэн эсэх</Label>
                  <input
                    type="checkbox"
                    checked={formData.is_published}
                    onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
                    className="w-5 h-5 accent-brand-emerald rounded-md"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit" disabled={updateMutation.isPending} className="rounded-xl bg-brand-emerald text-white font-bold">
                    <Save className="w-4 h-4 mr-2" /> Өөрчлөлтийг хадгалах
                  </Button>
                </div>
              </div>
            </form>
          </TabsContent>

          {/* Tab 2: Content */}
          <TabsContent value="content" className="space-y-6">
            <div className="glass-strong border-white/5 p-6 rounded-3xl space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-brand-emerald uppercase tracking-wider">Онолын Агуулга Засах</h3>
                  <p className="text-muted-foreground text-[10px] mt-0.5">Сурагчдын онол унших хэсэг.</p>
                </div>
                <div className="flex gap-2">
                  <PreviewModal title={formData.title} content={content} quizzes={quizzes} />
                  <Button onClick={handleSaveContent} disabled={updateMutation.isPending} className="rounded-xl bg-brand-emerald text-white font-bold h-9">
                    <Save className="w-4 h-4 mr-2" /> Агуулга хадгалах
                  </Button>
                </div>
              </div>
              <TipTapEditor 
                initialContent={content}
                onChange={(html) => setContent(html)}
              />
            </div>
          </TabsContent>

          {/* Tab 3: Quizzes */}
          <TabsContent value="quizzes" className="space-y-6">
            {/* Create Quiz */}
            <Card className="glass-strong border-white/5 rounded-3xl p-6">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-brand-emerald" />
                  Бататгах Quiz нэмэх
                </CardTitle>
                <CardDescription>Сурагчид онолын хичээлийг уншиж байх явцад агуулга дунд байрлах тест.</CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <form onSubmit={handleAddQuiz} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-1.5">
                      <Label className="text-xs font-bold">Асуултын өгүүлбэр</Label>
                      <Input
                        value={newQuiz.question}
                        onChange={(e) => setNewQuiz({ ...newQuiz, question: e.target.value })}
                        placeholder="Жишээ: Binary Search алгоритмын дундаж ажиллах хугацаа ямар байдаг вэ?"
                        className="h-10 rounded-xl bg-card"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Тестийн хэлбэр</Label>
                      <select
                        value={newQuiz.quiz_type}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewQuiz({
                            ...newQuiz,
                            quiz_type: val,
                            correct_answers_json: val === "text" ? "" : "[]",
                            options: val === "text" ? [] : ["Сонголт A", "Сонголт B"]
                          });
                        }}
                        className="w-full bg-card border border-border text-foreground px-3 py-2.5 rounded-xl text-sm font-semibold focus:outline-none"
                      >
                        <option value="single">Нэг сонголттой</option>
                        <option value="multiple">Олон сонголттой</option>
                        <option value="text">Нөхөх тест</option>
                      </select>
                    </div>
                  </div>

                  {/* Dynamic Options based on quiz_type */}
                  {newQuiz.quiz_type !== "text" ? (
                    <div className="space-y-3">
                      <Label className="text-xs font-bold flex justify-between items-center">
                        Сонголтууд (Зөв хариултуудаа тэмдэглэнэ үү)
                        <Button type="button" variant="ghost" size="sm" onClick={handleAddOption} className="h-6 text-[10px] font-bold text-brand-emerald">
                          Сонголт нэмэх +
                        </Button>
                      </Label>
                      <div className="grid gap-3">
                        {newQuiz.options.map((option, idx) => {
                          let isCorrect = false;
                          if (newQuiz.quiz_type === "single") {
                            isCorrect = newQuiz.correct_option_index === idx;
                          } else {
                            try {
                              isCorrect = JSON.parse(newQuiz.correct_answers_json || "[]").includes(idx);
                            } catch (e) {
                              isCorrect = false;
                            }
                          }

                          return (
                            <div key={idx} className="flex items-center gap-3">
                              <input
                                type={newQuiz.quiz_type === "single" ? "radio" : "checkbox"}
                                name={newQuiz.quiz_type === "single" ? "correct_index" : `correct_index_${idx}`}
                                checked={isCorrect}
                                onChange={() => {
                                  if (newQuiz.quiz_type === "single") {
                                    setNewQuiz({ ...newQuiz, correct_option_index: idx });
                                  } else {
                                    handleToggleMultipleCorrect(idx);
                                  }
                                }}
                                className="w-4 h-4 accent-brand-emerald cursor-pointer shrink-0"
                                title="Зөв хариултаар сонгох"
                              />
                              <Input
                                value={option}
                                onChange={(e) => handleOptionChange(idx, e.target.value)}
                                placeholder={`Сонголт ${String.fromCharCode(65 + idx)}`}
                                className="h-9 rounded-xl bg-card text-xs flex-1"
                              />
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleRemoveOption(idx)}
                                className="h-8 w-8 rounded-lg text-rose-500 hover:bg-rose-500/10 shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Зөв хариултууд (Таслалаар тусгаарлан оруулна уу)</Label>
                      <Input
                        value={newQuiz.correct_answers_json}
                        onChange={(e) => setNewQuiz({ ...newQuiz, correct_answers_json: e.target.value })}
                        placeholder="Жишээ: хөөсөн, bubble, bubble sort"
                        className="h-10 rounded-xl bg-card text-xs"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Буруу хариулсан үед харуулах тайлбар</Label>
                      <Input
                        value={newQuiz.explanation}
                        onChange={(e) => setNewQuiz({ ...newQuiz, explanation: e.target.value })}
                        placeholder="Жишээ: Binary search нь N хэмжээг алхам бүрт 2 дахин багасгадаг тул O(log N) юм."
                        className="h-10 rounded-xl bg-card text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold">Эрэмбэ (Order)</Label>
                      <Input
                        type="number"
                        value={newQuiz.order}
                        onChange={(e) => setNewQuiz({ ...newQuiz, order: parseInt(e.target.value) })}
                        className="h-10 rounded-xl bg-card text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={addQuizMutation.isPending} className="rounded-xl bg-brand-emerald text-white font-bold h-9">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Quiz нэмэх
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* List of quizzes */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-foreground">Бүртгэлтэй Quiz асуултууд ({quizzes.length})</h3>
              {quizzes.length > 0 ? (
                <div className="space-y-4">
                  {quizzes.map((q) => {
                    let correctList: any[] = [];
                    if (q.quiz_type === "multiple" || q.quiz_type === "text") {
                      try {
                        correctList = JSON.parse(q.correct_answers_json || "[]");
                      } catch (e) {
                        correctList = [];
                      }
                    }

                    return (
                      <div key={q.id} className="glass-strong border-white/5 p-5 rounded-3xl space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className="text-[10px] bg-brand-emerald/10 text-brand-emerald border-none">
                              Дараалал: #{q.order}
                            </Badge>
                            <Badge variant="secondary" className="text-[9px] bg-white/5 border-none">
                              {q.quiz_type === "single" ? "Нэг сонголттой" : q.quiz_type === "multiple" ? "Олон сонголттой" : "Нөхөх тест"}
                            </Badge>
                            <Badge variant="outline" className="text-[9px] border-brand-cyan/20 text-brand-cyan bg-brand-cyan/5 font-mono select-all">
                              [quiz-{q.id}]
                            </Badge>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                navigator.clipboard.writeText(`[quiz-${q.id}]`);
                                toast.success("Түгжээний таг хуулагдлаа!");
                              }}
                              className="h-5 px-1.5 text-[8px] font-bold text-brand-cyan hover:bg-brand-cyan/10"
                            >
                              Таг хуулах
                            </Button>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteQuizMutation.mutate(q.id)}
                            className="h-8 w-8 text-rose-500 hover:bg-rose-500/10 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <h4 className="text-sm font-black text-foreground">{q.question}</h4>
                        
                        {/* Options rendering based on quiz_type */}
                        {q.quiz_type !== "text" ? (
                          <div className="grid gap-2 pl-4 border-l border-white/10 mt-2">
                            {q.options.map((option: string, oIdx: number) => {
                              let isCorrect = false;
                              if (q.quiz_type === "single") {
                                isCorrect = q.correct_option_index === oIdx;
                              } else {
                                isCorrect = correctList.includes(oIdx);
                              }

                              return (
                                <div key={oIdx} className="flex items-center gap-2 text-xs">
                                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                                    isCorrect ? "bg-brand-emerald text-black" : "bg-white/10 text-muted-foreground"
                                  }`}>
                                    {String.fromCharCode(65 + oIdx)}
                                  </span>
                                  <span className={isCorrect ? "text-brand-emerald font-bold" : "text-muted-foreground"}>
                                    {option}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="pl-4 border-l border-white/10 text-xs mt-2 space-y-1">
                            <div className="text-muted-foreground">Зөв хариултын хувилбарууд:</div>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {correctList.map((ans, aIdx) => (
                                <Badge key={aIdx} variant="outline" className="text-[10px] border-brand-emerald/30 text-brand-emerald">
                                  {ans}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {q.explanation && (
                          <div className="text-[10px] text-muted-foreground mt-2 bg-white/5 p-3 rounded-xl italic">
                            <b>Хариултын тайлбар:</b> {q.explanation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 border border-dashed border-white/10 rounded-3xl text-center text-xs text-muted-foreground">
                  Энэ хичээлд бататгах тест ороогүй байна.
                </div>
              )}
            </div>
          </TabsContent>

          {/* Tab 4: Practice Problems */}
          <TabsContent value="problems" className="space-y-6">
            {/* Link Problem Form */}
            <Card className="glass-strong border-white/5 rounded-3xl p-6">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Code className="w-5 h-5 text-brand-cyan" />
                  Дадлага бодлого холбох
                </CardTitle>
                <CardDescription>Сурагчид онолыг бататгаж бодох практик бодлогын код оруулах.</CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <form onSubmit={handleLinkProblem} className="flex items-end gap-4 max-w-xl">
                  <div className="space-y-1.5 flex-1">
                    <Label className="text-xs font-bold">Бодлогын код (Ижилгүй)</Label>
                    <Input
                      value={targetProblemCode}
                      onChange={(e) => setTargetProblemCode(e.target.value)}
                      placeholder="Жишээ: 1001, BF101"
                      className="h-10 rounded-xl bg-card font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-white/5 border border-white/5 rounded-xl shrink-0 h-10">
                    <Label className="text-xs font-bold">Санал болгох?</Label>
                    <input
                      type="checkbox"
                      checked={isRecommended}
                      onChange={(e) => setIsRecommended(e.target.checked)}
                      className="w-4 h-4 accent-brand-cyan"
                    />
                  </div>
                  <Button type="submit" disabled={addProblemMutation.isPending} className="rounded-xl bg-brand-cyan text-black font-bold h-10">
                    Холбох
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* List of linked problems */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-foreground">Холбогдсон бодлогууд ({linkedProblems.length})</h3>
              {linkedProblems.length > 0 ? (
                <div className="grid gap-4">
                  {linkedProblems.map((lp) => (
                    <div 
                      key={lp.id} 
                      className="glass-strong border-white/5 p-4 rounded-3xl flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-brand-cyan/10 text-brand-cyan px-2.5 py-1 rounded-xl font-mono text-xs font-black">
                          {lp.code}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-foreground">{lp.title}</h4>
                          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                            <span>Хүндрэл: <b>{lp.difficulty}</b></span>
                            <span>·</span>
                            <span>Оноо: <b>{lp.points}</b></span>
                            {lp.is_recommended && (
                              <>
                                <span>·</span>
                                <Badge className="text-[8px] bg-brand-cyan/10 text-brand-cyan border-none py-0">Зөвлөмж</Badge>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProblemMutation.mutate(lp.id)}
                        className="h-8 w-8 text-rose-500 hover:bg-rose-500/10 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 border border-dashed border-white/10 rounded-3xl text-center text-xs text-muted-foreground">
                  Энэ хичээлд холбосон дадлага бодлого байхгүй байна.
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </RoleGate>
  );
}
