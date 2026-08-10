"use client";

import { motion } from "framer-motion";
import { Users, Code, Award, Key, Mail, CheckCircle, HelpCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/lib/api/auth";

export default function AdminDashboardPage() {
  const { data: smtpSettings } = useQuery({
    queryKey: ["admin-smtp-status"],
    queryFn: authApi.getSmtpSettings,
    retry: false,
  });

  const cards = [
    { label: "Нийт сурагчид", value: "324", change: "+12 энэ долоо хоногт", icon: Users, color: "text-brand-cyan", bg: "bg-brand-cyan/10" },
    { label: "Нийт илгээлт", value: "12,450", change: "+240 өнөөдөр", icon: Code, color: "text-brand-violet", bg: "bg-brand-violet/10" },
    { label: "Идэвхтэй тэмцээн", value: "2", change: "1 дууссан", icon: Award, color: "text-brand-amber", bg: "bg-brand-amber/10" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Админ Удирдах Самбар</h1>
        <p className="text-xs text-muted-foreground mt-1">Системийн ерөнхий үзүүлэлт болон тохиргоонуудыг удирдах</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {cards.map((c, i) => (
          <motion.div
            key={c.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass rounded-2xl p-5 border border-border/40"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-muted-foreground font-semibold">{c.label}</span>
              <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center`}>
                <c.icon className={`w-4.5 h-4.5 ${c.color}`} />
              </div>
            </div>
            <div className="text-2xl font-black">{c.value}</div>
            <div className="text-[10px] text-muted-foreground mt-1">{c.change}</div>
          </motion.div>
        ))}
      </div>

      {/* SMTP Status Overview */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="glass rounded-3xl p-6 border border-border/40 relative overflow-hidden"
      >
        <h2 className="text-sm font-black mb-3">И-мэйл (SMTP) Серверийн төлөв</h2>
        
        {smtpSettings?.smtp_enabled ? (
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-emerald-400">Идэвхтэй тохируулагдсан</div>
              <p className="text-xs text-muted-foreground mt-1 max-w-lg">
                Системийн и-мэйл баталгаажуулалт болон нууц үг сэргээх үйлдэл хэвийн ажиллаж байна.
                SMTP Хост: <code className="bg-secondary px-1.5 py-0.5 rounded text-[11px]">{smtpSettings.smtp_host}</code>
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <HelpCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-amber-400">SMTP Сервер тохируулагдаагүй байна</div>
              <p className="text-xs text-muted-foreground mt-1 max-w-lg">
                И-мэйл сервер тохируулагдаагүй эсвэл идэвхгүй байна. 
                И-мэйл баталгаажуулалт ажиллахгүй бөгөөд сурагчид бүртгүүлээд шууд нэвтрэх боломжтой байна.
              </p>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
