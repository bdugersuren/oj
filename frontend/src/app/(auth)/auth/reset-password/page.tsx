"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff, Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import toast from "react-hot-toast";
import { authApi } from "@/lib/api/auth";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({ password: "", confirm: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast.error("Нууц үг сэргээх токен олдсонгүй.");
      return;
    }

    if (form.password !== form.confirm) {
      toast.error("Нууц үг таарахгүй байна.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await authApi.resetPassword(token, form.password);
      toast.success(res.message || "Нууц үг амжилттай шинэчлэгдлээ. Шинэ нууц үгээрээ нэвтэрнэ үү.");
      router.push("/auth/login");
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error.message || "Нууц үг шинэчлэхэд алдаа гарлаа.";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center px-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-brand-cyan/6 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-brand-violet/6 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        <motion.div
          className="glass-strong rounded-3xl p-8 border-gradient"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl gradient-brand flex items-center justify-center mx-auto mb-4">
              <KeyRound className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-black">Шинэ нууц үг</h1>
            <p className="text-sm text-muted-foreground mt-1.5">Шинэ нууц үгээ оруулан сэргээнэ үү</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium">Шинэ нууц үг</Label>
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
                <button
                  type="button"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm" className="text-sm font-medium">Шинэ нууц үг давтах</Label>
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
              className="w-full h-11 gradient-brand text-white border-0 hover:opacity-90 rounded-xl font-semibold text-sm mt-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Шинэчилж байна...</>
              ) : (
                "Нууц үг хадгалах"
              )}
            </Button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-cyan animate-spin" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
