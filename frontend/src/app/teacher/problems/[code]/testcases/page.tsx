"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { problemApi } from "@/lib/api/problems";
import { 
  ArrowLeft, Plus, Trash2, Edit2, Upload, FileArchive, 
  HelpCircle, Check, Play, RefreshCw, Layers 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import toast from "react-hot-toast";
import { RoleGate } from "@/components/role-gate";

export default function ProblemTestcasesPage() {
  const { code } = useParams() as { code: string };
  const queryClient = useQueryClient();

  const { data: testcases = [], isLoading, refetch } = useQuery({
    queryKey: ["problem-testcases", code],
    queryFn: () => problemApi.listTestcases(code),
  });

  // State for adding a testcase manually
  const [newCase, setNewCase] = useState({
    input_data: "",
    output_data: "",
    points: 10,
    order: 1,
    is_sample: false,
  });

  // State for bulk ZIP upload
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [pointsPerCase, setPointsPerCase] = useState(10);

  // State for editing inline
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingCase, setEditingCase] = useState<any>(null);

  const addMutation = useMutation({
    mutationFn: (data: any) => problemApi.addTestcase(code, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["problem-testcases", code] });
      toast.success("Тест кейс нэмэгдлээ.");
      setNewCase(prev => ({
        input_data: "",
        output_data: "",
        points: 10,
        order: prev.order + 1,
        is_sample: false,
      }));
    },
    onError: () => toast.error("Тест кейс нэмэхэд алдаа гарлаа.")
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number, data: any }) => problemApi.updateTestcase(code, id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["problem-testcases", code] });
      toast.success("Тест кейс шинэчлэгдлээ.");
      setEditingId(null);
      setEditingCase(null);
    },
    onError: () => toast.error("Засахад алдаа гарлаа.")
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => problemApi.deleteTestcase(code, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["problem-testcases", code] });
      toast.success("Тест кейс устлаа.");
    },
    onError: () => toast.error("Устгахад алдаа гарлаа.")
  });

  const zipUploadMutation = useMutation({
    mutationFn: (file: File) => problemApi.uploadTestcasesZip(code, file, pointsPerCase),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["problem-testcases", code] });
      toast.success(res.message || "ZIP амжилттай уншигдаж оруулагдлаа.");
      setZipFile(null);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "ZIP файл задлахад алдаа гарлаа.";
      toast.error(msg);
    }
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCase.input_data.trim() || !newCase.output_data.trim()) {
      return toast.error("Оролт болон гаралтын өгөгдлийг оруулна уу.");
    }
    addMutation.mutate(newCase);
  };

  const handleZipUploadSubmit = () => {
    if (zipFile) {
      zipUploadMutation.mutate(zipFile);
    }
  };

  const handleStartEdit = (tc: any) => {
    setEditingId(tc.id);
    setEditingCase({ ...tc });
  };

  const handleSaveEdit = () => {
    if (!editingCase.input_data.trim() || !editingCase.output_data.trim()) {
      return toast.error("Оролт гаралтыг хоосон орхиж болохгүй.");
    }
    updateMutation.mutate({
      id: editingId!,
      data: {
        input_data: editingCase.input_data,
        output_data: editingCase.output_data,
        points: editingCase.points,
        order: editingCase.order,
        is_sample: editingCase.is_sample,
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 text-brand-cyan animate-spin" />
      </div>
    );
  }

  return (
    <RoleGate roles={["teacher", "admin"]}>
      <div className="p-6 md:p-8 space-y-6 max-w-6xl mx-auto bg-background/50 min-h-screen">
        {/* Back Link */}
        <Link href={`/teacher/problems/${code}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-all">
          <ArrowLeft className="w-4 h-4" />
          Бодлого засварлах хуудас руу буцах
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-3">
              <Layers className="w-6 h-6 text-brand-cyan" />
              Тест кэйсүүд: <span className="text-brand-violet">{code}</span>
            </h1>
            <p className="text-muted-foreground text-xs mt-1">
              Бодлогын зөв хариуг шалгах тестүүдийг гараар оруулах эсвэл ZIP файлаар бүлэглэж уншуулах
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Manual Form & ZIP Upload */}
          <div className="space-y-6 lg:col-span-1">
            {/* Manually Add */}
            <Card className="glass-strong border-white/5 rounded-3xl p-5">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Plus className="w-4 h-4 text-brand-cyan" />
                  Гараар тест кэйс нэмэх
                </CardTitle>
                <CardDescription>Нэг нэгээр нь оролт, гаралтын текст оруулах.</CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <form onSubmit={handleAddSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold">Оролтын өгөгдөл (Input)</Label>
                    <textarea
                      value={newCase.input_data}
                      onChange={(e) => setNewCase({ ...newCase, input_data: e.target.value })}
                      placeholder="Жишээ: 5 10"
                      className="w-full h-24 bg-card border border-border text-foreground px-3 py-2 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-brand-cyan leading-relaxed"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-bold">Гаралтын өгөгдөл (Output)</Label>
                    <textarea
                      value={newCase.output_data}
                      onChange={(e) => setNewCase({ ...newCase, output_data: e.target.value })}
                      placeholder="Жишээ: 15"
                      className="w-full h-24 bg-card border border-border text-foreground px-3 py-2 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-brand-cyan leading-relaxed"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold font-sans">Оноо</Label>
                      <Input
                        type="number"
                        value={newCase.points}
                        onChange={(e) => setNewCase({ ...newCase, points: parseInt(e.target.value) })}
                        className="h-9 rounded-xl bg-card font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-bold font-sans">Дараалал</Label>
                      <Input
                        type="number"
                        value={newCase.order}
                        onChange={(e) => setNewCase({ ...newCase, order: parseInt(e.target.value) })}
                        className="h-9 rounded-xl bg-card font-mono text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3.5 bg-white/5 border border-white/5 rounded-xl">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-bold font-sans">Жишээ тест эсэх?</Label>
                      <p className="text-[9px] text-muted-foreground">Жишээ бол сурагчдын бодлогын өгүүлбэрт харагдана.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={newCase.is_sample}
                      onChange={(e) => setNewCase({ ...newCase, is_sample: e.target.checked })}
                      className="w-4 h-4 accent-brand-cyan rounded cursor-pointer"
                    />
                  </div>
                  <Button type="submit" disabled={addMutation.isPending} className="w-full rounded-xl bg-brand-cyan text-black font-bold h-10 text-xs">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Тест кэйс нэмэх
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Bulk ZIP Upload */}
            <Card className="glass-strong border-white/5 rounded-3xl p-5">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <FileArchive className="w-4 h-4 text-brand-violet" />
                  ZIP файлаар багцаар оруулах
                </CardTitle>
                <CardDescription>Олон тестийг нэг дор уншуулах.</CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0 space-y-4">
                <div className="p-3 bg-secondary/30 rounded-2xl text-[10px] text-muted-foreground border border-white/5 leading-relaxed">
                  <span className="font-bold text-foreground block mb-1">ZIP файлын доторх бүтэц:</span>
                  1. Оролт, гаралтын хослолууд: <span className="font-mono text-foreground">input1.txt</span>, <span className="font-mono text-foreground">output1.txt</span> эсвэл <span className="font-mono text-foreground">1.in</span>, <span className="font-mono text-foreground">1.out</span> дугаараар давхцах ёстой.<br/>
                  2. Сампл тест бол: нэрэндээ <span className="font-mono text-foreground">sample</span> гэдэг үг оруулна.
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold">Тест ZIP файл сонгох</Label>
                  <Input
                    type="file"
                    accept=".zip"
                    onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                    className="h-10 rounded-xl bg-card border-white/10 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold">Нэг тестэнд оноох оноо</Label>
                  <Input
                    type="number"
                    value={pointsPerCase}
                    onChange={(e) => setPointsPerCase(parseInt(e.target.value))}
                    className="h-9 rounded-xl bg-card font-mono text-xs"
                  />
                </div>
                <Button 
                  onClick={handleZipUploadSubmit}
                  disabled={!zipFile || zipUploadMutation.isPending}
                  className="w-full rounded-xl bg-white text-black font-bold h-10 text-xs"
                >
                  <Upload className="w-3.5 h-3.5 mr-1" /> ZIP хуулж задлах
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: List and inline editor */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-sm font-bold text-foreground">Нийт бүртгэлтэй тестүүд ({testcases.length})</h3>
            
            {testcases.length > 0 ? (
              <div className="space-y-4">
                {testcases.map((tc) => {
                  const isEditing = editingId === tc.id;
                  
                  return (
                    <div 
                      key={tc.id} 
                      className={`glass-strong p-5 rounded-3xl border transition-all ${
                        isEditing ? "border-brand-cyan/40 bg-white/5" : "border-white/5"
                      }`}
                    >
                      {/* Top Bar inside Item */}
                      <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">Order: #{tc.order}</span>
                          <Badge className="text-[9px] px-2 py-0 bg-brand-cyan/10 text-brand-cyan border-none">
                            {tc.points} оноо
                          </Badge>
                          {tc.is_sample && (
                            <Badge className="text-[9px] px-2 py-0 bg-brand-amber/15 text-brand-amber border-none">
                              Жишээ (Sample)
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={handleSaveEdit}
                                disabled={updateMutation.isPending}
                                className="h-8 w-8 rounded-lg text-brand-emerald hover:bg-brand-emerald/10"
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => { setEditingId(null); setEditingCase(null); }}
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
                                onClick={() => handleStartEdit(tc)}
                                className="h-8 w-8 rounded-lg text-brand-cyan hover:bg-brand-cyan/10"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => {
                                  if (window.confirm("Устгах уу?")) {
                                    deleteMutation.mutate(tc.id);
                                  }
                                }}
                                className="h-8 w-8 rounded-lg text-rose-500 hover:bg-rose-500/10"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Content inside Item */}
                      {isEditing ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold">Оролт (Input)</Label>
                              <textarea
                                value={editingCase.input_data}
                                onChange={(e) => setEditingCase({ ...editingCase, input_data: e.target.value })}
                                className="w-full h-20 bg-card border border-border text-foreground px-2 py-1.5 rounded-lg text-xs font-mono focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold">Гаралт (Output)</Label>
                              <textarea
                                value={editingCase.output_data}
                                onChange={(e) => setEditingCase({ ...editingCase, output_data: e.target.value })}
                                className="w-full h-20 bg-card border border-border text-foreground px-2 py-1.5 rounded-lg text-xs font-mono focus:outline-none"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <Label className="text-[10px] font-bold">Оноо</Label>
                              <Input
                                type="number"
                                value={editingCase.points}
                                onChange={(e) => setEditingCase({ ...editingCase, points: parseInt(e.target.value) })}
                                className="h-8 rounded-lg text-xs font-mono"
                              />
                            </div>
                            <div>
                              <Label className="text-[10px] font-bold">Дараалал</Label>
                              <Input
                                type="number"
                                value={editingCase.order}
                                onChange={(e) => setEditingCase({ ...editingCase, order: parseInt(e.target.value) })}
                                className="h-8 rounded-lg text-xs font-mono"
                              />
                            </div>
                            <div className="flex items-center justify-between px-2 pt-5">
                              <Label className="text-[10px] font-bold">Жишээ үү?</Label>
                              <input
                                type="checkbox"
                                checked={editingCase.is_sample}
                                onChange={(e) => setEditingCase({ ...editingCase, is_sample: e.target.checked })}
                                className="w-4 h-4 accent-brand-cyan"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Оролт (Input)</span>
                            <div className="bg-black/20 p-2.5 rounded-xl font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-24">
                              {tc.input_data}
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Гаралт (Output)</span>
                            <div className="bg-black/20 p-2.5 rounded-xl font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-24">
                              {tc.output_data}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 border border-dashed border-white/10 rounded-3xl text-center text-xs text-muted-foreground">
                Энэ бодлогод тест кэйс хараахан байхгүй байна. Багцаар эсвэл гараар нэмнэ үү.
              </div>
            )}
          </div>
        </div>
      </div>
    </RoleGate>
  );
}
