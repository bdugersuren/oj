"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Mail, ArrowLeft, Loader2, Trophy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import toast from "react-hot-toast";
import { authApi } from "@/lib/api/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await authApi.forgotPassword(email);
      toast.success(res.message || "Нууц үг сэргээх холбоосыг и-мэйл рүү илгээв.");
      setIsSent(true);
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error.message || "Хүсэлт илгээхэд алдаа гарлаа.";
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
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
          <Link href="/auth/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" /> Нэвтрэх хуудас руу буцах
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
              <KeyRound className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-black">Нууц үг сэргээх</h1>
            <p className="text-sm text-muted-foreground mt-1.5">Бүртгэлтэй и-мэйл хаягаа оруулна уу</p>
          </div>

          {!isSent ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">И-мэйл</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="example@oj.know.mn"
                    className="pl-10 h-11 bg-surface-1 border-white/10 focus:border-brand-cyan/50 rounded-xl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Илгээж байна...</>
                ) : (
                  "Сэргээх холбоос илгээх"
                )}
              </Button>
            </form>
          ) : (
            <div className="text-center py-4 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Хэрэв таны оруулсан и-мэйл хаяг системд бүртгэлтэй бол нууц үг сэргээх заавар бүхий и-мэйлийг илгээсэн. Та и-мэйл хаягаа шалгана уу.
              </p>
              <Link href="/auth/login">
                <Button className="w-full h-11 gradient-brand text-white border-0 hover:opacity-90 rounded-xl font-semibold text-sm">
                  Нэвтрэх рүү буцах
                </Button>
              </Link>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
