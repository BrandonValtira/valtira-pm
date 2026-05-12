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
  const [allocRes, metaRes] = await Promise.all([
    supabase
      .from("resource_planning_allocations")
      .select("project_name")
      .gte("week_start", minWeek),
    supabase.from("resource_planning_projects").select("project_name, display_title, harvest_project_ids, harvest_project_names"),
  ]);
  if (allocRes.error) return NextResponse.json({ error: allocRes.error.message }, { status: 500 });
  const names = Array.from(new Set((allocRes.data ?? []).map((r) => r.project_name))).filter(Boolean).sort();
  const meta: Record<string, { display_title: string | null; harvest_project_ids: number[]; harvest_project_names: string[] }> = {};
  if (!metaRes.error && metaRes.data) {
    for (const row of metaRes.data) {
      meta[row.project_name] = {
        display_title: row.display_title ?? null,
        harvest_project_ids: Array.isArray(row.harvest_project_ids) ? row.harvest_project_ids : [],
        harvest_project_names: Array.isArray(row.harvest_project_names) ? row.harvest_project_names : [],
      };
    }
  }
  return NextResponse.json({ projects: names, projectMeta: meta });
}
