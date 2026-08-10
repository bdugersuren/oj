"use client";

import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/lib/api/auth";
import { useAuthStore } from "@/store/auth";
import { User, Key, Save, RefreshCw, Sparkles, Building, Mail, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import toast from "react-hot-toast";
import { RoleGate } from "@/components/role-gate";

export default function TeacherProfilePage() {
  const queryClient = useQueryClient();
  const { user, setUser } = useAuthStore();

  const [profileData, setProfileData] = useState({
    full_name: "",
    school: "",
  });

  const [passwordData, setPasswordData] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  useEffect(() => {
    if (user) {
      setProfileData({
        full_name: user.full_name || "",
        school: user.school || "",
      });
    }
  }, [user]);

  const updateProfileMutation = useMutation({
    mutationFn: (data: any) => authApi.updateProfile(data),
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      toast.success("Профайл амжилттай шинэчлэгдлээ.");
    },
    onError: () => toast.error("Мэдээллийг шинэчлэхэд алдаа гарлаа.")
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data: any) => authApi.changePassword(data),
    onSuccess: () => {
      toast.success("Нууц үг амжилттай солигдлоо.");
      setPasswordData({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || "Нууц үг солиход алдаа гарлаа.";
      toast.error(msg);
    }
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(profileData);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordData.current_password) return toast.error("Одоогийн нууц үгийг оруулна уу.");
    if (passwordData.new_password.length < 8) return toast.error("Шинэ нууц үг наад зах нь 8 тэмдэгт байх ёстой.");
    if (passwordData.new_password !== passwordData.confirm_password) {
      return toast.error("Шинэ нууц үгнүүд хоорондоо таарахгүй байна.");
    }

    changePasswordMutation.mutate({
      current_password: passwordData.current_password,
      new_password: passwordData.new_password,
    });
  };

  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

  return (
    <RoleGate roles={["teacher", "admin"]}>
      <div className="p-6 md:p-8 space-y-8 max-w-4xl mx-auto bg-background/50 min-h-screen">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-brand-cyan" />
              Профайл тохиргоо
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Багшийн хувийн мэдээлэл болон нууц үг солих хамгаалалтын хэсэг
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Avatar and Basic info */}
          <div className="md:col-span-1 space-y-6">
            <Card className="glass-strong border-white/5 rounded-3xl p-6 text-center flex flex-col items-center">
              <Avatar className="h-24 w-24 border-2 border-brand-cyan shadow-lg mb-4">
                <AvatarImage src={user?.avatar_url || undefined} />
                <AvatarFallback className="bg-brand-cyan/20 text-brand-cyan text-xl font-bold">
                  {user ? getInitials(user.full_name || user.username) : "T"}
                </AvatarFallback>
              </Avatar>
              <h3 className="text-lg font-black text-foreground">{user?.full_name || user?.username}</h3>
              <p className="text-xs text-brand-cyan mt-1 capitalize font-bold">{user?.role} эрхтэй</p>

              <div className="w-full space-y-3 mt-6 pt-6 border-t border-white/5 text-left text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                  <span className="truncate">{user?.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                  <span>{user?.school || "Сургууль тохируулаагүй"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                  <span>Акаунт: <b className="text-brand-emerald">Идэвхтэй</b></span>
                </div>
              </div>
            </Card>
          </div>

          {/* Edit Forms */}
          <div className="md:col-span-2 space-y-6">
            {/* General Profile Update */}
            <Card className="glass-strong border-white/5 rounded-3xl p-6">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <User className="w-4 h-4 text-brand-cyan" />
                  Хувийн мэдээлэл шинэчлэх
                </CardTitle>
                <CardDescription>Сургуулийн систем болон тайланд харагдах багшийн нэр, мэдээлэл.</CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="full_name" className="text-xs font-bold">Овог Нэр</Label>
                    <Input
                      id="full_name"
                      value={profileData.full_name}
                      onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                      placeholder="Жишээ: Багш Бат"
                      className="h-10 rounded-xl bg-card border-border/60"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="school" className="text-xs font-bold">Сургуулийн нэр</Label>
                    <Input
                      id="school"
                      value={profileData.school}
                      onChange={(e) => setProfileData({ ...profileData, school: e.target.value })}
                      placeholder="Жишээ: 1-р сургууль"
                      className="h-10 rounded-xl bg-card border-border/60"
                    />
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={updateProfileMutation.isPending} className="rounded-xl bg-brand-cyan text-black font-bold">
                      <Save className="w-4 h-4 mr-2" /> Мэдээлэл хадгалах
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Change Password */}
            <Card className="glass-strong border-white/5 rounded-3xl p-6">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Key className="w-4 h-4 text-brand-violet" />
                  Нууц үг солих
                </CardTitle>
                <CardDescription>Аюулгүй байдлын үүднээс нууц үгээ үе үе сольж байхыг зөвлөж байна.</CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="current_password" className="text-xs font-bold">Одоогийн нууц үг</Label>
                    <Input
                      id="current_password"
                      type="password"
                      value={passwordData.current_password}
                      onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
                      placeholder="••••••••"
                      className="h-10 rounded-xl bg-card border-border/60"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="new_password" className="text-xs font-bold">Шинэ нууц үг</Label>
                      <Input
                        id="new_password"
                        type="password"
                        value={passwordData.new_password}
                        onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                        placeholder="Наад зах нь 8 тэмдэгт"
                        className="h-10 rounded-xl bg-card border-border/60"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirm_password" className="text-xs font-bold">Шинэ нууц үг давтах</Label>
                      <Input
                        id="confirm_password"
                        type="password"
                        value={passwordData.confirm_password}
                        onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                        placeholder="••••••••"
                        className="h-10 rounded-xl bg-card border-border/60"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={changePasswordMutation.isPending} className="rounded-xl bg-brand-violet text-white font-bold">
                      <Key className="w-4 h-4 mr-2" /> Нууц үг өөрчлөх
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </RoleGate>
  );
}
