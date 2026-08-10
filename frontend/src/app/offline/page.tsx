"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { WifiOff, RefreshCw, Server, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import toast from "react-hot-toast";

export default function OfflinePage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Check browser online status
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  const handleRetry = async () => {
    setIsChecking(true);
    const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/$/, "") ?? "";
    const healthUrl = `${apiOrigin}/api/health`;
    
    try {
      const res = await fetch(healthUrl, { cache: "no-store", mode: "cors" });
      if (res.ok) {
        toast.success("Холболт амжилттай сэргэлээ! Чиглүүлж байна...");
        setTimeout(() => {
          router.push("/dashboard");
        }, 1500);
      } else {
        throw new Error("Server health check failed");
      }
    } catch (err) {
      toast.error("Сэрвэртэй холбогдож чадсангүй. Түр хүлээгээд дахин оролдоно уу.");
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-radial from-slate-900 via-zinc-950 to-black text-foreground px-4">
      {/* Background ambient lights */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-cyan/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-violet/10 rounded-full blur-3xl" />

      <Card className="max-w-md w-full relative z-10 border-white/10 bg-white/5 backdrop-blur-xl rounded-3xl shadow-2xl p-8 space-y-6">
        <CardHeader className="text-center p-0">
          <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-rose-500 mx-auto flex items-center justify-center mb-6 shadow-lg shadow-rose-500/5 animate-pulse">
            <WifiOff className="w-10 h-10" />
          </div>
          <CardTitle className="text-2xl font-black tracking-tight">Сүлжээ Тасарлаа</CardTitle>
          <CardDescription className="text-xs text-muted-foreground mt-2 leading-relaxed">
            {!isOnline 
              ? "Таны интернэт холболт тасарсан байна. Сүлжээгээ шалгана уу." 
              : "Платформын сэрвэр түр зогссон эсвэл шинэчлэлт хийгдэж байна. Бид удахгүй эргэн ирэх болно."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 p-0">
          <div className="glass rounded-2xl p-4 border border-white/5 flex flex-col gap-2.5 text-xs text-muted-foreground">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><WifiOff className="w-3.5 h-3.5 text-slate-400" /> Таны төлөв:</span>
              <span className={isOnline ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}>
                {isOnline ? "Онлайн (Интернэттэй)" : "Офлайн (Интернэтгүй)"}
              </span>
            </div>
            <div className="h-px bg-white/5" />
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Server className="w-3.5 h-3.5 text-slate-400" /> Сэрвэрийн төлөв:</span>
              <span className="text-rose-500 font-bold">Холбогдоогүй</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <Button
              onClick={handleRetry}
              disabled={isChecking}
              className="w-full text-xs font-bold rounded-xl gradient-brand text-white border-0 cursor-pointer h-11 flex items-center justify-center gap-2 shadow-lg shadow-brand-cyan/20"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? "animate-spin" : ""}`} />
              {isChecking ? "Шалгаж байна..." : "Дахин холбогдохыг оролдох"}
            </Button>
            
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="w-full text-xs font-semibold rounded-xl border border-white/10 hover:bg-white/5 text-muted-foreground hover:text-foreground h-11 flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Өмнөх хуудас руу буцах
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
