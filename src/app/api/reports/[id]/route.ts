import { auth } from "@/auth";
import { normalizeReportConfig, stampReportConfig } from "@/lib/report-config";
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
  if (body.reportConfig != null) {
    const { data: existing } = await supabase
      .from("reports")
      .select("report_format, report_config")
      .eq("id", reportId)
      .single();
    updates.report_config = stampReportConfig(
      normalizeReportConfig(body.reportConfig, existing?.report_format)
    );
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

const DELETABLE_STATUSES = ["draft", "pending_approval", "rejected"];

/** Delete a report that has not been sent. Caller must be project owner. */
export async function DELETE(
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
    .select("id, project_id, status")
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
  if (!DELETABLE_STATUSES.includes(report.status as string)) {
    return NextResponse.json(
      { error: "Only draft, pending approval, or rejected reports can be deleted." },
      { status: 400 }
    );
  }
  const { error } = await supabase.from("reports").delete().eq("id", reportId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
