import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/** Sunday of the week containing date (local date string YYYY-MM-DD). */
function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

/** One year ago from today (for retention). */
function oneYearAgo(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const session = await auth();
  if (!(session?.user as { id?: string })?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  let weekStart = url.searchParams.get("weekStart");
  let weekEnd = url.searchParams.get("weekEnd");
  const minWeek = oneYearAgo();
  const today = new Date();
  if (!weekStart) {
    weekStart = getWeekStart(today);
  }
  if (!weekEnd) {
    const start = new Date(weekStart + "T12:00:00Z");
    start.setDate(start.getDate() + 6);
    weekEnd = start.toISOString().slice(0, 10);
  }
  if (weekStart < minWeek) weekStart = minWeek;
  if (weekEnd < minWeek) weekEnd = minWeek;

  const resourceName = url.searchParams.get("resourceName");

  const supabase = createAdminClient();
  let q = supabase
    .from("resource_planning_allocations")
    .select("id, resource_name, role, project_name, week_start, fte")
    .gte("week_start", weekStart)
    .lte("week_start", weekEnd);
  if (resourceName) q = q.eq("resource_name", resourceName);
  const { data, error } = await q
    .order("resource_name")
    .order("project_name")
    .order("role")
    .order("week_start");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ allocations: data ?? [] });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!(session?.user as { id?: string })?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const minWeek = oneYearAgo();
  const body = await req.json().catch(() => ({}));
  const single = body.resourceName != null;
  const items = single
    ? [{ resourceName: body.resourceName, role: body.role, projectName: body.projectName, weekStart: body.weekStart, fte: body.fte }]
    : Array.isArray(body.allocations) ? body.allocations : [];

  const rows = items
    .filter(
      (r: { weekStart?: string }) => r.weekStart && String(r.weekStart).slice(0, 10) >= minWeek
    )
    .map((r: { resourceName?: string; role?: string; projectName?: string; weekStart?: string; fte?: number }) => ({
      resource_name: String(r.resourceName ?? "").trim(),
      role: String(r.role ?? "").trim(),
      project_name: String(r.projectName ?? "").trim(),
      week_start: String(r.weekStart ?? "").slice(0, 10),
      fte: Math.min(1, Math.max(0, Number(r.fte) || 0)),
      updated_at: new Date().toISOString(),
    }))
    .filter((r: { resource_name: string; role: string; project_name: string; week_start: string }) => r.resource_name && r.role && r.project_name && r.week_start);

  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid allocations" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("resource_planning_allocations")
    .upsert(rows, { onConflict: "resource_name,role,project_name,week_start", ignoreDuplicates: false })
    .select("id, resource_name, role, project_name, week_start, fte");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(single ? (data?.[0] ?? data) : { allocations: data ?? [] });
}

/** Delete allocations for a resource on a project from a given week forward (keeps past weeks). */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!(session?.user as { id?: string })?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const projectName = url.searchParams.get("projectName");
  const resourceName = url.searchParams.get("resourceName");
  const role = url.searchParams.get("role");
  const fromWeek = url.searchParams.get("fromWeek");
  if (!projectName || !resourceName || !role || !fromWeek) {
    return NextResponse.json(
      { error: "projectName, resourceName, role, and fromWeek are required" },
      { status: 400 }
    );
  }
  const week = String(fromWeek).slice(0, 10);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("resource_planning_allocations")
    .delete()
    .eq("project_name", projectName)
    .eq("resource_name", resourceName)
    .eq("role", role)
    .gte("week_start", week);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
