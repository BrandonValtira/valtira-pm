import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/** Get project metadata (display_title, harvest_project_ids). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await auth();
  if (!(session?.user as { id?: string })?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const name = decodeURIComponent((await params).name);
  if (!name) return NextResponse.json({ error: "Project name required" }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("resource_planning_projects")
    .select("project_name, display_title, harvest_project_ids, harvest_project_names")
    .eq("project_name", name)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data;
  return NextResponse.json({
    project_name: name,
    display_title: row?.display_title ?? null,
    harvest_project_ids: Array.isArray(row?.harvest_project_ids) ? row.harvest_project_ids : [],
    harvest_project_names: Array.isArray(row?.harvest_project_names) ? row.harvest_project_names : [],
  });
}

/** Update project metadata (display_title, harvest_project_ids). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await auth();
  if (!(session?.user as { id?: string })?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const name = decodeURIComponent((await params).name);
  if (!name) return NextResponse.json({ error: "Project name required" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const display_title =
    body.display_title !== undefined ? (body.display_title == null ? null : String(body.display_title).trim() || null) : undefined;
  const harvest_project_ids =
    body.harvest_project_ids !== undefined
      ? (Array.isArray(body.harvest_project_ids) ? body.harvest_project_ids.map((id: unknown) => Number(id)).filter((n: number) => !Number.isNaN(n)) : [])
      : undefined;
  const harvest_project_names =
    body.harvest_project_names !== undefined
      ? (Array.isArray(body.harvest_project_names) ? body.harvest_project_names.map((n: unknown) => String(n)) : [])
      : undefined;
  const supabase = createAdminClient();
  const payload: { updated_at: string; display_title?: string | null; harvest_project_ids?: number[]; harvest_project_names?: string[] } = {
    updated_at: new Date().toISOString(),
  };
  if (display_title !== undefined) payload.display_title = display_title;
  if (harvest_project_ids !== undefined) payload.harvest_project_ids = harvest_project_ids;
  if (harvest_project_names !== undefined) payload.harvest_project_names = harvest_project_names;
  const { data, error } = await supabase
    .from("resource_planning_projects")
    .upsert({ project_name: name, ...payload }, { onConflict: "project_name" })
    .select("project_name, display_title, harvest_project_ids, harvest_project_names")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** Delete a project (all allocations and metadata). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await auth();
  if (!(session?.user as { id?: string })?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const name = decodeURIComponent((await params).name);
  if (!name) return NextResponse.json({ error: "Project name required" }, { status: 400 });
  const supabase = createAdminClient();
  await supabase.from("resource_planning_projects").delete().eq("project_name", name);
  const { error } = await supabase
    .from("resource_planning_allocations")
    .delete()
    .eq("project_name", name);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
