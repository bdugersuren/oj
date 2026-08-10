"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { problemApi } from "@/lib/api/problems";
import { ArrowLeft, Save, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TipTapEditor } from "@/components/tiptap-editor";
import Link from "next/link";
import toast from "react-hot-toast";
import { RoleGate } from "@/components/role-gate";
import { PreviewModal } from "@/components/shared/preview-modal";

export default function NewProblemPage() {
  const router = useRouter();

  const [statement, setStatement] = useState("<p>Бодлогын өгүүлбэр, оролт гаралтын хэлбэр, болон хязгаарлалтуудыг энд бичнэ үү...</p>");

  const [formData, setFormData] = useState({
    code: "",
    title: "",
    difficulty: "Bronze",
    topic: "Brute Force",
    time_limit: 1.0,
    memory_limit: 64,
    points: 100,
    xp_reward: 20,
    olympiad_scope: "Сургалтын Дасгал",
    division: "Ахлах анги (10-12 анги)",
    olympiad_year: 2026,
    source_citation: "",
    is_visible: true,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => problemApi.create(data),
    onSuccess: (res) => {
      toast.success("Бодлого амжилттай үүслээ.");
      router.push(`/teacher/problems/${res.code}`);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Бодлого үүсгэхэд алдаа гарлаа.";
      toast.error(msg);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code.trim()) return toast.error("Бодлогын код оруулна уу.");
    if (!formData.title.trim()) return toast.error("Бодлогын гарчиг оруулна уу.");
    if (!formData.topic.trim()) return toast.error("Бодлогын сэдэв оруулна уу.");
    if (!statement.trim()) return toast.error("Бодлогын өгүүлбэр оруулна уу.");

    const codeRegex = /^[A-Z0-9_-]+$/;
    if (!codeRegex.test(formData.code)) {
      return toast.error("Бодлогын код нь зөвхөн том англи үсэг, тоо, зураас (- эсвэл _) агуулж болно.");
    }

    createMutation.mutate({
      ...formData,
      statement_markdown: statement,
    });
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <RoleGate roles={["teacher", "admin"]}>
      <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto bg-background/50 min-h-screen">
        {/* Back Link */}
        <Link href="/teacher/problems" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-all">
          <ArrowLeft className="w-4 h-4" />
          Бодлогын жагсаалт руу буцах
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-brand-cyan" />
              Шинэ бодлого үүсгэх
            </h1>
            <p className="text-muted-foreground text-xs mt-1">
              Бодлогын код, өгүүлбэр, хугацаа/санах ойн хязгаарлалт, оноо болон ангиллыг тохируулах
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Card: General */}
            <div className="glass-strong border-white/5 p-6 rounded-3xl space-y-4">
              <h3 className="text-sm font-bold text-brand-cyan uppercase tracking-wider mb-2">Үндсэн мэдээлэл</h3>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code" className="text-xs font-bold">Бодлогын код</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => handleInputChange("code", e.target.value)}
                    placeholder="Жишээ: SUM2NUM"
                    className="h-10 rounded-xl bg-card border-border/60 font-mono text-xs"
                  />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="title" className="text-xs font-bold">Бодлогын гарчиг</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => handleInputChange("title", e.target.value)}
                    placeholder="Жишээ: Хоёр тооны нийлбэр"
                    className="h-10 rounded-xl bg-card border-border/60"
                  />
                </div>
              </div>

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
                  <Label htmlFor="topic" className="text-xs font-bold">Сэдэв</Label>
                  <Input
                    id="topic"
                    value={formData.topic}
                    onChange={(e) => handleInputChange("topic", e.target.value)}
                    placeholder="Жишээ: Brute Force"
                    className="h-10 rounded-xl bg-card border-border/60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold">Хамрах хүрээ (Scope)</Label>
                  <select
                    value={formData.olympiad_scope}
                    onChange={(e) => handleInputChange("olympiad_scope", e.target.value)}
                    className="w-full bg-card border border-border text-foreground px-3 py-2.5 rounded-xl text-xs font-semibold focus:outline-none"
                  >
                    <option value="Сургалтын Дасгал">Сургалтын Дасгал</option>
                    <option value="Дүүргийн Олимпиад">Дүүргийн Олимпиад</option>
                    <option value="Аймаг/Хотын Олимпиад">Аймаг/Хотын Олимпиад</option>
                    <option value="Улсын Олимпиад">Улсын Олимпиад</option>
                    <option value="Олон Улсын Олимпиад (IOI)">Олон Улсын Олимпиад (IOI)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold">Насны ангилал (Division)</Label>
                  <select
                    value={formData.division}
                    onChange={(e) => handleInputChange("division", e.target.value)}
                    className="w-full bg-card border border-border text-foreground px-3 py-2.5 rounded-xl text-xs font-semibold focus:outline-none"
                  >
                    <option value="Бага анги (A ангиллын бэлтгэл)">Бага анги (A ангиллын бэлтгэл)</option>
                    <option value="Дунд анги (8-9 анги)">Дунд анги (8-9 анги)</option>
                    <option value="Ахлах анги (10-12 анги)">Ахлах анги (10-12 анги)</option>
                    <option value="Нээлттэй ангилал (Хязгааргүй)">Нээлттэй ангилал (Хязгааргүй)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Right Card: Limits and parameters */}
            <div className="glass-strong border-white/5 p-6 rounded-3xl space-y-4">
              <h3 className="text-sm font-bold text-brand-cyan uppercase tracking-wider mb-2">Хязгаарлалт & Тохиргоо</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="time_limit" className="text-xs font-bold">Хугацааны хязгаар (Секунд)</Label>
                  <Input
                    id="time_limit"
                    type="number"
                    step="0.1"
                    value={formData.time_limit}
                    onChange={(e) => handleInputChange("time_limit", parseFloat(e.target.value))}
                    className="h-10 rounded-xl bg-card border-border/60 font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="memory_limit" className="text-xs font-bold">Санах ойн хязгаар (MB)</Label>
                  <Input
                    id="memory_limit"
                    type="number"
                    value={formData.memory_limit}
                    onChange={(e) => handleInputChange("memory_limit", parseInt(e.target.value))}
                    className="h-10 rounded-xl bg-card border-border/60 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="points" className="text-xs font-bold">Оноо</Label>
                  <Input
                    id="points"
                    type="number"
                    value={formData.points}
                    onChange={(e) => handleInputChange("points", parseInt(e.target.value))}
                    className="h-10 rounded-xl bg-card border-border/60 font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="xp_reward" className="text-xs font-bold">XP Шагнал</Label>
                  <Input
                    id="xp_reward"
                    type="number"
                    value={formData.xp_reward}
                    onChange={(e) => handleInputChange("xp_reward", parseInt(e.target.value))}
                    className="h-10 rounded-xl bg-card border-border/60 font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="olympiad_year" className="text-xs font-bold">Олимпиад зохиогдсон он</Label>
                  <Input
                    id="olympiad_year"
                    type="number"
                    value={formData.olympiad_year}
                    onChange={(e) => handleInputChange("olympiad_year", parseInt(e.target.value))}
                    className="h-10 rounded-xl bg-card border-border/60 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="source_citation" className="text-xs font-bold">Эх сурвалж дурдалт (Их сурвалж)</Label>
                <Input
                  id="source_citation"
                  value={formData.source_citation}
                  onChange={(e) => handleInputChange("source_citation", e.target.value)}
                  placeholder="Жишээ: Улсын олимпиад 2024, Ахлах анги"
                  className="h-10 rounded-xl bg-card border-border/60"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 bg-white/5 border border-white/5 rounded-2xl">
                <div className="space-y-0.5">
                  <Label className="text-sm font-bold text-foreground">Сурагчдад харагдах эсэх</Label>
                  <p className="text-[10px] text-muted-foreground">Идэвхгүй болгосноор сурагчид энэ бодлогыг харахгүй.</p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.is_visible}
                  onChange={(e) => handleInputChange("is_visible", e.target.checked)}
                  className="w-5 h-5 accent-brand-cyan rounded-md cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Statement Editor */}
          <div className="space-y-2">
            <Label className="text-sm font-bold flex items-center gap-1.5">
              Бодлогын өгүүлбэр
              <span className="text-[10px] text-muted-foreground font-normal">(Tiptap Editor)</span>
            </Label>
            <TipTapEditor 
              initialContent={statement}
              onChange={(html) => setStatement(html)}
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3">
            <PreviewModal title={formData.title} content={statement} />
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-2xl bg-gradient-brand text-white font-bold h-11 px-8 cursor-pointer shadow-md"
            >
              <Save className="w-4 h-4 mr-2" /> Бодлого хадгалж, цааш үргэлжлүүлэх
            </Button>
          </div>
        </form>
      </div>
    </RoleGate>
  );
}
