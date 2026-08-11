"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";
import { 
  ArrowLeft, Save, Play, Send, FileCode, CheckCircle2, 
  Loader2, RefreshCw, Terminal, Layers, FileText, Settings, 
  HelpCircle, AlertCircle, Plus, Trash2, Eye, X, Upload, Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import toast from "react-hot-toast";
import { RoleGate } from "@/components/role-gate";
import { workspaceApi } from "@/lib/api/workspace";
import { problemApi } from "@/lib/api/problems";
import { MarkdownRenderer } from "@/components/markdown-renderer";

const getFileLanguage = (filename: string) => {
  if (filename.endsWith(".cpp") || filename.endsWith(".h")) return "cpp";
  if (filename.endsWith(".py")) return "python";
  if (filename.endsWith(".yml") || filename.endsWith(".yaml")) return "yaml";
  if (filename.endsWith(".md")) return "markdown";
  return "plaintext";
};

export default function ProblemWorkspacePage() {
  const { code } = useParams() as { code: string };
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeFile, setActiveFile] = useState<string>("statement.md");
  const [editorContent, setEditorContent] = useState<string>("");
  const [unsavedChanges, setUnsavedChanges] = useState<boolean>(false);
  
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newFileName, setNewFileName] = useState<string>("");
  const [newFileTemplate, setNewFileTemplate] = useState<string>("");
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [isUploadingAsset, setIsUploadingAsset] = useState<boolean>(false);

  // Export & Delete state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Generator params
  const [genParams, setGenParams] = useState<string>("5 10\n10 100\n100 1000");
  const [pointsPerCase, setPointsPerCase] = useState<number>(10);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // Solution verification states
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verifyResult, setVerifyResult] = useState<{ status: string; error_log: string | null; results: any[] } | null>(null);

  // Publish Metadata Form
  const [metadata, setMetadata] = useState({
    title: "",
    time_limit: 1.0,
    memory_limit: 64,
    difficulty: "Bronze",
    topic: "Brute Force",
    olympiad_scope: "Сургалтын Дасгал",
    division: "Ахлах анги (10-12 анги)",
    olympiad_year: new Date().getFullYear(),
    source_citation: "",
  });

  // Query: Get available files list
  const { data: files = [], isLoading: filesLoading, refetch: refetchFiles } = useQuery({
    queryKey: ["workspace-files", code],
    queryFn: () => workspaceApi.listFiles(code),
  });

  // Query: Get active file content
  const { data: fileData, isLoading: contentLoading } = useQuery({
    queryKey: ["workspace-file-content", code, activeFile],
    queryFn: () => workspaceApi.getFile(code, activeFile),
    enabled: !!activeFile && files.includes(activeFile),
  });

  // Query: Get published problem details to prefill metadata
  const { data: publishedProblem } = useQuery({
    queryKey: ["published-problem", code],
    queryFn: () => problemApi.get(code).catch(() => null),
  });

  useEffect(() => {
    if (fileData) {
      setEditorContent(fileData.content);
      setUnsavedChanges(false);
    }
  }, [fileData]);

  // Load generator.params and generator.points from drafts if they exist
  useEffect(() => {
    if (files.includes("generator.params")) {
      workspaceApi.getFile(code, "generator.params").then(data => {
        if (data && data.content) setGenParams(data.content);
      }).catch(err => console.error("Failed to load generator.params", err));
    }
    if (files.includes("generator.points")) {
      workspaceApi.getFile(code, "generator.points").then(data => {
        if (data && data.content) {
          const pts = parseInt(data.content);
          if (!isNaN(pts)) setPointsPerCase(pts);
        }
      }).catch(err => console.error("Failed to load generator.points", err));
    }
  }, [files, code]);

  useEffect(() => {
    if (publishedProblem) {
      setMetadata({
        title: publishedProblem.title,
        time_limit: publishedProblem.time_limit,
        memory_limit: publishedProblem.memory_limit,
        difficulty: publishedProblem.difficulty,
        topic: publishedProblem.topic,
        olympiad_scope: publishedProblem.olympiad_scope,
        division: publishedProblem.division,
        olympiad_year: publishedProblem.olympiad_year || new Date().getFullYear(),
        source_citation: publishedProblem.source_citation || "",
      });
    } else {
      setMetadata(prev => ({ ...prev, title: code }));
    }
  }, [publishedProblem, code]);

  // Mutations
  const saveMutation = useMutation({
    mutationFn: () => workspaceApi.saveFile(code, activeFile, editorContent),
    onSuccess: () => {
      setUnsavedChanges(false);
      toast.success("Файл амжилттай хадгалагдлаа.");
    },
    onError: () => toast.error("Файл хадгалахад алдаа гарлаа.")
  });

  const createFileMutation = useMutation({
    mutationFn: ({ filename, templateType }: { filename: string; templateType?: string }) => 
      workspaceApi.createFile(code, filename, templateType),
    onSuccess: (res) => {
      toast.success(res.message || "Файл амжилттай үүслээ.");
      setShowCreateModal(false);
      setNewFileName("");
      setNewFileTemplate("");
      void refetchFiles();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Файл үүсгэхэд алдаа гарлаа.";
      toast.error(msg);
    }
  });

  const deleteFileMutation = useMutation({
    mutationFn: (filename: string) => workspaceApi.deleteFile(code, filename),
    onSuccess: (res, filename) => {
      toast.success(res.message || "Файл устгагдлаа.");
      if (activeFile === filename) {
        setActiveFile("statement.md");
      }
      void refetchFiles();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Файл устгахад алдаа гарлаа.";
      toast.error(msg);
    }
  });

  const generateMutation = useMutation({
    mutationFn: () => {
      const paramsList = genParams.split("\n").map(p => p.trim()).filter(p => p.length > 0);
      return workspaceApi.generateTestcases(code, paramsList, pointsPerCase);
    },
    onSuccess: (res) => {
      toast.success(res.message || "Тест кэйсүүд амжилттай үүслээ.");
      void refetchFiles();
      setActiveFile("init.yml");
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Тест үүсгэхэд алдаа гарлаа.";
      toast.error(msg);
    }
  });

  const uploadZipMutation = useMutation({
    mutationFn: (file: File) => workspaceApi.uploadTestcasesZip(code, file, pointsPerCase),
    onSuccess: (res) => {
      toast.success(res.message || "Тестүүдийг ZIP-ээс амжилттай орууллаа.");
      void refetchFiles();
      setActiveFile("init.yml");
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "ZIP файл оруулахад алдаа гарлаа.";
      toast.error(msg);
    }
  });

  const verifySolutionMutation = useMutation({
    mutationFn: () => workspaceApi.testSolution(code),
    onSuccess: (res) => {
      setVerifyResult(res);
      if (res.status === "AC") {
        toast.success("Зөв шийдэл (solution.cpp) бүх тестүүдийг амжилттай давлаа!");
      } else if (res.status === "CE") {
        toast.error("Компиляцийн алдаа гарлаа!");
      } else {
        toast.error(`Зарим тест дээр алдаа гарлаа: ${res.status}`);
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Тестлэхэд алдаа гарлаа.";
      toast.error(msg);
    }
  });

  const publishMutation = useMutation({
    mutationFn: () => workspaceApi.publish(code, metadata),
    onSuccess: (res) => {
      toast.success(res.message || "Бодлого амжилттай нийтлэгдлээ!");
      queryClient.invalidateQueries({ queryKey: ["problem", code] });
      queryClient.invalidateQueries({ queryKey: ["problems"] });
      router.push(`/teacher/problems`);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Нийтлэхэд алдаа гарлаа.";
      toast.error(msg);
    }
  });

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setEditorContent(value);
      setUnsavedChanges(true);
    }
  };

  const handleSelectFile = (file: string) => {
    if (unsavedChanges) {
      if (confirm("Танд хадгалаагүй өөрчлөлт байна. Хадгалахгүйгээр шилжих үү?")) {
        setActiveFile(file);
      }
    } else {
      setActiveFile(file);
    }
  };

  const handleSave = () => {
    saveMutation.mutate();
  };

  const handleDeleteFile = (e: React.MouseEvent, filename: string) => {
    e.stopPropagation();
    if (confirm(`'${filename}' файлыг устгах уу?`)) {
      deleteFileMutation.mutate(filename);
    }
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAsset(true);
    try {
      const res = await workspaceApi.uploadImage(code, file);
      toast.success("Зураг амжилттай хуулагдлаа!");
      // Insert relative path markdown
      const markdownLink = `![${file.name.split(".")[0]}](assets/${res.filename})`;
      setEditorContent(prev => prev + "\n" + markdownLink + "\n");
      setUnsavedChanges(true);
      void refetchFiles();
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Зураг хуулахад алдаа гарлаа.";
      toast.error(msg);
    } finally {
      setIsUploadingAsset(false);
      e.target.value = "";
    }
  };

  const handleCreateFile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    createFileMutation.mutate({ filename: newFileName.trim(), templateType: newFileTemplate });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await problemApi.exportProblem(code);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `problem_${code}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Бодлогыг амжилттай экспортлолоо.");
    } catch (err: any) {
      console.error(err);
      toast.error("Экспортлоход алдаа гарлаа.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await problemApi.deleteProblem(code);
      toast.success("Бодлого амжилттай устгагдлаа.");
      router.push("/teacher/problems");
    } catch (err: any) {
      console.error(err);
      const msg = err.response?.data?.detail || "Бодлого устгахад алдаа гарлаа.";
      toast.error(msg);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Group files in Explorer
  const publicFiles = files.filter(f => f === "statement.md" || f.startsWith("assets/"));
  const privateFiles = files.filter(f => 
    f !== "statement.md" && 
    !f.startsWith("assets/") && 
    !f.startsWith("cases/") && 
    f !== "generator.params" && 
    f !== "generator.points"
  );
  const caseFiles = files.filter(f => f.startsWith("cases/"));

  return (
    <RoleGate roles={["teacher", "admin"]}>
      <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
        {/* Top Header */}
        <header className="h-14 glass border-b border-border px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Link href={`/teacher/problems`}>
              <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-brand-cyan font-bold">#{code}</span>
                <h1 className="text-sm font-black">Бодлогын Workspace (Polygon)</h1>
                {unsavedChanges && (
                  <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 bg-amber-500/10">
                    Хадгалаагүй
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeFile === "statement.md" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPreviewOpen(true)}
                className="h-8 text-xs border-border glass gap-1.5 font-bold text-brand-cyan hover:bg-brand-cyan/10"
              >
                <Eye className="w-3.5 h-3.5" />
                Харах (Preview)
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={!unsavedChanges || saveMutation.isPending}
              className="h-8 text-xs border-border glass gap-1.5 font-bold text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Хадгалах (Save)
            </Button>

            <Link href={`/problems/${code}`} target="_blank">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs border-border glass gap-1.5 font-bold text-brand-cyan border-brand-cyan/20 hover:bg-brand-cyan/10 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Сурагчаар тестлэх (Submit)
              </Button>
            </Link>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={isExporting}
              className="h-8 text-xs border-border glass gap-1.5 font-bold text-blue-400 border-blue-500/20 hover:bg-blue-500/10"
            >
              {isExporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Экспортлох (Export ZIP)
            </Button>

            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              className="h-8 text-xs gap-1.5 font-bold bg-rose-600/90 hover:bg-rose-600 text-white"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Бодлого устгах
            </Button>
          </div>
        </header>

        {/* Main Workspace split */}
        <div className="flex-1 flex overflow-hidden">
          {/* File Explorer (Left side bar) */}
          <div className="w-60 border-r border-border bg-card/20 p-4 flex flex-col gap-4 shrink-0 overflow-y-auto scrollbar-thin">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Explorer</h3>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  onClick={() => setShowCreateModal(true)} 
                  className="w-5 h-5 rounded-md hover:bg-secondary text-brand-cyan"
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Public Assets / Statement */}
              <div className="mb-4">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 px-2 mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3 h-3 text-brand-cyan" />
                  Public Assets (Нээлттэй)
                </div>
                <div className="space-y-0.5">
                  {filesLoading ? (
                    <div className="flex items-center justify-center p-2"><Loader2 className="w-3 h-3 animate-spin text-brand-cyan" /></div>
                  ) : (
                    publicFiles.map((file) => {
                      const isActive = file === activeFile;
                      const isStatement = file === "statement.md";
                      return (
                        <div
                          key={file}
                          onClick={() => handleSelectFile(file)}
                          className={`group w-full text-left px-3 py-1.5 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-all border border-transparent ${
                            isActive 
                              ? "bg-brand-cyan/20 text-brand-cyan border-brand-cyan/20 font-bold" 
                              : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileText className="w-3.5 h-3.5 shrink-0 text-brand-cyan" />
                            <span className="truncate">{file}</span>
                          </div>
                          {!isStatement && (
                            <button
                              onClick={(e) => handleDeleteFile(e, file)}
                              className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all p-0.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Private Code / Config */}
              <div className="mb-4">
                <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 px-2 mb-1.5 flex items-center gap-1.5">
                  <FileCode className="w-3 h-3 text-brand-violet" />
                  Private Files (Нууцлагдмал)
                </div>
                <div className="space-y-0.5">
                  {privateFiles.map((file) => {
                    const isActive = file === activeFile;
                    const isSystemFile = ["init.yml", "solution.cpp", "generator.cpp"].includes(file);
                    return (
                      <div
                        key={file}
                        onClick={() => handleSelectFile(file)}
                        className={`group w-full text-left px-3 py-1.5 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-all border border-transparent ${
                          isActive 
                            ? "bg-brand-violet/20 text-brand-violet border-brand-violet/20 font-bold" 
                            : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileCode className="w-3.5 h-3.5 shrink-0 text-brand-violet" />
                          <span className="truncate">{file}</span>
                        </div>
                        {!isSystemFile && (
                          <button
                            onClick={(e) => handleDeleteFile(e, file)}
                            className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all p-0.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            
            {/* Direct Case files listing under a separate section */}
            <div className="flex-1 min-h-[150px]">
              <h3 className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-2">Тест кэйсүүд</h3>
              <div className="space-y-0.5 max-h-48 overflow-y-auto scrollbar-thin">
                {caseFiles.map(file => {
                  const isActive = file === activeFile;
                  return (
                    <button
                      key={file}
                      onClick={() => handleSelectFile(file)}
                      className={`w-full text-left px-3 py-1 rounded-lg text-[10px] font-mono flex items-center gap-2 transition-all border border-transparent ${
                        isActive 
                          ? "bg-brand-violet/10 text-brand-violet border-brand-violet/10 font-bold" 
                          : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Layers className="w-3 h-3 shrink-0" />
                      <span className="truncate">{file.replace("cases/", "")}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Code Editor Area (Center) */}
          <div className="flex-1 flex flex-col bg-card/10 overflow-hidden relative">
            <div className="h-8 bg-secondary border-b border-border px-4 flex items-center justify-between text-[11px] font-mono text-muted-foreground shrink-0">
              <div className="flex items-center gap-4">
                <span>{activeFile}</span>
                {activeFile === "statement.md" && (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 px-2 py-0.5 rounded bg-brand-cyan/25 border border-brand-cyan/20 text-brand-cyan hover:bg-brand-cyan/35 cursor-pointer text-[9px] font-black transition-all">
                      <Upload className="w-3 h-3" />
                      Зураг хуулах (Upload Image)
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleUploadImage}
                        className="hidden"
                        disabled={isUploadingAsset}
                      />
                    </label>
                    {isUploadingAsset && <Loader2 className="w-3 h-3 animate-spin text-brand-cyan" />}
                  </div>
                )}
              </div>
              <span>{getFileLanguage(activeFile).toUpperCase()}</span>
            </div>

            <div className="flex-1 relative">
              {contentLoading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                  <RefreshCw className="w-8 h-8 text-brand-cyan animate-spin" />
                </div>
              ) : (
                <Editor
                  height="100%"
                  language={getFileLanguage(activeFile)}
                  theme="vs-dark"
                  value={editorContent}
                  onChange={handleEditorChange}
                  options={{
                    fontSize: 13,
                    fontFamily: "var(--font-mono)",
                    minimap: { enabled: false },
                    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                    lineNumbersMinChars: 3,
                  }}
                />
              )}
            </div>
          </div>

          {/* Right Panel: Generator and Publish Tabs */}
          <div className="w-80 border-l border-border bg-card/20 p-4 flex flex-col overflow-y-auto scrollbar-thin shrink-0">
            <Tabs defaultValue="generator" className="w-full flex-1 flex flex-col">
              <TabsList className="bg-secondary p-1 rounded-xl w-full grid grid-cols-3 mb-4">
                <TabsTrigger value="generator" className="text-xs rounded-lg">Ген</TabsTrigger>
                <TabsTrigger value="verify" className="text-xs rounded-lg">Шалгах</TabsTrigger>
                <TabsTrigger value="publish" className="text-xs rounded-lg">Нийтлэх</TabsTrigger>
              </TabsList>

              <TabsContent value="generator" className="space-y-4 flex-1 m-0">
                <Card className="glass-strong border-white/5 rounded-2xl p-4">
                  <CardHeader className="p-0 mb-3">
                    <CardTitle className="text-xs font-bold flex items-center gap-1.5">
                      <Play className="w-4 h-4 text-brand-cyan" />
                      Тест кэйсүүд үүсгэх
                    </CardTitle>
                    <CardDescription className="text-[10px]">
                      generator.cpp болон solution.cpp-ийг ашиглан тест кэйсийг автоматаар бэлтгэх.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Генераторын параметрүүд (мөр бүрт нэг)</Label>
                      <textarea
                        value={genParams}
                        onChange={(e) => setGenParams(e.target.value)}
                        placeholder="Жишээ нь:&#10;5 10&#10;10 100&#10;1000 5000"
                        className="w-full h-32 bg-card border border-border text-foreground px-3 py-2 rounded-xl text-xs font-mono focus:outline-none focus:ring-1 focus:ring-brand-cyan leading-relaxed"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Тест тус бүрийн оноо</Label>
                        <Input
                          type="number"
                          value={pointsPerCase}
                          onChange={(e) => setPointsPerCase(parseInt(e.target.value))}
                          className="h-8 rounded-xl bg-card font-mono text-xs"
                        />
                      </div>
                    </div>

                    <Button 
                      onClick={() => generateMutation.mutate()} 
                      disabled={generateMutation.isPending}
                      className="w-full rounded-xl bg-brand-cyan text-black font-bold h-9 text-xs"
                    >
                      {generateMutation.isPending ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Шүүж байна...</>
                      ) : (
                        <><RefreshCw className="w-3.5 h-3.5 mr-1" /> Тестүүд үүсгэх</>
                      )}
                    </Button>

                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-border/40"></div>
                      <span className="flex-shrink mx-2 text-[9px] text-muted-foreground font-black uppercase tracking-widest">ЭСВЭЛ</span>
                      <div className="flex-grow border-t border-border/40"></div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                        Тестүүдийг ZIP файлаар оруулах
                      </Label>
                      
                      <div className="border border-dashed border-border/80 hover:border-brand-cyan/60 rounded-xl p-3 text-center transition-all cursor-pointer relative bg-secondary/10">
                        <input
                          type="file"
                          accept=".zip"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              uploadZipMutation.mutate(file);
                            }
                          }}
                          disabled={uploadZipMutation.isPending}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div className="flex flex-col items-center gap-1">
                          {uploadZipMutation.isPending ? (
                            <>
                              <Loader2 className="w-5 h-5 text-brand-cyan animate-spin" />
                              <span className="text-[10px] font-bold text-brand-cyan">ZIP хуулж байна...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-5 h-5 text-muted-foreground" />
                              <span className="text-[10px] font-bold">cases.zip файл сонгох</span>
                              <span className="text-[8px] text-muted-foreground">(.in/.out хосууд эсвэл init.yml бүхий zip)</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="verify" className="space-y-4 flex-1 m-0">
                <Card className="glass-strong border-white/5 rounded-2xl p-4">
                  <CardHeader className="p-0 mb-3">
                    <CardTitle className="text-xs font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      Бодолт шалгах (Verify)
                    </CardTitle>
                    <CardDescription className="text-[10px]">
                      Model solution (solution.cpp) кодыг одоогийн draft тестүүд (генератороор үүссэн эсвэл ZIP-ээр орсон) дээр ажиллуулж шалгах.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 space-y-4">
                    <Button
                      onClick={() => verifySolutionMutation.mutate()}
                      disabled={verifySolutionMutation.isPending}
                      className="w-full h-9 text-xs gradient-brand text-white border-0 hover:opacity-90 font-bold gap-1.5 shadow-md shadow-brand-cyan/10"
                    >
                      {verifySolutionMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Код шалгаж байна...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Бодолтыг тестлэх
                        </>
                      )}
                    </Button>

                    {verifyResult && (
                      <div className="space-y-3 pt-2">
                        {/* Overall Status */}
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground">Ерөнхий статус:</span>
                          <span className={`px-2 py-0.5 rounded-lg font-mono font-bold text-[10px] ${
                            verifyResult.status === "AC"
                              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                          }`}>
                            {verifyResult.status}
                          </span>
                        </div>

                        {/* Compilation Error Log */}
                        {verifyResult.status === "CE" && (
                          <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-3 text-[10px] font-mono text-rose-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                            {verifyResult.error_log}
                          </div>
                        )}

                        {/* Testcase results list */}
                        {verifyResult.results && verifyResult.results.length > 0 && (
                          <div className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin pr-1">
                            {verifyResult.results.map((res: any) => (
                              <div key={res.id} className="bg-white/5 border border-white/5 rounded-xl p-2.5 space-y-1 text-[10px]">
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-bold text-muted-foreground">#{res.id} ({res.input_file.split('/').pop()})</span>
                                  <span className={`px-1.5 py-0.2 rounded font-mono font-bold text-[9px] ${
                                    res.status === "AC" ? "text-emerald-500 bg-emerald-500/10" : "text-rose-500 bg-rose-500/10"
                                  }`}>
                                    {res.status}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-[9px] text-muted-foreground font-mono">
                                  <span>{res.time_ms} ms</span>
                                  <span>{res.memory_kb >= 1024 ? `${(res.memory_kb / 1024).toFixed(1)} MB` : `${res.memory_kb} KB`}</span>
                                </div>
                                {res.checker_output && (
                                  <div className="mt-1 bg-black/40 p-1.5 rounded text-[8px] font-mono text-slate-300 max-h-24 overflow-y-auto whitespace-pre-wrap">
                                    {res.checker_output}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="publish" className="space-y-4 flex-1 m-0">
                <Card className="glass-strong border-white/5 rounded-2xl p-4">
                  <CardHeader className="p-0 mb-3">
                    <CardTitle className="text-xs font-bold flex items-center gap-1.5">
                      <Send className="w-4 h-4 text-brand-violet" />
                      Бодлогыг нийтлэх
                    </CardTitle>
                    <CardDescription className="text-[10px]">
                      Ажлын талбар дахь файлуудыг багцлаад бодит бодлого болгон нийтлэх.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 space-y-3.5">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold">Бодлогын нэр (Title)</Label>
                      <Input
                        value={metadata.title}
                        onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                        className="h-8 rounded-xl bg-card text-xs"
                        placeholder="Жишээ: Хоёр тооны нийлбэр"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold">Цагийн хязгаар (сек)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          value={metadata.time_limit}
                          onChange={(e) => setMetadata({ ...metadata, time_limit: parseFloat(e.target.value) })}
                          className="h-8 rounded-xl bg-card text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold">Санах ойн хязгаар (MB)</Label>
                        <Input
                          type="number"
                          value={metadata.memory_limit}
                          onChange={(e) => setMetadata({ ...metadata, memory_limit: parseInt(e.target.value) })}
                          className="h-8 rounded-xl bg-card text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold">Хүндрэл (Difficulty)</Label>
                        <select
                          value={metadata.difficulty}
                          onChange={(e) => setMetadata({ ...metadata, difficulty: e.target.value })}
                          className="w-full h-8 rounded-xl bg-card text-xs border border-border px-2 focus:outline-none"
                        >
                          <option value="Bronze">Bronze</option>
                          <option value="Silver">Silver</option>
                          <option value="Gold">Gold</option>
                          <option value="Platinum">Platinum</option>
                          <option value="Diamond">Diamond</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold">Сэдэв (Topic)</Label>
                        <Input
                          value={metadata.topic}
                          onChange={(e) => setMetadata({ ...metadata, topic: e.target.value })}
                          className="h-8 rounded-xl bg-card text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold">Олимпиадын түвшин</Label>
                      <select
                        value={metadata.olympiad_scope}
                        onChange={(e) => setMetadata({ ...metadata, olympiad_scope: e.target.value })}
                        className="w-full h-8 rounded-xl bg-card text-xs border border-border px-2 focus:outline-none"
                      >
                        <option value="Олон Улс (IOI, APIO)">Олон Улс (IOI, APIO)</option>
                        <option value="Улсын Олимпиад (Finals)">Улсын Олимпиад (Finals)</option>
                        <option value="Аймаг / Нийслэл">Аймаг / Нийслэл</option>
                        <option value="Дүүрэг / Сургууль">Дүүрэг / Сургууль</option>
                        <option value="Их Дээд Сургууль (ICPC)">Их Дээд Сургууль (ICPC)</option>
                        <option value="Сургалтын Дасгал">Сургалтын Дасгал</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold">Насны ангилал</Label>
                        <select
                          value={metadata.division}
                          onChange={(e) => setMetadata({ ...metadata, division: e.target.value })}
                          className="w-full h-8 rounded-xl bg-card text-xs border border-border px-2 focus:outline-none"
                        >
                          <option value="Бага анги (3-5 анги)">Бага анги (3-5)</option>
                          <option value="Дунд анги (6-9 анги)">Дунд анги (6-9)</option>
                          <option value="Ахлах анги (10-12 анги)">Ахлах анги (10-12)</option>
                          <option value="Багш нарын ангилал">Багш</option>
                          <option value="Ерөнхий">Ерөнхий</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold">Зохиогдсон он</Label>
                        <Input
                          type="number"
                          value={metadata.olympiad_year}
                          onChange={(e) => setMetadata({ ...metadata, olympiad_year: parseInt(e.target.value) })}
                          className="h-8 rounded-xl bg-card text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold">Эх сурвалж (Citation)</Label>
                      <Input
                        value={metadata.source_citation}
                        onChange={(e) => setMetadata({ ...metadata, source_citation: e.target.value })}
                        className="h-8 rounded-xl bg-card text-xs"
                        placeholder="Жишээ: 2024 Нийслэлийн олимпиад 3-р бодлого"
                      />
                    </div>

                    <Button 
                      onClick={() => publishMutation.mutate()} 
                      disabled={publishMutation.isPending}
                      className="w-full rounded-xl bg-brand-violet text-white font-bold h-9 text-xs"
                    >
                      {publishMutation.isPending ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Нийтэлж байна...</>
                      ) : (
                        <><Send className="w-3.5 h-3.5 mr-1" /> Бодлого Нийтлэх</>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      {/* CREATE FILE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card w-full max-w-sm rounded-2xl border border-border shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <h2 className="text-sm font-bold flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-brand-cyan" />
                Шинэ файл үүсгэх
              </h2>
              <Button size="icon" variant="ghost" className="h-6 w-6 rounded-md" onClick={() => setShowCreateModal(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <form onSubmit={handleCreateFile} className="space-y-3.5">
              <div className="space-y-1">
                <Label className="text-[10px] font-bold">Файлын нэр (Filename)</Label>
                <Input 
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="Жишээ: checker.cpp"
                  className="h-8 text-xs rounded-xl bg-secondary"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold">Загвар сонгох (Optional)</Label>
                <select
                  value={newFileTemplate}
                  onChange={(e) => setNewFileTemplate(e.target.value)}
                  className="w-full h-8 rounded-xl bg-secondary text-xs border border-border px-2 focus:outline-none"
                >
                  <option value="">Хоосон файл</option>
                  <option value="checker">C++ Testlib Checker (Бутархай тоо шалгах)</option>
                  <option value="generator">C++ Testlib Generator (Аргумент унших)</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 h-8 rounded-xl text-xs"
                >
                  Цуцлах
                </Button>
                <Button 
                  type="submit" 
                  disabled={createFileMutation.isPending}
                  className="flex-1 h-8 rounded-xl bg-brand-cyan text-black font-bold text-xs"
                >
                  {createFileMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Үүсгэх"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MARKDOWN PREVIEW MODAL */}
      {isPreviewOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-background w-full max-w-4xl h-[85vh] rounded-3xl border border-border shadow-2xl flex flex-col overflow-hidden">
            <div className="h-14 border-b border-border px-6 flex items-center justify-between shrink-0 bg-card/40">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-brand-cyan" />
                <span className="font-black text-sm">Бодлогын өгүүлбэр харах (Preview)</span>
              </div>
              <Button size="icon" variant="ghost" className="h-9 w-9 rounded-xl hover:bg-secondary" onClick={() => setIsPreviewOpen(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
              <MarkdownRenderer content={editorContent} problemCode={code} isDraft={true} />
            </div>
            <div className="h-12 border-t border-border px-6 flex items-center justify-end bg-card/25 shrink-0">
              <Button onClick={() => setIsPreviewOpen(false)} className="h-8 px-4 text-xs font-bold rounded-xl bg-secondary hover:bg-secondary/80">
                Хаах
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card w-full max-w-sm rounded-2xl border border-border shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <h2 className="text-sm font-bold flex items-center gap-1.5 text-rose-500">
                <AlertCircle className="w-4 h-4" />
                Бодлого устгах уу?
              </h2>
              <Button size="icon" variant="ghost" className="h-6 w-6 rounded-md" onClick={() => setShowDeleteConfirm(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground leading-relaxed">
              Та энэ бодлогыг устгахдаа итгэлтэй байна уу? Устгасан бодлогын бүх тестүүд болон түүх дахин сэргээгдэхгүйгээр устгагдах болно.
            </p>

            <div className="flex gap-2 pt-2">
              <Button 
                variant="outline" 
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 h-8 rounded-xl text-xs"
              >
                Цуцлах
              </Button>
              <Button 
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 h-8 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Устгах"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </RoleGate>
  );
}
