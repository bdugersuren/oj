"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Mail, Server, Eye, EyeOff, Loader2, Save, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import toast from "react-hot-toast";
import { authApi, SmtpSettings } from "@/lib/api/auth";

export default function AdminEmailSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [form, setForm] = useState<SmtpSettings>({
    smtp_host: "",
    smtp_port: 587,
    smtp_user: "",
    smtp_password: "",
    smtp_use_tls: true,
    smtp_from_email: "",
    smtp_from_name: "OJ Platform",
    smtp_enabled: false,
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await authApi.getSmtpSettings();
        setForm({
          ...settings,
          smtp_password: "", // Аюулгүй байдлын үүднээс нууц үгийг хоосон ачаална
        });
      } catch (error: any) {
        toast.error("SMTP тохиргоог татахад алдаа гарлаа.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await authApi.updateSmtpSettings(form);
      toast.success("И-мэйл тохиргоо амжилттай хадгалагдлаа!");
      setForm((prev) => ({ ...prev, smtp_password: "" })); // Шинэчлэгдсэний дараа нууц үгийг арилгах
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || error.message || "Тохиргоог хадгалахад алдаа гарлаа.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 text-brand-cyan animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black">И-мэйл (SMTP) Тохиргоо</h1>
        <p className="text-xs text-muted-foreground mt-1">Системийн и-мэйл илгээх холболтын SMTP мэдээллүүд</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-3xl p-6 border border-border/40"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Enabled switch */}
          <div className="flex items-center justify-between bg-secondary/20 p-4 rounded-2xl border border-border/30">
            <div>
              <div className="text-sm font-bold">И-мэйл үйлчилгээг идэвхжүүлэх</div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Бүртгэл баталгаажуулалт болон нууц үг сэргээхийг идэвхжүүлэх</p>
            </div>
            <Switch
              checked={form.smtp_enabled}
              onCheckedChange={(checked) => setForm({ ...form, smtp_enabled: checked })}
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="smtp_host" className="text-xs font-semibold">SMTP Хост</Label>
              <div className="relative">
                <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="smtp_host"
                  placeholder="smtp.gmail.com"
                  className="pl-9 h-10 bg-surface-1 border-white/10 rounded-xl"
                  value={form.smtp_host}
                  onChange={(e) => setForm({ ...form, smtp_host: e.target.value })}
                  required={form.smtp_enabled}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp_port" className="text-xs font-semibold">Порт</Label>
              <Input
                id="smtp_port"
                type="number"
                placeholder="587"
                className="h-10 bg-surface-1 border-white/10 rounded-xl"
                value={form.smtp_port}
                onChange={(e) => setForm({ ...form, smtp_port: parseInt(e.target.value) || 587 })}
                required={form.smtp_enabled}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="smtp_user" className="text-xs font-semibold">SMTP Хэрэглэгч (User)</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="smtp_user"
                  type="email"
                  placeholder="smtp@know.mn"
                  className="pl-9 h-10 bg-surface-1 border-white/10 rounded-xl"
                  value={form.smtp_user}
                  onChange={(e) => setForm({ ...form, smtp_user: e.target.value })}
                  required={form.smtp_enabled}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp_password" className="text-xs font-semibold">SMTP Нууц үг (Password)</Label>
              <div className="relative">
                <Input
                  id="smtp_password"
                  type={showPassword ? "text" : "password"}
                  placeholder={form.smtp_enabled ? "••••••••" : "Нууц үг шаардлагагүй"}
                  className="pr-10 h-10 bg-surface-1 border-white/10 rounded-xl"
                  value={form.smtp_password}
                  onChange={(e) => setForm({ ...form, smtp_password: e.target.value })}
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
          </div>

          <div className="flex items-center justify-between bg-secondary/10 p-3.5 rounded-2xl">
            <div>
              <div className="text-xs font-bold">TLS/SSL Холболт ашиглах</div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Secure connection ашиглан и-мэйл илгээнэ</p>
            </div>
            <Switch
              checked={form.smtp_use_tls}
              onCheckedChange={(checked) => setForm({ ...form, smtp_use_tls: checked })}
            />
          </div>

          <Separator className="bg-border/30" />

          {/* Sender configurations */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="smtp_from_email" className="text-xs font-semibold">Илгээгч И-мэйл хаяг</Label>
              <Input
                id="smtp_from_email"
                type="email"
                placeholder="noreply@know.mn"
                className="h-10 bg-surface-1 border-white/10 rounded-xl"
                value={form.smtp_from_email}
                onChange={(e) => setForm({ ...form, smtp_from_email: e.target.value })}
                required={form.smtp_enabled}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp_from_name" className="text-xs font-semibold">Илгээгчийн нэр</Label>
              <Input
                id="smtp_from_name"
                placeholder="OJ Platform"
                className="h-10 bg-surface-1 border-white/10 rounded-xl"
                value={form.smtp_from_name}
                onChange={(e) => setForm({ ...form, smtp_from_name: e.target.value })}
                required={form.smtp_enabled}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-10 gradient-brand text-white border-0 hover:opacity-90 rounded-xl font-semibold text-xs flex items-center justify-center gap-2"
            disabled={isSaving}
          >
            {isSaving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Хадгалж байна...</>
            ) : (
              <><Save className="w-4 h-4" /> Тохиргоог хадгалах</>
            )}
          </Button>

        </form>
      </motion.div>
    </div>
  );
}
