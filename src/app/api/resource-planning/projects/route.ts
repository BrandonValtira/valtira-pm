import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!(session?.user as { id?: string })?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  const minWeek = d.toISOString().slice(0, 10);
  const supabase = createAdminClient();
  const [allocRes, metaRes, sowRes] = await Promise.all([
    supabase
      .from("resource_planning_allocations")
      .select("project_name")
      .gte("week_start", minWeek),
    supabase.from("resource_planning_projects").select("project_name, display_title, harvest_project_ids, harvest_project_names"),
    supabase.from("resource_planning_project_files").select("id, project_name, file_type"),
  ]);
  if (allocRes.error) return NextResponse.json({ error: allocRes.error.message }, { status: 500 });
  const names = Array.from(new Set((allocRes.data ?? []).map((r) => r.project_name))).filter(Boolean).sort();
  const sowIdsByProject = new Map<string, string[]>();
  if (!sowRes.error && sowRes.data) {
    for (const row of sowRes.data) {
      if (row.file_type && row.file_type !== "sow") continue;
      const list = sowIdsByProject.get(row.project_name) ?? [];
      list.push(row.id);
      sowIdsByProject.set(row.project_name, list);
    }
  }
  const meta: Record<string, {
    display_title: string | null;
    harvest_project_ids: number[];
    harvest_project_names: string[];
    sow_count: number;
    sole_sow_id: string | null;
  }> = {};
  if (!metaRes.error && metaRes.data) {
    for (const row of metaRes.data) {
      const sowIds = sowIdsByProject.get(row.project_name) ?? [];
      meta[row.project_name] = {
        display_title: row.display_title ?? null,
        harvest_project_ids: Array.isArray(row.harvest_project_ids) ? row.harvest_project_ids : [],
        harvest_project_names: Array.isArray(row.harvest_project_names) ? row.harvest_project_names : [],
        sow_count: sowIds.length,
        sole_sow_id: sowIds.length === 1 ? sowIds[0] : null,
      };
    }
  }
  for (const [projectName, sowIds] of Array.from(sowIdsByProject.entries())) {
    if (meta[projectName]) continue;
    meta[projectName] = {
      display_title: null,
      harvest_project_ids: [],
      harvest_project_names: [],
      sow_count: sowIds.length,
      sole_sow_id: sowIds.length === 1 ? sowIds[0] : null,
    };
  }
  return NextResponse.json({ projects: names, projectMeta: meta });
}
