import { api } from "./client";

export type ProblemDifficulty = "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond";
export type SubmissionStatus = "PENDING" | "RUNNING" | "AC" | "WA" | "TLE" | "MLE" | "OLE" | "RTE" | "CE" | "SYSTEM_ERROR";

export interface TestCase { 
  id: number; 
  input_data: string; 
  output_data: string; 
  points: number; 
  order: number; 
  is_sample: boolean; 
}

export interface ProblemHint { 
  id: number; 
  level: number; 
  title: string; 
  hint_text: string; 
  xp_penalty: number; 
}

export interface Problem { 
  id: number; 
  code: string; 
  title: string; 
  points: number; 
  xp_reward: number; 
  difficulty: ProblemDifficulty; 
  topic: string; 
  time_limit: number; 
  memory_limit: number; 
  olympiad_scope: string; 
  division: string; 
  olympiad_year?: number | null; 
  source_citation?: string | null; 
  is_visible: boolean; 
  testcase_count: number; 
  accepted_count: number; 
  total_submissions: number; 
  created_by_id?: string | null;
}

export interface ProblemDetail extends Problem { 
  statement_markdown: string; 
  statement_pdf_path?: string | null; 
  sample_testcases: TestCase[]; 
  hints: ProblemHint[]; 
}

export interface JudgeResult { 
  id: number; 
  testcase_id: number; 
  status: string; 
  time_ms: number; 
  memory_kb: number; 
  output_log?: string | null; 
  actual_output?: string | null;
}

export interface SubmissionBatchCase {
  id?: number | null;
  testcase_id?: number | null;
  status: string;
  time_ms: number;
  memory_kb: number;
  output_log?: string | null;
  actual_output?: string | null;
  points: number;
  in_file?: string | null;
  out_file?: string | null;
  sample?: boolean;
}

export interface SubmissionBatch {
  batch_index: number;
  points: number;
  total_points: number;
  status: string;
  cases: SubmissionBatchCase[];
}

export interface Submission { 
  id: number; 
  problem_code: string; 
  language: string; 
  status: SubmissionStatus; 
  score: number; 
  time_ms: number; 
  memory_kb: number; 
  submitted_at: string; 
  is_pending?: boolean; 
  error_log?: string | null; 
  source_code?: string;
  is_batched?: boolean;
  batches?: SubmissionBatch[];
  judge_results: JudgeResult[]; 
}

export type SubmissionListItem = Omit<Submission, "judge_results" | "is_pending" | "error_log" | "is_batched" | "batches">;

export const problemApi = {
  list: (params?: Record<string, string | number | boolean | undefined>) => 
    api.get<Problem[]>("/problems/", { params }).then((r) => r.data),
  
  get: (code: string) => 
    api.get<ProblemDetail>(`/problems/${code}`).then((r) => r.data),
  
  submit: (problem_code: string, language: string, source_code: string, is_sample_test: boolean = false) => 
    api.post<{ submission_id: number; status: string }>("/submissions/", { problem_code, language, source_code, is_sample_test }).then((r) => r.data),
  
  submission: (id: number) => 
    api.get<Submission>(`/submissions/${id}`).then((r) => r.data),
  
  mySubmissions: (problemCode?: string) => 
    api.get<SubmissionListItem[]>("/submissions/my/list", { params: problemCode ? { problem_code: problemCode } : undefined }).then((r) => r.data),

  create: (data: any) =>
    api.post<ProblemDetail>("/problems/", data).then((r) => r.data),

  update: (code: string, data: any) =>
    api.put<ProblemDetail>(`/problems/${code}`, data).then((r) => r.data),

  delete: (code: string) =>
    api.delete(`/problems/${code}`).then((r) => r.data),

  listTestcases: (code: string) =>
    api.get<TestCase[]>(`/problems/${code}/testcases`).then((r) => r.data),

  addTestcase: (code: string, data: any) =>
    api.post<TestCase>(`/problems/${code}/testcases`, data).then((r) => r.data),

  updateTestcase: (code: string, tcId: number, data: any) =>
    api.put<TestCase>(`/problems/${code}/testcases/${tcId}`, data).then((r) => r.data),

  deleteTestcase: (code: string, tcId: number) =>
    api.delete(`/problems/${code}/testcases/${tcId}`).then((r) => r.data),

  uploadTestcasesZip: (code: string, file: File, pointsPerCase = 10) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ message: string; added: number }>(
      `/problems/${code}/testcases/upload-zip?points_per_case=${pointsPerCase}`, 
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    ).then((r) => r.data);
  },

  listHints: (code: string) =>
    api.get<ProblemHint[]>(`/problems/${code}/hints`).then((r) => r.data),

  addHint: (code: string, data: any) =>
    api.post<ProblemHint>(`/problems/${code}/hints`, data).then((r) => r.data),

  updateHint: (code: string, hintId: number, data: any) =>
    api.put<ProblemHint>(`/problems/${code}/hints/${hintId}`, data).then((r) => r.data),

  deleteHint: (code: string, hintId: number) =>
    api.delete(`/problems/${code}/hints/${hintId}`).then((r) => r.data),

  uploadPdf: (code: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<{ status: string; message: string; path: string }>(
      `/problems/${code}/statement-pdf`, 
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    ).then((r) => r.data);
  },
  getStatementPdf: (code: string) =>
    api.get<{ url: string }>(`/problems/${code}/statement-pdf`).then((r) => r.data),

  leaderboard: (code: string) =>
    api.get<Array<{
      rank: number;
      submission_id: number;
      username: string;
      full_name?: string | null;
      avatar_url?: string | null;
      language: string;
      score: number;
      time_ms: number;
      memory_kb: number;
      submitted_at: string;
    }>>(`/submissions/leaderboard/${code}`).then((r) => r.data),

  exportProblem: (code: string) =>
    api.get(`/problems/${code}/export`, { responseType: 'blob' }).then((r) => r.data),

  importProblem: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post<Problem>("/problems/import", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }).then((r) => r.data);
  },

  deleteProblem: (code: string) =>
    api.delete(`/problems/${code}`).then((r) => r.data),
};
