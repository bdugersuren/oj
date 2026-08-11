import { api } from "./client";
import { LessonListItem } from "./lessons";

export interface ClassroomListItem { id: number; name: string; description: string | null; invite_code: string; is_active: boolean; created_at: string; teacher_name: string; students_count: number; }
export interface ClassroomStudent { student_id: string; username: string; full_name: string | null; email: string; level: string; level_color: string; total_xp: number; solved_count: number; current_streak: number; highest_streak: number; elo_rating: number; joined_at: string; }
export interface ClassroomDetail extends ClassroomListItem { teacher_id: string; students: ClassroomStudent[]; pending_requests: ClassroomStudent[]; }
export interface TopicMastery { topic: string; average_mastery: number; total_solved: number; total_attempted: number; }

export interface ProgressMatrixLesson { id: number; title: string; order: number; }
export interface ProgressMatrixStudent { student_id: string; username: string; full_name: string; lesson_progress: Record<number, { is_completed: boolean; quiz_score: number }>; }
export interface ProgressMatrixData { lessons: ProgressMatrixLesson[]; students: ProgressMatrixStudent[]; }

export const classroomApi = {
  list: () => api.get<ClassroomListItem[]>("/classrooms/").then((response) => response.data),
  get: (id: number) => api.get<ClassroomDetail>(`/classrooms/${id}`).then((response) => response.data),
  create: (name: string, description?: string) => api.post<ClassroomDetail>("/classrooms/", { name, description }).then((response) => response.data),
  join: (inviteCode: string) => api.post<any>("/classrooms/join", { invite_code: inviteCode }).then((response) => response.data),
  approve: (id: number, studentId: string) => api.post<any>(`/classrooms/${id}/approve/${studentId}`).then((response) => response.data),
  reject: (id: number, studentId: string) => api.post<any>(`/classrooms/${id}/reject/${studentId}`).then((response) => response.data),
  progressMatrix: (id: number) => api.get<ProgressMatrixData>(`/classrooms/${id}/progress-matrix`).then((response) => response.data),
  heatmap: (id: number) => api.get<Record<string, number>>(`/classrooms/${id}/analytics/topic-heatmap`).then((response) => response.data),
  mastery: (id: number) => api.get<TopicMastery[]>(`/classrooms/${id}/analytics/topic-mastery`).then((response) => response.data),
  exportReport: (id: number) => api.get<Blob>(`/classrooms/${id}/export-report`, { responseType: "blob" }).then((response) => response.data),
  
  // Many-to-many lesson methods
  listLessons: (id: number) => api.get<LessonListItem[]>(`/classrooms/${id}/lessons`).then((response) => response.data),
  listAvailableLessons: (id: number) => api.get<LessonListItem[]>(`/classrooms/${id}/available-lessons`).then((response) => response.data),
  linkLesson: (classId: number, lessonId: number) => api.post<any>(`/classrooms/${classId}/lessons/${lessonId}`).then((response) => response.data),
  unlinkLesson: (classId: number, lessonId: number) => api.delete(`/classrooms/${classId}/lessons/${lessonId}`).then((response) => response.data),
  updateLessonProperties: (classId: number, lessonId: number, data: { order?: number; is_published?: boolean }) => api.put<any>(`/classrooms/${classId}/lessons/${lessonId}/order`, data).then((response) => response.data),
  delete: (id: number) => api.delete<any>(`/classrooms/${id}`).then((response) => response.data),
};
