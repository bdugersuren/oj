"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Users, Plus, Lock, CheckCircle2, AlertCircle, HelpCircle, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";
import { classroomApi } from "@/lib/api/classrooms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";

export default function StudentClassroomsPage() {
  const client = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");

  const { data: classrooms = [], isLoading, isError } = useQuery({
    queryKey: ["student-classrooms"],
    queryFn: classroomApi.list,
  });

  const joinMutation = useMutation({
    mutationFn: (code: string) => classroomApi.join(code),
    onSuccess: (res) => {
      setDialogOpen(false);
      setInviteCode("");
      void client.invalidateQueries({ queryKey: ["student-classrooms"] });
      toast.success(res.message || "Ангид элсэх хүсэлт илгээлээ.");
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Хүсэлт илгээхэд алдаа гарлаа.";
      toast.error(msg);
    }
  });

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return toast.error("Урилгын кодыг оруулна уу.");
    joinMutation.mutate(inviteCode.trim());
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <header className="h-16 glass border-b border-border px-4 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto h-full flex justify-between items-center">
          <div className="flex gap-3 items-center">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" className="rounded-xl">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="font-black text-sm flex gap-2 items-center">
                <Users className="w-4 h-4 text-brand-cyan" />
                Миний ангиуд
              </h1>
              <p className="text-[10px] text-muted-foreground">Суралцаж буй анги танхим, сургалтын курсууд</p>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <ThemeToggle />
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger>
                <Button className="gradient-brand text-white text-xs font-bold rounded-xl h-9">
                  <Plus className="w-4 h-4 mr-1.5" /> Ангид элсэх
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-3xl border-white/5 bg-card/95 max-w-sm">
                <DialogHeader>
                  <DialogTitle className="text-base font-black">Ангид элсэх хүсэлт өгөх</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleJoinSubmit} className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Урилгын код (Invite Code)</label>
                    <Input
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      placeholder="Жишээ: B4A9F2E7"
                      className="h-10 rounded-xl bg-card border-border text-center font-mono font-bold tracking-widest text-sm focus:ring-1"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={joinMutation.isPending}
                    className="w-full gradient-brand text-white font-bold h-10 rounded-xl"
                  >
                    {joinMutation.isPending ? "Илгээж байна..." : "Хүсэлт илгээх"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-8">
        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            <div className="h-40 bg-secondary/50 rounded-3xl" />
            <div className="h-40 bg-secondary/50 rounded-3xl" />
            <div className="h-40 bg-secondary/50 rounded-3xl" />
          </div>
        ) : isError ? (
          <div className="text-center py-12 text-sm text-rose-500 font-bold">
            Ангиудыг ачаалж чадсангүй. Дахин оролдоно уу.
          </div>
        ) : classrooms.length === 0 ? (
          <div className="text-center py-16 max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 rounded-full bg-secondary/60 flex items-center justify-center mx-auto text-muted-foreground">
              <HelpCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-bold">Одоогоор анги байхгүй</h2>
              <p className="text-xs text-muted-foreground">Багшийн санал болгосон урилгын кодыг ашиглан ангид элсэж орно уу.</p>
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {classrooms.map((item: any) => {
              // Wait, item is ClassroomListItem. But let's check classroomStudent list or just status.
              // Since student list returns status dynamically in API list endpoint, let's see how status is returned.
              // Oh! In `list_classrooms` endpoint, it queries:
              // select(Classroom).join(ClassroomStudent, ...).where(ClassroomStudent.student_id == current_user.id)
              // Wait, we need the status! Currently, `list_classrooms` does not return `status` of the ClassroomStudent record.
              // Let's check: can we return `status` inside `ClassroomListItem`?
              // Yes! Let's modify the classroom list endpoint to also return the student's status: `"approved"` or `"pending"` or `"rejected"`.
              // We'll update the backend `ClassroomListItem` schema to include: `membership_status: str`.
              // That is very simple and we will make sure we do it!
              
              const isApproved = item.membership_status === "approved";
              const isPending = item.membership_status === "pending";
              const isRejected = item.membership_status === "rejected";

              return (
                <div
                  key={item.id}
                  className={`glass-strong rounded-3xl border p-6 flex flex-col justify-between min-h-[180px] transition-all relative overflow-hidden ${
                    isApproved ? "border-white/5 hover:border-brand-cyan/20" : "border-white/5 bg-secondary/5"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <b className="text-sm font-black text-foreground block tracking-tight line-clamp-1">{item.name}</b>
                      {isApproved && (
                        <Badge className="bg-emerald-500/15 text-emerald-500 border-none font-bold text-[9px] uppercase">Элссэн</Badge>
                      )}
                      {isPending && (
                        <Badge className="bg-amber-500/15 text-amber-500 border-none font-bold text-[9px] uppercase">Хүлээгдэж буй</Badge>
                      )}
                      {isRejected && (
                        <Badge className="bg-rose-500/15 text-rose-500 border-none font-bold text-[9px] uppercase">Татгалзсан</Badge>
                      )}
                    </div>
                    
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {item.description || "Тайлбар оруулаагүй байна."}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                    <div className="text-[10px] text-muted-foreground">
                      <span>Багш: <b>{item.teacher_name}</b></span>
                      <span className="block mt-0.5">{item.students_count} сурагч элссэн</span>
                    </div>

                    {isApproved ? (
                      <Link href={`/classrooms/${item.id}`}>
                        <Button size="sm" className="h-8 rounded-lg gradient-brand text-white text-[10px] font-bold">
                          Анги руу орох <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                    ) : isPending ? (
                      <span className="text-[10px] text-amber-500 font-bold flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Зөвшөөрөл хүлээж буй
                      </span>
                    ) : (
                      <span className="text-[10px] text-rose-500 font-bold flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Татгалзсан төлөв
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
