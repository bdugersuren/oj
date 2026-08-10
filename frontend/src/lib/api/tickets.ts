import { api } from "./client";

export interface TicketListItem { id: number; student_id: string; student_name: string; problem_id: number; problem_code: string; problem_title: string; submission_id: number | null; title: string; status: "OPEN" | "ANSWERED" | "RESOLVED"; created_at: string; resolved_at: string | null; messages_count: number; }
export interface TicketMessage { id: number; sender_id: string; sender_name: string; sender_role: string; content: string; code_snippet: string | null; created_at: string; }
export interface TicketDetail extends Omit<TicketListItem, "problem_id" | "messages_count"> { submission_status: string | null; messages: TicketMessage[]; }

export const ticketApi = {
  list: () => api.get<TicketListItem[]>("/tickets/").then((response) => response.data),
  get: (id: number) => api.get<TicketDetail>(`/tickets/${id}`).then((response) => response.data),
  create: (payload: { problem_code: string; title: string; description: string; submission_id?: number }) => api.post<TicketDetail>("/tickets/", payload).then((response) => response.data),
  reply: (id: number, content: string) => api.post<TicketMessage>(`/tickets/${id}/reply`, { content }).then((response) => response.data),
  resolve: (id: number) => api.post(`/tickets/${id}/resolve`).then((response) => response.data),
};
