import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/$/, "") ?? "";
const baseURL = `${apiOrigin}/api/v1`;

export type ApiError = { status: number; message: string; details?: unknown };

function csrfToken() {
  if (typeof document === "undefined") return undefined;
  return document.cookie.split("; ").find((item) => item.startsWith("oj_csrf="))?.split("=")[1];
}

export const api = axios.create({ baseURL, withCredentials: true, headers: { Accept: "application/json" } });

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (!["get", "head", "options"].includes(config.method?.toLowerCase() ?? "get")) {
    const token = csrfToken();
    if (token) config.headers.set("X-CSRF-Token", decodeURIComponent(token));
  }
  return config;
});

let refreshRequest: Promise<void> | null = null;
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ detail?: string }>) => {
    const request = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && request && !request._retried && !request.url?.includes("/auth/")) {
      request._retried = true;
      refreshRequest ??= api.post("/auth/refresh").then(() => undefined).finally(() => { refreshRequest = null; });
      try {
        await refreshRequest;
        return api(request);
      } catch {
        // The caller handles an expired session as a normal unauthenticated state.
      }
    }
    if ((!error.response || error.response?.status === 503) && typeof window !== "undefined" && window.location.pathname !== "/offline") {
      window.location.href = "/offline";
    }
    return Promise.reject(normalizeApiError(error));
  },
);

export function normalizeApiError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    return { status: error.response?.status ?? 0, message: error.response?.data?.detail ?? "Сервертэй холбогдоход алдаа гарлаа.", details: error.response?.data };
  }
  return { status: 0, message: "Тодорхойгүй алдаа гарлаа." };
}

export function websocketUrl(path: string) {
  const origin = apiOrigin || (typeof window !== "undefined" ? window.location.origin : "");
  const url = new URL(`/api/v1/ws/${path.replace(/^\//, "")}`, origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
