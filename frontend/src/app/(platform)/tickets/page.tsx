"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, MessageSquare, Plus, Send } from "lucide-react";
import toast from "react-hot-toast";
import { ticketApi } from "@/lib/api/tickets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";

export default function TicketsPage() {
  const client = useQueryClient();
  const { data: tickets = [], isLoading, isError } = useQuery({ queryKey: ["tickets"], queryFn: ticketApi.list });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const activeId = selectedId ?? tickets[0]?.id ?? null;
  const { data: activeTicket } = useQuery({ queryKey: ["ticket", activeId], queryFn: () => ticketApi.get(activeId!), enabled: activeId !== null });
  const [reply, setReply] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [problemCode, setProblemCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const refresh = () => { void client.invalidateQueries({ queryKey: ["tickets"] }); if (activeId) void client.invalidateQueries({ queryKey: ["ticket", activeId] }); };
  const sendReply = useMutation({ mutationFn: () => ticketApi.reply(activeId!, reply), onSuccess: () => { setReply(""); refresh(); }, onError: () => toast.error("Хариу илгээхэд алдаа гарлаа.") });
  const create = useMutation({ mutationFn: () => ticketApi.create({ problem_code: problemCode, title, description }), onSuccess: (ticket) => { setSelectedId(ticket.id); setDialogOpen(false); setProblemCode(""); setTitle(""); setDescription(""); void client.invalidateQueries({ queryKey: ["tickets"] }); void client.setQueryData(["ticket", ticket.id], ticket); toast.success("Тикет нээгдлээ."); }, onError: () => toast.error("Тикет үүсгэхэд алдаа гарлаа.") });
  const resolve = useMutation({ mutationFn: () => ticketApi.resolve(activeId!), onSuccess: () => { refresh(); toast.success("Тикет хаагдлаа."); }, onError: () => toast.error("Тикет хаахад алдаа гарлаа.") });
  const createTicket = () => { if (!problemCode || !title || !description) return toast.error("Мэдээллээ бүрэн бөглөнө үү."); create.mutate(); };

  return <div className="h-screen flex flex-col bg-background text-foreground"><header className="h-16 glass border-b border-border px-4 flex justify-between items-center"><div className="flex gap-3 items-center"><Link href="/dashboard"><Button variant="ghost" size="icon"><ChevronLeft /></Button></Link><div><h1 className="font-bold flex gap-2"><MessageSquare className="w-4 text-brand-cyan" />Тусламжийн Тикет</h1><p className="text-xs text-muted-foreground">Багштай харилцах төв</p></div></div><div className="flex gap-3"><ThemeToggle /><Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogTrigger><Button className="gradient-brand text-white"><Plus />Шинэ тикет</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Шинэ тусламжийн тикет</DialogTitle></DialogHeader><div className="space-y-3"><Input value={problemCode} onChange={(event) => setProblemCode(event.target.value)} placeholder="Бодлогын код" /><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Гарчиг" /><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="w-full min-h-28 rounded-xl border border-input bg-transparent p-3 text-sm" placeholder="Асуудлаа тайлбарлана уу" /><Button onClick={createTicket} disabled={create.isPending} className="w-full gradient-brand text-white">Илгээх</Button></div></DialogContent></Dialog></div></header><div className="flex flex-1 overflow-hidden"><aside className="w-80 border-r border-border overflow-y-auto p-3 space-y-2">{isLoading && <p className="text-sm text-muted-foreground">Ачаалж байна…</p>}{isError && <p className="text-sm text-rose-500">Тикетүүдийг ачаалж чадсангүй.</p>}{tickets.map((ticket) => <button key={ticket.id} onClick={() => setSelectedId(ticket.id)} className={`w-full text-left rounded-xl p-3 border ${ticket.id === activeId ? "border-brand-cyan bg-brand-cyan/5" : "border-transparent hover:bg-secondary"}`}><div className="flex justify-between"><span className="font-mono text-xs text-brand-cyan">#{ticket.problem_code}</span><Badge variant="outline">{ticket.status}</Badge></div><p className="font-bold text-xs mt-2 line-clamp-2">{ticket.title}</p><p className="text-[10px] text-muted-foreground mt-2">{new Date(ticket.created_at).toLocaleString()}</p></button>)}</aside><main className="flex-1 flex flex-col">{activeTicket ? <><div className="p-4 border-b border-border flex justify-between"><div><p className="text-xs text-muted-foreground">#{activeTicket.problem_code} · {activeTicket.problem_title}</p><h2 className="font-black">{activeTicket.title}</h2></div>{activeTicket.status !== "RESOLVED" && <Button variant="outline" onClick={() => resolve.mutate()} disabled={resolve.isPending}>Шийдвэрлэсэн гэж хаах</Button>}</div><div className="flex-1 overflow-y-auto p-6 space-y-5">{activeTicket.messages.map((message) => <div key={message.id} className={`flex flex-col ${message.sender_role === "teacher" || message.sender_role === "admin" ? "items-start" : "items-end"}`}><span className="text-[10px] text-muted-foreground mb-1">{message.sender_name} · {new Date(message.created_at).toLocaleString()}</span><div className="max-w-xl rounded-2xl p-4 text-sm bg-secondary border border-border">{message.content}{message.code_snippet && <pre className="mt-3 overflow-auto text-xs">{message.code_snippet}</pre>}</div></div>)}</div>{activeTicket.status !== "RESOLVED" && <div className="p-4 border-t border-border flex gap-2"><Input value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => event.key === "Enter" && reply.trim() && sendReply.mutate()} placeholder="Хариу бичих…" /><Button onClick={() => reply.trim() && sendReply.mutate()} disabled={sendReply.isPending}><Send /></Button></div>}</> : <div className="m-auto text-sm text-muted-foreground">Тикет сонгоно уу.</div>}</main></div></div>;
}
