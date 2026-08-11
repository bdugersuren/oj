import { api } from "./client";

export const workspaceApi = {
  listFiles: (code: string) =>
    api.get<string[]>(`/workspace/${code}/files`).then((r) => r.data),

  getFile: (code: string, filename: string) =>
    api.get<{ filename: string; content: string }>(`/workspace/${code}/files/${filename}`).then((r) => r.data),

  saveFile: (code: string, filename: string, content: string) =>
    api.post<{ status: string; message: string }>(`/workspace/${code}/files/${filename}`, { content }).then((r) => r.data),

  generateTestcases: (code: string, params: string[], pointsPerCase = 10) =>
    api.post<{ status: string; message: string; cases: any[] }>(`/workspace/${code}/generate-testcases`, { params, points_per_case: pointsPerCase }).then((r) => r.data),

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
  testSolution: (code: string) =>
    api.post<{ status: string; error_log: string | null; results: any[] }>(`/workspace/${code}/test-solution`).then((r) => r.data),
};
