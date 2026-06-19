import type { createAdminClient } from "@/lib/supabase/admin";

export const RP_CONTEXT_STORAGE_PREFIX = "resource-planning-context";

export function rpContextMaterialStoragePath(fileId: string): string {
  return `${RP_CONTEXT_STORAGE_PREFIX}/${fileId}.pdf`;
}

export type RpProjectFileRow = {
  id: string;
  file_name: string;
  storage_path: string;
  file_type: "sow" | "pdf_note" | "meet_recording";
  uploaded_at: string;
  metadata?: Record<string, unknown> | null;
};

export type ContextProjectFile = {
  id: string;
  file_name: string;
  storage_path: string;
  file_type: "transcript" | "pdf_note" | "meet_recording";
  uploaded_at: string;
  metadata?: Record<string, unknown>;
  /** SOW PDFs from the Statements of work section — read-only in materials. */
  isSow?: boolean;
};

export function mapRpFileToContextFile(row: RpProjectFileRow): ContextProjectFile {
  if (row.file_type === "meet_recording") {
    return {
      id: row.id,
      file_name: row.file_name,
      storage_path: row.storage_path,
      file_type: "meet_recording",
      uploaded_at: row.uploaded_at,
      metadata: row.metadata ?? undefined,
    };
  }
  return {
    id: row.id,
    file_name: row.file_name,
    storage_path: row.storage_path,
    file_type: "pdf_note",
    uploaded_at: row.uploaded_at,
    metadata: row.metadata ?? undefined,
    isSow: row.file_type === "sow",
  };
}

export async function resourcePlanningProjectExists(
  supabase: ReturnType<typeof createAdminClient>,
  projectName: string
): Promise<boolean> {
  const [{ data: meta }, { data: alloc }] = await Promise.all([
    supabase.from("resource_planning_projects").select("project_name").eq("project_name", projectName).maybeSingle(),
    supabase
      .from("resource_planning_allocations")
      .select("id")
      .eq("project_name", projectName)
      .limit(1)
      .maybeSingle(),
  ]);
  return Boolean(meta || alloc);
}
