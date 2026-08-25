import { api } from "./client";

export interface WorkspaceTestResult {
  testcase_id: number;
  status: string;
  time_ms: number;
  memory_kb: number;
  checker_output?: string;
}

export interface WorkspaceVerifyResult {
  status: string;
  error_log: string | null;
  results: WorkspaceTestResult[];
}

export interface WorkspaceGeneratedCase {
  idx: number;
  args: string;
}

export interface WorkspaceGeneratorResult {
  status: string;
  message: string;
  cases: WorkspaceGeneratedCase[];
}

interface WorkspaceJobResult {
  status: string;
  error_log?: string | null;
  message?: string;
  cases?: WorkspaceGeneratedCase[];
  test_results?: WorkspaceTestResult[];
}

interface WorkspaceJudgeJob {
  job_id: number;
  status: "QUEUED" | "RUNNING" | "FINAL" | "SYSTEM_ERROR";
  result: WorkspaceJobResult | null;
  error_log: string | null;
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const workspaceApi = {
  listFiles: (code: string) =>
    api.get<string[]>(`/workspace/${code}/files`).then((r) => r.data),

  getFile: (code: string, filename: string) =>
    api.get<{ filename: string; content: string }>(`/workspace/${code}/files/${filename}`).then((r) => r.data),

  saveFile: (code: string, filename: string, content: string) =>
    api.post<{ status: string; message: string }>(`/workspace/${code}/files/${filename}`, { content }).then((r) => r.data),

  generateTestcases: async (
    code: string,
    params: string[],
    pointsPerCase = 10,
  ): Promise<WorkspaceGeneratorResult> => {
    const queued = await api.post<{ job_id: number; status: string }>(
      `/workspace/${code}/generate-testcases`,
      { params, points_per_case: pointsPerCase },
    );
    for (let attempt = 0; attempt < 180; attempt += 1) {
      const { data: job } = await api.get<WorkspaceJudgeJob>(
        `/workspace/judge-jobs/${queued.data.job_id}`,
      );
      if (job.status === "FINAL" && job.result) {
        if (job.result.status !== "AC") {
          throw new Error(job.result.error_log || "Generator judge job амжилтгүй боллоо.");
        }
        return {
          status: job.result.status,
          message: job.result.message || "Тест кэйсүүд амжилттай үүслээ.",
          cases: job.result.cases ?? [],
        };
      }
      if (job.status === "SYSTEM_ERROR") {
        throw new Error(job.error_log || "Generator judge service алдаа гаргалаа.");
      }
      await wait(1000);
    }
    throw new Error("Generator judge job-ийн хүлээх хугацаа хэтэрлээ.");
  },

  publish: (code: string, data: any) =>
    api.post<{ status: string; message: string }>(`/workspace/${code}/publish`, data).then((r) => r.data),

  createFile: (code: string, filename: string, templateType?: string) =>
    api.post<{ status: string; message: string }>(`/workspace/${code}/create-file`, { filename, template_type: templateType }).then((r) => r.data),

  deleteFile: (code: string, filename: string) =>
    api.delete<{ status: string; message: string }>(`/workspace/${code}/delete-file?filename=${encodeURIComponent(filename)}`).then((r) => r.data),

  uploadImage: (code: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<{ status: string; filename: string; relative_path: string; message: string }>(
      `/workspace/${code}/upload-image`,
      fd,
      { headers: { "Content-Type": "multipart/form-data" } }
    ).then((r) => r.data);
  },

  uploadTestcasesZip: (code: string, file: File, pointsPerCase = 10) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<{ status: string; message: string; count: number }>(
      `/workspace/${code}/upload-testcases-zip?points_per_case=${pointsPerCase}`,
      fd,
      { headers: { "Content-Type": "multipart/form-data" } }
    ).then((r) => r.data);
  },
  testSolution: async (code: string): Promise<WorkspaceVerifyResult> => {
    const queued = await api.post<{ job_id: number; status: string }>(`/workspace/${code}/test-solution`);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const { data: job } = await api.get<WorkspaceJudgeJob>(`/workspace/judge-jobs/${queued.data.job_id}`);
      if (job.status === "FINAL" && job.result) {
        return {
          status: job.result.status,
          error_log: job.result.error_log ?? null,
          results: job.result.test_results ?? [],
        };
      }
      if (job.status === "SYSTEM_ERROR") {
        return { status: "SYSTEM_ERROR", error_log: job.error_log, results: [] };
      }
      await wait(1000);
    }
    throw new Error("Workspace judge job-ийн хүлээх хугацаа хэтэрлээ.");
  },
};
