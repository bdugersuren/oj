import { api } from "./client";

export interface Stage { id: number; slug: string; title: string; description: string | null; order: number; is_locked: boolean; is_completed: boolean; problems_count: number; solved_count: number; }
export interface World { id: number; slug: string; title: string; description: string | null; order: number; required_level_id: number; required_level_name: string; stages: Stage[]; }
export interface StageProblem { id: number; problem_id: number; code: string; title: string; difficulty: string; points: number; is_required: boolean; order: number; is_solved: boolean; }

export const worldApi = {
  list: () => api.get<World[]>("/worlds/").then((response) => response.data),
  stageProblems: (slug: string) => api.get<StageProblem[]>(`/worlds/${slug}/stages`).then((response) => response.data),
};
