"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { lessonApi } from "@/lib/api/lessons";
import { classroomApi } from "@/lib/api/classrooms";
import { ArrowLeft, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TipTapEditor } from "@/components/tiptap-editor";
import Link from "next/link";
import toast from "react-hot-toast";
import { RoleGate } from "@/components/role-gate";
import { PreviewModal } from "@/components/shared/preview-modal";

export default function NewLessonPage() {
  const router = useRouter();

  const { data: classrooms = [] } = useQuery({
    queryKey: ["classrooms"],
    queryFn: classroomApi.list,
  });

  const [content, setContent] = useState("<p>Сэдвийн онолын хэсэг, жишээ тайлбар, зургуудыг энд оруулна уу...</p>");

  const [formData, setFormData] = useState({
    slug: "",
    title: "",
    category: "Алгоритм (Algorithms & CP)",
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

  const createMutation = useMutation({
    mutationFn: (data: any) => lessonApi.create(data),
    onSuccess: async (res) => {
      // Link selected classrooms
      if (!formData.is_public && selectedClassrooms.length > 0) {
        try {
          await Promise.all(
            selectedClassrooms.map(classId => classroomApi.linkLesson(classId, res.id))
          );
        } catch (err) {
          toast.error("Хичээлийг зарим ангитай холбоход алдаа гарлаа.");
        }
      }
      toast.success("Онолын хичээл амжилттай үүслээ.");
      router.push(`/teacher/lessons/${res.slug}`);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Хичээл үүсгэхэд алдаа гарлаа.";
      toast.error(msg);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.slug.trim()) return toast.error("Slug холбоос оруулна уу.");
    if (!formData.title.trim()) return toast.error("Хичээлийн гарчиг оруулна уу.");
    if (!formData.topic.trim()) return toast.error("Хичээлийн сэдэв оруулна уу.");
    if (!formData.summary.trim()) return toast.error("Хичээлийн хураангуй тайлбар оруулна уу.");
    if (!content.trim()) return toast.error("Хичээлийн агуулга оруулна уу.");

    // Validate slug (must be url-safe)
    const slugRegex = /^[a-z0-9-_]+$/;
    if (!slugRegex.test(formData.slug)) {
      return toast.error("Slug нь зөвхөн жижиг англи үсэг, тоо, зураас (- эсвэл _) агуулж болно.");
    }

    createMutation.mutate({
      ...formData,
      content_markdown: content,
      quizzes: [], // create empty first, then add inside detail view
    });
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <RoleGate roles={["teacher", "admin"]}>
      <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto bg-background/50 min-h-screen">
        {/* Back Link */}
        <Link href="/teacher/lessons" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-all">
          <ArrowLeft className="w-4 h-4" />
          Хичээлийн жагсаалт руу буцах
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-brand-emerald" />
              Шинэ онолын хичээл үүсгэх
            </h1>
            <p className="text-muted-foreground text-xs mt-1">
              Онолын агуулга, зарцуулах хугацаа болон XP оноог тохируулах
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Card: General */}
            <div className="glass-strong border-white/5 p-6 rounded-3xl space-y-4">
              <h3 className="text-sm font-bold text-brand-emerald uppercase tracking-wider mb-2">Үндсэн мэдээлэл</h3>
              
              <div className="space-y-2">
                <Label htmlFor="title" className="text-xs font-bold">Хичээлийн гарчиг</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleInputChange("title", e.target.value)}
                  placeholder="Жишээ: Хоёртын хайлт хийх алгоритм"
                  className="h-10 rounded-xl bg-card border-border/60"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug" className="text-xs font-bold">Slug холбоос (Ижилгүй URL-safe)</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => handleInputChange("slug", e.target.value)}
                  placeholder="Жишээ: binary-search-intro"
                  className="h-10 rounded-xl bg-card border-border/60 font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold">Ангилал</Label>
                  <select
                    value={formData.category}
                    onChange={(e) => handleInputChange("category", e.target.value)}
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
                    onChange={(e) => handleInputChange("topic", e.target.value)}
                    placeholder="Жишээ: Хоёртын хайлт"
                    className="h-10 rounded-xl bg-card border-border/60"
                  />
                </div>
              </div>

              {/* Classroom Toggle and Selector */}
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3.5 bg-white/5 border border-white/5 rounded-2xl">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold text-foreground">Нийтийн хичээл үүсгэх үү?</Label>
                    <p className="text-[10px] text-muted-foreground">Идэвхжүүлбэл бүх сурагчдад харагдана. Үгүй бол зөвхөн холбосон ангийн сурагчдад харагдана.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.is_public}
                    onChange={(e) => handleInputChange("is_public", e.target.checked)}
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
                        {classrooms.map((c) => (
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
            </div>

            {/* Right Card: Progression parameters */}
            <div className="glass-strong border-white/5 p-6 rounded-3xl space-y-4">
              <h3 className="text-sm font-bold text-brand-cyan uppercase tracking-wider mb-2">Үзүүлэлтүүд</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold">Хүндрэлийн түвшин</Label>
                  <select
                    value={formData.difficulty}
                    onChange={(e) => handleInputChange("difficulty", e.target.value)}
                    className="w-full bg-card border border-border text-foreground px-3 py-2.5 rounded-xl text-sm font-semibold focus:outline-none"
                  >
                    <option value="Bronze">Bronze</option>
                    <option value="Silver">Silver</option>
                    <option value="Gold">Gold</option>
                    <option value="Platinum">Platinum</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estimated_minutes" className="text-xs font-bold">Унших хугацаа (минут)</Label>
                  <Input
                    id="estimated_minutes"
                    type="number"
                    value={formData.estimated_minutes}
                    onChange={(e) => handleInputChange("estimated_minutes", parseInt(e.target.value))}
                    className="h-10 rounded-xl bg-card border-border/60 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="xp_reward" className="text-xs font-bold">XP шагнал</Label>
                  <Input
                    id="xp_reward"
                    type="number"
                    value={formData.xp_reward}
                    onChange={(e) => handleInputChange("xp_reward", parseInt(e.target.value))}
                    className="h-10 rounded-xl bg-card border-border/60 font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="order" className="text-xs font-bold">Дараалал (Унших эрэмбэ)</Label>
                  <Input
                    id="order"
                    type="number"
                    value={formData.order}
                    onChange={(e) => handleInputChange("order", parseInt(e.target.value))}
                    className="h-10 rounded-xl bg-card border-border/60 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="summary" className="text-xs font-bold">Хураангуй (Summary)</Label>
                <Input
                  id="summary"
                  value={formData.summary}
                  onChange={(e) => handleInputChange("summary", e.target.value)}
                  placeholder="Хичээлийн товч танилцуулга тайлбар..."
                  className="h-10 rounded-xl bg-card border-border/60"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 bg-white/5 border border-white/5 rounded-2xl">
                <div className="space-y-0.5">
                  <Label className="text-sm font-bold text-foreground">Нийтлэх үү?</Label>
                  <p className="text-[10px] text-muted-foreground">Үгүй бол ноорог хадгалж, сурагчид харахгүй.</p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.is_published}
                  onChange={(e) => handleInputChange("is_published", e.target.checked)}
                  className="w-5 h-5 accent-brand-emerald rounded-md cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Content Editor */}
          <div className="space-y-2">
            <Label className="text-sm font-bold flex items-center gap-1.5">
              Хичээлийн агуулга
              <span className="text-[10px] text-muted-foreground font-normal">(Tiptap Editor)</span>
            </Label>
            <TipTapEditor 
              initialContent={content}
              onChange={(html) => setContent(html)}
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3">
            <PreviewModal title={formData.title} content={content} />
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-2xl bg-gradient-brand text-white font-bold h-11 px-8 cursor-pointer shadow-md"
            >
              <Save className="w-4 h-4 mr-2" /> Хичээл үүсгэж, үргэлжлүүлэх
            </Button>
          </div>
        </form>
      </div>
    </RoleGate>
  );
}
