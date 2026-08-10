import { api } from "./client";

export interface SocraticResponse { hint_level: number; hint_title: string; guidance_message: string; xp_penalty: number; suggested_followups: string[]; }
export const aiTutorApi = {
  ask: (payload: { problem_code: string; current_code: string; student_question: string; hint_level: number }) => api.post<SocraticResponse>("/ai-tutor/ask", payload).then((response) => response.data),
};
