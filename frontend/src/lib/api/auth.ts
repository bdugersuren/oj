import { api } from "./client";

export type UserRole = "admin" | "teacher" | "student";

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  school: string | null;
  grade: string | null;
}

export interface Session {
  user: SessionUser;
  expires_in: number;
}

export interface SmtpSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password?: string;
  smtp_use_tls: boolean;
  smtp_from_email: string;
  smtp_from_name: string;
  smtp_enabled: boolean;
}

export const authApi = {
  login: (login: string, password: string) =>
    api.post<Session>("/auth/login", { login, password }).then((r) => r.data),

  register: (input: { username: string; email: string; password: string }) =>
    api.post<{ message: string }>("/auth/register", input).then((r) => r.data),

  me: () =>
    api.get<SessionUser>("/auth/me").then((r) => r.data),

  refresh: () =>
    api.post<Session>("/auth/refresh").then((r) => r.data),

  logout: () =>
    api.post("/auth/logout").then(() => undefined),

  verifyEmail: (token: string) =>
    api.post<{ message: string }>("/auth/verify", { token }).then((r) => r.data),

  forgotPassword: (email: string) =>
    api.post<{ message: string }>("/auth/forgot-password", { email }).then((r) => r.data),

  resetPassword: (token: string, newPassword: string) =>
    api.post<{ message: string }>("/auth/reset-password", { token, new_password: newPassword }).then((r) => r.data),

  getSmtpSettings: () =>
    api.get<SmtpSettings>("/admin/settings/email").then((r) => r.data),

  updateSmtpSettings: (settings: SmtpSettings) =>
    api.put<{ message: string }>("/admin/settings/email", settings).then((r) => r.data),

  updateProfile: (data: { full_name?: string | null; school?: string | null; grade?: string | null; avatar_url?: string | null }) =>
    api.patch<SessionUser>("/auth/me", data).then((r) => r.data),

  changePassword: (data: { current_password: string; new_password: string }) =>
    api.post<{ message: string }>("/auth/change-password", data).then((r) => r.data),
};
