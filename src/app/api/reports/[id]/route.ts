import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/** Approve a report (or update status). Caller must be the project owner. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: reportId } = await params;
  const supabase = createAdminClient();
  const { data: report } = await supabase
    .from("reports")
    .select("id, project_id")
    .eq("id", reportId)
    .single();
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", report.project_id)
    .eq("owner_user_id", userId)
    .single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status === "approved") {
    updates.status = "approved";
    updates.approved_at = new Date().toISOString();
    updates.approved_by_user_id = userId;
  }
  if (body.status === "rejected") {
    updates.status = "rejected";
    updates.rejected_at = new Date().toISOString();
  }
  const { data: updated, error } = await supabase
    .from("reports")
    .update(updates)
    .eq("id", reportId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(updated);
}

/** Get a single report (for project owner) */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: reportId } = await params;
  const supabase = createAdminClient();
  const { data: report } = await supabase
    .from("reports")
    .select("id, project_id, period_type, period_start, period_end, status, harvest_data_snapshot, approved_at, created_at")
    .eq("id", reportId)
    .single();
  if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", report.project_id)
    .eq("owner_user_id", userId)
    .single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(report);
}
