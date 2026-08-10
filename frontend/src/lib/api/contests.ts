import { api } from "./client";

export type ContestStatus = "upcoming" | "running" | "ended";
export interface ContestListItem { id: number; title: string; description: string | null; start_time: string; end_time: string; creator_name: string; is_public: boolean; is_registered: boolean; status: ContestStatus; }
export interface ContestProblem { id: number; problem_id: number; code: string; title: string; points: number; order: number; }
export interface ContestDetail { id: number; title: string; description: string | null; start_time: string; end_time: string; is_public: boolean; problems: ContestProblem[]; is_registered: boolean; }
export interface StandingResult { problem_code: string; score: number; attempts: number; time_ms: number; }
export interface StandingRow { rank: number; user_id: string; username: string; total_score: number; total_time_ms: number; problem_results: StandingResult[]; }

export interface TeamMemberOut { user_id: string; username: string; }
export interface TeamOut { id: number; name: string; school: string | null; invite_code: string; created_at: string; members: TeamMemberOut[]; }
export interface TeamProblemResultOut { problem_code: string; score: number; attempts: number; time_minutes: number; is_solved: boolean; }
export interface TeamStandingRow { rank: number; team_id: number; team_name: string; school: string | null; members: string[]; solved_count: number; total_penalty: number; problem_results: TeamProblemResultOut[]; balloons: string[]; }

export const contestApi = {
  list: () => api.get<ContestListItem[]>("/contests/").then((response) => response.data),
  get: (id: number) => api.get<ContestDetail>(`/contests/${id}`).then((response) => response.data),
  register: (id: number) => api.post(`/contests/${id}/register`).then((response) => response.data),
  standings: (id: number) => api.get<StandingRow[]>(`/contests/${id}/standings`).then((response) => response.data),

  createTeam: (payload: { name: string; school?: string }) => api.post<TeamOut>("/contests/teams", payload).then((response) => response.data),
  joinTeam: (payload: { invite_code: string }) => api.post<TeamOut>("/contests/teams/join", payload).then((response) => response.data),
  getMyTeam: () => api.get<TeamOut>("/contests/teams/my").then((response) => response.data),
  registerTeam: (contestId: number) => api.post(`/contests/${contestId}/teams/register`).then((response) => response.data),
  teamStandings: (contestId: number) => api.get<TeamStandingRow[]>(`/contests/${contestId}/team-standings`).then((response) => response.data),
};
