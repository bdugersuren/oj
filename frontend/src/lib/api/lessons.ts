import { api } from "./client";

export interface LessonListItem { 
  id: number; 
  slug: string; 
  title: string; 
  category: string; 
  topic: string; 
  difficulty: string; 
  estimated_minutes: number; 
  xp_reward: number; 
  summary: string; 
  order: number;
  is_published: boolean;
  is_public: boolean;
  practice_problems_count: number; 
  is_completed: boolean; 
  created_by_username?: string | null;
  classroom_ids?: number[];
}

export interface LessonQuiz { 
  id: number; 
  question: string; 
  options: string[]; 
  correct_option_index?: number;
  correct_answers_json?: string;
  quiz_type?: string;
  explanation?: string;
  order: number; 
}

export interface PracticeProblem { 
  id: number; 
  code: string; 
  title: string; 
  points: number; 
  xp_reward: number; 
  difficulty: string; 
  topic: string; 
  is_recommended: boolean; 
}

export interface LessonDetail extends LessonListItem { 
  content_markdown: string; 
  quizzes: LessonQuiz[]; 
  practice_problems: PracticeProblem[]; 
  quiz_score: number; 
  solved_quizzes?: number[];
}

export interface LessonCompletion { 
  success: boolean; 
  correct_count: number; 
  total_quizzes: number; 
  xp_earned: number; 
  message: string; 
}

export const lessonApi = {
  list: (params?: { category?: string; topic?: string; classroom_id?: number }) => 
    api.get<LessonListItem[]>("/lessons/", { params }).then((response) => response.data),
  
  adminList: (params?: { category?: string; topic?: string; search?: string; classroom_id?: number }) =>
    api.get<LessonListItem[]>("/lessons/admin/all", { params }).then((response) => response.data),

  get: (slug: string) => 
    api.get<LessonDetail>(`/lessons/${slug}`).then((response) => response.data),
  
  complete: (slug: string, answers: number[]) => 
    api.post<LessonCompletion>(`/lessons/${slug}/complete`, { answers }).then((response) => response.data),

  submitQuizIndividual: (slug: string, quizId: number, answer: any) =>
    api.post<any>(`/lessons/${slug}/quizzes/${quizId}/submit`, { answer }).then((response) => response.data),

  create: (data: any) => 
    api.post<LessonDetail>("/lessons/", data).then((response) => response.data),

  update: (slug: string, data: any) => 
    api.put<LessonDetail>(`/lessons/${slug}`, data).then((response) => response.data),

  delete: (slug: string) => 
    api.delete(`/lessons/${slug}`).then((response) => response.data),

  addQuiz: (slug: string, data: any) =>
    api.post<LessonQuiz>(`/lessons/${slug}/quizzes`, data).then((response) => response.data),

  deleteQuiz: (slug: string, quizId: number) =>
    api.delete(`/lessons/${slug}/quizzes/${quizId}`).then((response) => response.data),

  addProblem: (slug: string, problemCode: string, isRecommended = true, order = 1) =>
    api.post(`/lessons/${slug}/problems`, { problem_code: problemCode, is_recommended: isRecommended, order }).then((response) => response.data),

  removeProblem: (slug: string, lessonProblemId: number) =>
    api.delete(`/lessons/${slug}/problems/${lessonProblemId}`).then((response) => response.data),
};
