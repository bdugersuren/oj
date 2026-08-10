"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2, Trophy, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api/auth";

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("И-мэйл хаягийг баталгаажуулж байна...");
  const hasCalled = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Баталгаажуулах токен олдсонгүй.");
      return;
    }

    if (hasCalled.current) return;
    hasCalled.current = true;

    const verify = async () => {
      try {
        const res = await authApi.verifyEmail(token);
        setStatus("success");
        setMessage(res.message || "И-мэйл хаяг амжилттай баталгаажлаа!");
      } catch (error: any) {
        setStatus("error");
        setMessage(error?.response?.data?.detail || error.message || "Баталгаажуулах токен хүчингүй эсвэл хугацаа нь дууссан байна.");
      }
    };

    verify();
  }, [token]);

  return (
    <div className="min-h-screen gradient-hero flex items-center justify-center px-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-brand-cyan/6 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-brand-violet/6 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        <motion.div
          className="glass-strong rounded-3xl p-8 border-gradient text-center"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="w-14 h-14 rounded-2xl gradient-brand flex items-center justify-center mx-auto mb-6">
            <Trophy className="w-7 h-7 text-white" />
          </div>

          <h1 className="text-2xl font-black mb-4">Бүртгэл идэвхжүүлэх</h1>

          <div className="my-8 flex flex-col items-center justify-center min-h-[120px]">
            {status === "loading" && (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-brand-cyan animate-spin" />
                <p className="text-sm text-muted-foreground mt-2">{message}</p>
              </div>
            )}

            {status === "success" && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-3"
              >
                <CheckCircle2 className="w-16 h-16 text-emerald-500" />
                <p className="text-sm text-emerald-400 font-semibold mt-2">{message}</p>
              </motion.div>
            )}

            {status === "error" && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-3"
              >
                <XCircle className="w-16 h-16 text-rose-500" />
                <p className="text-sm text-rose-400 font-semibold mt-2">{message}</p>
              </motion.div>
            )}
          </div>

          {status === "success" && (
            <Button
              className="w-full h-11 gradient-brand text-white border-0 hover:opacity-90 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
              onClick={() => router.push("/auth/login")}
            >
              Нэвтрэх хуудас руу шилжих <ArrowRight className="w-4 h-4" />
            </Button>
          )}

          {status === "error" && (
            <Button
              variant="outline"
              className="w-full h-11 glass border-white/10 hover:border-white/20 rounded-xl text-sm"
              onClick={() => router.push("/auth/register")}
            >
              Дахин бүртгүүлэх
            </Button>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-cyan animate-spin" />
      </div>
    }>
      <VerifyContent />
    </Suspense>
  );
}
