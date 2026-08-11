"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, FileText, CheckCircle, XCircle,
  Download, Plus, Edit2, Save, Trash2, ExternalLink, Sparkles, Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { aiCuratorApi, TopicData } from "@/lib/api/ai-curator";
import { authApi } from "@/lib/api/auth";
import toast from "react-hot-toast";

export default function AICuratorPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [dataList, setDataList] = useState<TopicData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("drafts");

  // Ingestion Form State
  const [newTopic, setNewTopic] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Scraper State
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scrapeTopic, setScrapeTopic] = useState("");
  const [isScraping, setIsScraping] = useState(false);

  // Edit State
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTopic, setEditTopic] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const res = await aiCuratorApi.listAll();
      setDataList(res);
    } catch (err) {
      logger.error("Failed to load curated AI data", err);
      toast.error("Дата ачаалахад алдаа гарлаа.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    authApi.me()
      .then((user) => setCurrentUser(user))
      .catch((err) => console.log("curator load user error:", err));
  }, []);

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopic || !newTitle || !newContent) {
      toast.error("Шаардлагатай талбаруудыг бөглөнө үү.");
      return;
    }
    setIsSubmitting(true);
    try {
      await aiCuratorApi.ingest({
        topic: newTopic,
        title: newTitle,
        content_mongolian: newContent,
        source_url: newUrl || undefined,
      });
      toast.success("Мэдээлэл DRAFT санд амжилттай нэмэгдлээ.");
      setNewTopic("");
      setNewTitle("");
      setNewContent("");
      setNewUrl("");
      fetchData();
      setActiveTab("drafts");
    } catch (err) {
      toast.error("Мэдээлэл нэмэхэд алдаа гарлаа.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scrapeUrl || !scrapeTopic) {
      toast.error("Шаардлагатай талбаруудыг бөглөнө үү.");
      return;
    }
    setIsScraping(true);
    try {
      await aiCuratorApi.scrape({
        url: scrapeUrl,
        topic: scrapeTopic
      });
      toast.success("Скрапинг даалгавар илгээгдлээ! Орчуулагдсан онол удахгүй Draft табд орж ирнэ.");
      setScrapeUrl("");
      setScrapeTopic("");
      // Poll drafts after a few seconds
      setTimeout(fetchData, 4000);
    } catch (err) {
      toast.error("Скрапинг хийхэд алдаа гарлаа.");
    } finally {
      setIsScraping(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      const isEditingThis = editingId === id;
      const payload = isEditingThis ? {
        topic: editTopic,
        title: editTitle,
        content_mongolian: editContent
      } : {};
      
      await aiCuratorApi.approve(id, payload);
      toast.success("Материал батлагдлаа! Векторжуулах даалгавар Celery-д илгээгдэв.");
      setEditingId(null);
      fetchData();
    } catch (err) {
      toast.error("Материал батлахад алдаа гарлаа.");
    }
  };

  const handleReject = async (id: number) => {
    try {
      await aiCuratorApi.reject(id);
      toast.success("Материал татгалзсан төлөвт шилжлээ.");
      fetchData();
    } catch (err) {
      toast.error("Алдаа гарлаа.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Та энэ RAG материалыг бааз болон вектор сангаас бүрэн устгахдаа итгэлтэй байна уу?")) return;
    try {
      await aiCuratorApi.delete(id);
      toast.success("Материал бүрэн устгагдлаа.");
      fetchData();
    } catch (err) {
      toast.error("Устгахад алдаа гарлаа.");
    }
  };

  const startEdit = (item: TopicData) => {
    setEditingId(item.id);
    setEditTopic(item.topic);
    setEditTitle(item.title);
    setEditContent(item.content_mongolian);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const drafts = dataList.filter((item) => item.status === "Draft");
  const approved = dataList.filter((item) => item.status === "Approved");
  const rejected = dataList.filter((item) => item.status === "Rejected");

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* ── Main Layout ── */}
      <main className="max-w-7xl mx-auto px-4 pt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Page Header */}
        <div className="lg:col-span-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="bg-purple-500/20 text-purple-500 border-none text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                AI Mentor Curation
              </Badge>
              <h1 className="text-3xl font-black">AI Өгөгдөл Бэлтгэх (Curator)</h1>
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              Оллама загварт зориулсан Монгол хэлний алгоритмын тайлбар, датасет бэлтгэх хоолой
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              id="btn-reindex-all"
              onClick={async () => {
                try {
                  const res = await aiCuratorApi.listAll(); // Or trigger direct reindex if needed
                  // Let's call the API reindex via fetch directly
                  const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/$/, "") ?? "";
                  const token = localStorage.getItem("token");
                  const response = await fetch(`${apiOrigin}/api/v1/ai-tutor/curator/reindex`, {
                    method: "POST",
                    headers: {
                      "Authorization": `Bearer ${token}`
                    }
                  });
                  if (response.ok) {
                    toast.success("Бүх Approved өгөгдлийг дахин векторжуулахаар дараалалд орууллаа!");
                    fetchData();
                  } else {
                    toast.error("Дахин индексжүүлэхэд алдаа гарлаа.");
                  }
                } catch (err) {
                  toast.error("Хүсэлт илгээхэд алдаа гарлаа.");
                }
              }}
              variant="outline"
              className="text-xs font-black h-10 px-4 rounded-xl shadow-md border-border cursor-pointer"
            >
              Бүгдийг дахин векторжуулах
            </Button>

            <a href={aiCuratorApi.getExportUrl()} download>
              <Button
                id="btn-export-dataset"
                className="gradient-brand text-white border-0 text-xs font-black gap-1.5 rounded-xl shadow-md h-10 px-4 cursor-pointer"
              >
                <Download className="w-4 h-4" /> GGUF/Unsloth Dataset JSONL
              </Button>
            </a>
          </div>
        </div>
        
        {/* ── Data Ingestion Column ── */}
        <div className="space-y-6">
          <Tabs defaultValue="manual" className="w-full">
            <TabsList className="bg-secondary/40 rounded-xl p-1 w-full grid grid-cols-2">
              <TabsTrigger value="manual" className="rounded-lg text-xs font-bold gap-1">
                <Plus className="w-3.5 h-3.5" /> Мануал нэмэх
              </TabsTrigger>
              <TabsTrigger value="scrape" className="rounded-lg text-xs font-bold gap-1">
                <Globe className="w-3.5 h-3.5" /> Вэбээс скрапдах
              </TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="mt-4">
              <Card className="glass-strong border-border shadow-xl">
                <CardHeader>
                  <CardTitle className="text-sm font-black flex items-center gap-2">
                    <Plus className="w-4 h-4 text-purple-500" /> Шинэ Онол / Орчуулга нэмэх
                  </CardTitle>
                  <CardDescription className="text-[11px]">
                    Олламаг Монгол хэлээр сургахад ашиглах алгоритмын тайлбарыг энд нэмнэ.
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleIngest}>
                  <CardContent className="space-y-4 text-xs">
                    <div className="space-y-1.5">
                      <Label htmlFor="input-topic">Алгоритмын Сэдэв (Topic)</Label>
                      <Input
                        id="input-topic"
                        placeholder="e.g. Binary Search, Segment Tree"
                        value={newTopic}
                        onChange={(e) => setNewTopic(e.target.value)}
                        className="rounded-xl border-border text-xs"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="input-title">Гарчиг (Title)</Label>
                      <Input
                        id="input-title"
                        placeholder="e.g. Хоёртын хайлтын онол ба хэрэглээ"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="rounded-xl border-border text-xs"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="input-url">Эх сурвалжийн холбоос (Сонголттой)</Label>
                      <Input
                        id="input-url"
                        placeholder="e.g. https://cp-algorithms.com/..."
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                        className="rounded-xl border-border text-xs"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="input-content">Монгол тайлбар / Онолын контент</Label>
                      <textarea
                        id="input-content"
                        placeholder="Математик томъёог KaTeX ($...$), кодын хэсгийг markdown хэлбэрээр бичиж болно."
                        value={newContent}
                        onChange={(e) => setNewContent(e.target.value)}
                        rows={8}
                        className="w-full rounded-xl border border-border p-3 text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-purple-500"
                        required
                      />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      id="btn-submit-ingest"
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full gradient-brand text-white border-0 font-bold rounded-xl cursor-pointer"
                    >
                      {isSubmitting ? "Нэмж байна..." : "DRAFT санд оруулах 🚀"}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </TabsContent>

            <TabsContent value="scrape" className="mt-4">
              <Card className="glass-strong border-border shadow-xl">
                <CardHeader>
                  <CardTitle className="text-sm font-black flex items-center gap-2">
                    <Globe className="w-4 h-4 text-purple-500" /> Вэб хуудсыг хуулж орчуулах
                  </CardTitle>
                  <CardDescription className="text-[11px]">
                    Гадаад вэбсайт (e.g. CP-Algorithms)-аас онолыг автоматаар хуулж, AI ашиглан Монгол хэл рүү хөрвүүлнэ.
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleScrape}>
                  <CardContent className="space-y-4 text-xs">
                    <div className="space-y-1.5">
                      <Label htmlFor="scrape-topic">Алгоритмын Сэдэв (Topic)</Label>
                      <Input
                        id="scrape-topic"
                        placeholder="e.g. Segment Tree, Fenwick Tree"
                        value={scrapeTopic}
                        onChange={(e) => setScrapeTopic(e.target.value)}
                        className="rounded-xl border-border text-xs"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="scrape-url">Хуулах URL холбоос</Label>
                      <Input
                        id="scrape-url"
                        placeholder="e.g. https://cp-algorithms.com/data_structures/segment_tree.html"
                        value={scrapeUrl}
                        onChange={(e) => setScrapeUrl(e.target.value)}
                        className="rounded-xl border-border text-xs"
                        required
                      />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      id="btn-submit-scrape"
                      type="submit"
                      disabled={isScraping}
                      className="w-full gradient-brand text-white border-0 font-bold rounded-xl cursor-pointer"
                    >
                      {isScraping ? "Хуулж, орчуулж байна..." : "Скрапдах ба AI Орчуулах 🌐"}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Curation Board Tabs Column ── */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <TabsList className="bg-secondary/40 rounded-xl p-1">
                <TabsTrigger value="drafts" className="rounded-lg text-xs font-bold gap-1">
                  Drafts
                  <Badge variant="secondary" className="px-1.5 py-0.2 text-[10px]">
                    {drafts.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="approved" className="rounded-lg text-xs font-bold gap-1">
                  Approved
                  <Badge variant="secondary" className="px-1.5 py-0.2 text-[10px] bg-emerald-500/20 text-emerald-500">
                    {approved.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="rejected" className="rounded-lg text-xs font-bold gap-1">
                  Rejected
                  <Badge variant="secondary" className="px-1.5 py-0.2 text-[10px] bg-rose-500/20 text-rose-500">
                    {rejected.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </div>

            <CardContent className="px-0 pt-4">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-xs gap-2">
                  <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
                  <span>Материал ачаалж байна...</span>
                </div>
              ) : (
                <TabsContent value={activeTab} className="space-y-4 mt-0">
                  <AnimatePresence mode="popLayout">
                    {activeTab === "drafts" && drafts.length === 0 && (
                      <div className="text-center py-20 text-muted-foreground text-xs">
                        🎉 Хянах шаардлагатай DRAFT материал байхгүй байна.
                      </div>
                    )}
                    {activeTab === "approved" && approved.length === 0 && (
                      <div className="text-center py-20 text-muted-foreground text-xs">
                        Баталсан онолын тайлбар байхгүй байна. Шинэ дата нэмж баталгаажуулна уу.
                      </div>
                    )}
                    {activeTab === "rejected" && rejected.length === 0 && (
                      <div className="text-center py-20 text-muted-foreground text-xs">
                        Татгалзсан бичлэг байхгүй.
                      </div>
                    )}

                    {/* Data List Loop */}
                    {(activeTab === "drafts" ? drafts : activeTab === "approved" ? approved : rejected).map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="glass-strong border border-border rounded-2xl p-5 shadow-xs relative overflow-hidden"
                      >
                        {editingId === item.id ? (
                          // Edit Mode Form
                          <div className="space-y-4 text-xs">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <Label>Сэдэв</Label>
                                <Input value={editTopic} onChange={(e) => setEditTopic(e.target.value)} className="text-xs" />
                              </div>
                              <div className="space-y-1">
                                <Label>Гарчиг</Label>
                                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="text-xs" />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label>Монгол тайлбар</Label>
                              <textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                rows={8}
                                className="w-full rounded-xl border border-border p-3 text-xs bg-transparent focus:outline-none focus:ring-1 focus:ring-purple-500"
                              />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <Button variant="outline" size="sm" onClick={cancelEdit} className="rounded-lg h-8 text-xs">
                                Цуцлах
                              </Button>
                              <Button onClick={() => handleApprove(item.id)} size="sm" className="gradient-brand text-white border-0 rounded-lg h-8 text-xs cursor-pointer">
                                <Save className="w-3.5 h-3.5 mr-1" /> Хадгалаад батлах
                              </Button>
                            </div>
                          </div>
                        ) : (
                          // View Mode
                          <div>
                            <div className="flex items-start justify-between gap-4 mb-2">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge className="bg-purple-500/10 text-purple-500 border-none text-[10px] font-bold">
                                    {item.topic}
                                  </Badge>
                                  {item.source_url && (
                                    <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-brand-cyan hover:underline inline-flex items-center gap-0.5 font-bold">
                                      CP Algorithms <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  )}
                                  
                                  {/* Vector DB Index status for Approved items */}
                                  {item.status === "Approved" && (
                                    <Badge className={item.is_vector_indexed ? "bg-emerald-500/10 text-emerald-500 border-none text-[9px] font-bold" : "bg-amber-500/10 text-amber-500 border-none text-[9px] font-bold animate-pulse"}>
                                      {item.is_vector_indexed ? "Indexed (RAG Ready)" : "Indexing in background..."}
                                    </Badge>
                                  )}
                                </div>
                                <h3 className="font-black text-sm text-foreground mt-1.5">{item.title}</h3>
                              </div>

                              <div className="flex items-center gap-1.5">
                                {item.status === "Draft" && (
                                  <>
                                    <Button
                                      onClick={() => startEdit(item)}
                                      variant="ghost"
                                      size="icon"
                                      className="rounded-xl w-8 h-8 text-muted-foreground hover:text-foreground"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      onClick={() => handleApprove(item.id)}
                                      variant="ghost"
                                      size="icon"
                                      className="rounded-xl w-8 h-8 text-emerald-500 hover:bg-emerald-500/10"
                                    >
                                      <CheckCircle className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      onClick={() => handleReject(item.id)}
                                      variant="ghost"
                                      size="icon"
                                      className="rounded-xl w-8 h-8 text-rose-500 hover:bg-rose-500/10"
                                    >
                                      <XCircle className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                                {item.status === "Approved" && (
                                  <Button
                                    onClick={() => handleReject(item.id)}
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-xl w-8 h-8 text-rose-500 hover:bg-rose-500/10"
                                    title="Татгалзах руу шилжүүлэх"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                )}
                                {item.status === "Rejected" && (
                                  <Button
                                    onClick={() => handleApprove(item.id)}
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-xl w-8 h-8 text-emerald-500 hover:bg-emerald-500/10"
                                    title="Батлах төлөвт оруулах"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </Button>
                                )}
                                {currentUser?.role === "admin" && (
                                  <Button
                                    onClick={() => handleDelete(item.id)}
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-xl w-8 h-8 text-rose-600 hover:bg-rose-600/10 hover:text-rose-700"
                                    title="Баазаас бүрэн устгах"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            
                            <div className="text-xs text-muted-foreground mt-3 bg-secondary/20 p-4 rounded-xl whitespace-pre-wrap font-mono border border-border/40">
                              {item.content_mongolian}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </TabsContent>
              )}
            </CardContent>
          </Tabs>
        </div>

      </main>
    </div>
  );
}

const logger = {
  error: (msg: string, err: unknown) => {
    console.error(msg, err);
  }
};
