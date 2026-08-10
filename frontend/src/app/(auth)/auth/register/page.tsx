"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, Trophy, ArrowLeft, Loader2, Lock, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import toast from "react-hot-toast";
import { authApi } from "@/lib/api/auth";
import { useAuthStore } from "@/store/auth";

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", password: "", confirm: "" });
  const setUser = useAuthStore((state) => state.setUser);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast.error("Нууц үг таарахгүй байна.");
      return;
    }
    setIsLoading(true);
    try {
      const res = await authApi.register({ username: form.username, email: form.email, password: form.password });
      toast.success(res.message || "Бүртгэл амжилттай үүслээ! И-мэйл хаягаа шалгаж баталгаажуулна уу.");
      router.push("/auth/login");
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error.message || "Бүртгэл үүсгэхэд алдаа гарлаа.";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const strength = form.password.length >= 8 ? (
    /[A-Z]/.test(form.password) && /[0-9]/.test(form.password) ? "strong" : "medium"
  ) : form.password.length > 0 ? "weak" : null;

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center px-4 py-16">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 right-1/4 w-96 h-96 rounded-full bg-brand-violet/6 blur-[120px]" />
        <div className="absolute bottom-1/3 left-1/4 w-80 h-80 rounded-full bg-brand-cyan/6 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" /> Буцах
          </Link>
        </motion.div>

        <motion.div
          className="glass-strong rounded-3xl p-8 border-gradient"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl gradient-brand flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-black">Бүртгүүлэх</h1>
            <p className="text-sm text-muted-foreground mt-1.5">Шинэ аяллаа эхэл</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-sm font-medium">Хэрэглэгчийн нэр</Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="username"
                  placeholder="myusername"
                  className="pl-10 h-11 bg-surface-1 border-white/10 focus:border-brand-cyan/50 rounded-xl"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium">И-мэйл</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="example@oj.know.mn"
                  className="pl-10 h-11 bg-surface-1 border-white/10 focus:border-brand-cyan/50 rounded-xl"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium">Нууц үг</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-10 pr-10 h-11 bg-surface-1 border-white/10 focus:border-brand-cyan/50 rounded-xl"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
                <button type="button" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Strength indicator */}
              {strength && (
                <div className="flex gap-1 mt-1.5">
                  {["weak", "medium", "strong"].map((s) => (
                    <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${
                      strength === "weak" && s === "weak" ? "bg-brand-rose" :
                      strength === "medium" && ["weak", "medium"].includes(s) ? "bg-brand-amber" :
                      strength === "strong" ? "bg-brand-emerald" : "bg-white/10"
                    }`} />
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm" className="text-sm font-medium">Нууц үг давтах</Label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="confirm"
                  type="password"
                  placeholder="••••••••"
                  className={`pl-10 h-11 bg-surface-1 rounded-xl border-white/10 focus:border-brand-cyan/50 ${
                    form.confirm && form.confirm !== form.password ? "border-brand-rose/50" : ""
                  }`}
                  value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 gradient-brand text-white border-0 hover:opacity-90 rounded-xl font-semibold text-sm mt-1"
              disabled={isLoading}
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Бүртгэж байна...</>
              ) : "Бүртгүүлэх"}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/8" />
            </div>
            <div className="relative flex justify-center text-xs text-muted-foreground bg-background px-3 mx-auto w-fit">
              Бүртгэл байна уу?
            </div>
          </div>
          <Link href="/auth/login">
            <Button variant="outline" className="w-full h-11 glass border-white/10 hover:border-white/20 rounded-xl text-sm">
              Нэвтрэх
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
