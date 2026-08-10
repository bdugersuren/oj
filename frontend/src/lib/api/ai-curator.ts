import { api } from "./client";

export interface TopicData {
  id: number;
  topic: string;
  title: string;
  content_mongolian: string;
  source_url: string | null;
  status: "Draft" | "Approved" | "Rejected";
  is_vector_indexed: boolean;
  qdrant_point_id: string | null;
}

export const aiCuratorApi = {
  ingest: (payload: { topic: string; title: string; content_mongolian: string; source_url?: string }) =>
    api.post<TopicData>("/ai-tutor/curator/ingest", payload).then((r) => r.data),

  scrape: (payload: { url: string; topic: string }) =>
    api.post<{ message: string }>("/ai-tutor/curator/scrape", payload).then((r) => r.data),

  getDrafts: () =>
    api.get<TopicData[]>("/ai-tutor/curator/drafts").then((r) => r.data),

  listAll: () =>
    api.get<TopicData[]>("/ai-tutor/curator/list").then((r) => r.data),

  approve: (id: number, payload: { topic?: string; title?: string; content_mongolian?: string }) =>
    api.put<TopicData>(`/ai-tutor/curator/approve/${id}`, payload).then((r) => r.data),

  reject: (id: number) =>
    api.put<TopicData>(`/ai-tutor/curator/reject/${id}`).then((r) => r.data),

  getExportUrl: () => {
    const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/$/, "") ?? "";
    return `${apiOrigin}/api/v1/ai-tutor/curator/export`;
  }
};
