"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Trophy, Zap, BookOpen, Users, Star, ChevronRight,
  Code2, Target, TrendingUp, Shield, Brain, Flame
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";

const STATS = [
  { label: "Бодлого", value: "500+", icon: Code2, color: "text-brand-cyan" },
  { label: "Сурагч", value: "1,200+", icon: Users, color: "text-brand-violet" },
  { label: "Submission", value: "50K+", icon: Zap, color: "text-brand-amber" },
  { label: "Accepted", value: "72%", icon: Trophy, color: "text-brand-emerald" },
];

const FEATURES = [
  {
    icon: Target,
    title: "Шаталсан Сургалт",
    desc: "Duolingo маягийн World → Stage → Problem замаар алхам алхмаар дэвших.",
    color: "from-brand-cyan/15 to-brand-cyan/5",
    iconColor: "text-brand-cyan",
    border: "border-brand-cyan/20",
  },
  {
    icon: Zap,
    title: "Шуурхай Judge",
    desc: "Кодоо илгээхэд секундын дотор DMOJ sandbox-д шалгагдаж, дүн ирнэ.",
    color: "from-brand-violet/15 to-brand-violet/5",
    iconColor: "text-brand-violet",
    border: "border-brand-violet/20",
  },
  {
    icon: TrendingUp,
    title: "XP & Level Систем",
    desc: "Бодлого бодох тусам XP цуглуулж, Bronze-оос Grandmaster хүртэл дэвш.",
    color: "from-brand-amber/15 to-brand-amber/5",
    iconColor: "text-brand-amber",
    border: "border-brand-amber/20",
  },
  {
    icon: Brain,
    title: "Topic Mastery",
    desc: "Алгоритмын сэдэв бүр дэх эзэмшилтийн хувийг радар диаграмаар харна.",
    color: "from-brand-emerald/15 to-brand-emerald/5",
    iconColor: "text-brand-emerald",
    border: "border-brand-emerald/20",
  },
  {
    icon: Users,
    title: "Ангийн Удирдлага",
    desc: "Багш анги үүсгэж, сурагчдыг бүлэглэж, хугацаатай даалгавар оноох.",
    color: "from-brand-rose/15 to-brand-rose/5",
    iconColor: "text-brand-rose",
    border: "border-brand-rose/20",
  },
  {
    icon: Shield,
    title: "Дэмжлэгийн Систем",
    desc: "Гацсан үедээ ticket нээж, багшаас шууд зөвлөгөө аваарай.",
    color: "from-brand-cyan/15 to-brand-violet/5",
    iconColor: "text-brand-cyan",
    border: "border-brand-cyan/20",
  },
];

const LEVELS = [
  { name: "Bronze", color: "#cd7f32", xp: "0 XP" },
  { name: "Silver", color: "#94a3b8", xp: "500 XP" },
  { name: "Gold", color: "#d97706", xp: "1500 XP" },
  { name: "Platinum", color: "#0284c7", xp: "3500 XP" },
  { name: "Diamond", color: "#7c3aed", xp: "7000 XP" },
  { name: "Master", color: "#db2777", xp: "15K XP" },
  { name: "Grandmaster", color: "#dc2626", xp: "30K XP" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5 },
  }),
};

export default function LandingPage() {
  return (
    <div className="min-h-screen gradient-hero overflow-x-hidden text-foreground">

      {/* ── Hero Section ── */}
      <section className="relative pt-32 pb-24 px-4">
        <div className="relative max-w-5xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <Badge className="mb-6 bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/30 px-4 py-1.5 text-xs font-semibold">
              <Flame className="w-3.5 h-3.5 mr-1.5" />
              Phase 1 — Core Platform
            </Badge>
          </motion.div>

          <motion.h1
            className="text-5xl sm:text-6xl md:text-7xl font-black leading-tight mb-6 tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Алгоритмын
            <br />
            <span className="gradient-text-brand">Тэмцэгч</span> бол
          </motion.h1>

          <motion.p
            className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed font-medium"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Мэдээлэлзүйн олимпиадын бэлтгэлд зориулсан орчин үеийн платформ.
            Шаталсан сургалт, шуурхай judge, XP систем — бүгд нэг дор.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Link href="/auth/register">
              <Button size="lg" className="gradient-brand text-white border-0 hover:opacity-90 h-12 px-8 text-base font-bold shadow-lg shadow-brand-cyan/25">
                Эхлэх <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
            <Link href="/problems">
              <Button size="lg" variant="outline" className="h-12 px-8 text-base glass border-border hover:bg-secondary font-semibold">
                <BookOpen className="w-4 h-4 mr-2 text-brand-cyan" />
                Бодлогууд харах
              </Button>
            </Link>
          </motion.div>
        </div>

        {/* ── Stats ── */}
        <motion.div
          className="max-w-3xl mx-auto mt-20 grid grid-cols-2 md:grid-cols-4 gap-4"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
        >
          {STATS.map((stat) => (
            <div key={stat.label} className="glass rounded-2xl p-5 text-center group hover:border-brand-cyan/40 transition-colors shadow-xs">
              <stat.icon className={`w-5 h-5 ${stat.color} mx-auto mb-2`} />
              <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
              <div className="text-xs font-semibold text-muted-foreground mt-0.5">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── Features Grid ── */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <motion.h2
              className="text-3xl sm:text-4xl font-black mb-4"
              initial="hidden" whileInView="visible" viewport={{ once: true }}
              variants={fadeUp} custom={0}
            >
              Бүх зүйл нэг <span className="gradient-text-cyan">дор</span>
            </motion.h2>
            <motion.p
              className="text-muted-foreground max-w-xl mx-auto font-medium text-sm"
              initial="hidden" whileInView="visible" viewport={{ once: true }}
              variants={fadeUp} custom={1}
            >
              Сурагчаас эхлээд багш, admin хүртэл бүгдэд зориулсан цогц систем.
            </motion.p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                className={`relative rounded-3xl p-6 bg-gradient-to-br ${f.color} border ${f.border} group hover:scale-[1.02] transition-all duration-300 shadow-xs`}
                initial="hidden" whileInView="visible" viewport={{ once: true }}
                variants={fadeUp} custom={i}
              >
                <div className={`w-10 h-10 rounded-xl bg-card flex items-center justify-center mb-4 ${f.iconColor} shadow-sm`}>
                  <f.icon className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed font-medium">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Level Progression ── */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <motion.h2
              className="text-3xl font-black mb-3"
              initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}
            >
              7 Түвшний <span className="gradient-text-violet">Замнал</span>
            </motion.h2>
            <motion.p
              className="text-muted-foreground font-medium text-sm"
              initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={1}
            >
              XP цуглуулж, дараагийн түвшинд дэвш.
            </motion.p>
          </div>
          <motion.div
            className="relative"
            initial="hidden" whileInView="visible" viewport={{ once: true }}
          >
            <div className="grid grid-cols-7 gap-2">
              {LEVELS.map((lvl, i) => (
                <motion.div
                  key={lvl.name}
                  className="flex flex-col items-center gap-2 relative"
                  variants={fadeUp} custom={i * 0.5}
                >
                  <div
                    className="w-12 h-12 rounded-2xl border-2 bg-card flex items-center justify-center text-lg relative z-10 shadow-sm"
                    style={{ borderColor: lvl.color }}
                  >
                    <Star className="w-5 h-5" style={{ color: lvl.color }} />
                  </div>
                  <span className="text-[10px] font-bold" style={{ color: lvl.color }}>{lvl.name}</span>
                  <span className="text-[9px] text-muted-foreground font-semibold">{lvl.xp}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>


    </div>
  );
}
