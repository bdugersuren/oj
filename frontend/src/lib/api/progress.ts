import { api } from "./client";

export interface LeaderboardEntry { rank: number; username: string; full_name: string | null; level: string; level_color: string; total_xp: number; solved_count: number; streak: number; elo_rating: number; }
export interface TopicMastery { topic_slug: string; mastery_percentage: number; solved_count: number; attempted_count: number; wrong_count: number; }
export interface UserProgress { username: string; level_name: string; level_color: string; level_icon: string; total_xp: number; solved_count: number; current_streak: number; highest_streak: number; elo_rating: number; last_active_date: string; topic_masteries: TopicMastery[]; }

export const progressApi = {
  leaderboard: () => api.get<LeaderboardEntry[]>("/progress/leaderboard").then((r) => r.data),
  me: () => api.get<UserProgress>("/progress/me").then((r) => r.data),
  byUsername: (username: string) => api.get<UserProgress>(`/progress/${username}`).then((r) => r.data),
  achievements: () => api.get("/progress/achievements").then((r) => r.data),
  resolveDuel: (opponentUsername: string, result: "win" | "loss" | "draw") =>
    api.post("/progress/duel/resolve", { opponent_username: opponentUsername, result }).then((r) => r.data),
};
