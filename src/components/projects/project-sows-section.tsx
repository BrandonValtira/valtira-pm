"use client";

import { useCallback, useEffect, useState } from "react";

type SowFile = {
  id: string;
  file_name: string;
  uploaded_at: string;
};

export function ProjectSowsSection({
  projectName,
  onChanged,
}: {
  projectName: string;
  onChanged?: () => void;
}) {
  const [files, setFiles] = useState<SowFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/resource-planning/projects/${encodeURIComponent(projectName)}/sows`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load SOWs");
      setFiles(Array.isArray(data.files) ? data.files : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load SOWs");
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [projectName]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || file.type !== "application/pdf") {
      setError("Please select a PDF file.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(
        `/api/resource-planning/projects/${encodeURIComponent(projectName)}/sows`,
        { method: "POST", body: form }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(file: SowFile) {
    if (!confirm(`Delete "${file.file_name}"?`)) return;
    setDeletingId(file.id);
    setError("");
    try {
      const res = await fetch(
        `/api/resource-planning/projects/${encodeURIComponent(projectName)}/sows/${file.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Delete failed");
      }
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  function viewUrl(fileId: string) {
    return `/api/resource-planning/projects/${encodeURIComponent(projectName)}/sows/${fileId}`;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-600">
          Upload statement-of-work PDFs for this project. You can attach multiple SOWs.
        </p>
        <label className="inline-flex cursor-pointer items-center rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
          <input
            type="file"
            accept="application/pdf"
            onChange={handleUpload}
            disabled={uploading}
            className="sr-only"
          />
          {uploading ? "Uploading…" : "Upload SOW"}
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading SOWs…</p>
      ) : files.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-sm text-neutral-500">
          No SOWs uploaded yet.
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
          {files.map((file) => (
            <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">{file.file_name}</p>
                <p className="text-xs text-neutral-500">
                  Uploaded {new Date(file.uploaded_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={viewUrl(file.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  View
                </a>
                <button
                  type="button"
                  onClick={() => handleDelete(file)}
                  disabled={deletingId === file.id}
                  className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {deletingId === file.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
