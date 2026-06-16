import { auth } from "@/auth";
import { createReport } from "@/lib/create-report";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeReportFormat } from "@/lib/report-formats";
import { NextResponse } from "next/server";

async function getProjectAndCheckOwner(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
  userId: string
) {
  const { data } = await supabase
    .from("projects")
    .select("id, name, harvest_project_ids")
    .eq("id", projectId)
    .eq("owner_user_id", userId)
    .single();
  return data;
}

/** List reports for this project */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;
  const supabase = createAdminClient();
  const project = await getProjectAndCheckOwner(supabase, projectId, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: reports, error } = await supabase
    .from("reports")
    .select("id, period_type, period_start, period_end, status, created_at, approved_at")
    .eq("project_id", projectId)
    .order("period_end", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: reports ?? [] });
}

/** Create a new report (draft): fetch Harvest data and save snapshot */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;
  const supabase = createAdminClient();
  const project = await getProjectAndCheckOwner(supabase, projectId, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const harvestIds = (project.harvest_project_ids ?? []) as number[];
  if (harvestIds.length === 0) {
    return NextResponse.json(
      { error: "Project has no Harvest projects linked. Edit project to add them." },
      { status: 400 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const periodType = body.periodType === "month" ? "month" : "week";
  const reportFormat = normalizeReportFormat(body.reportFormat);
  let periodStart: string | undefined;
  let periodEnd: string | undefined;
  if (typeof body.periodStart === "string" && typeof body.periodEnd === "string") {
    periodStart = body.periodStart.slice(0, 10);
    periodEnd = body.periodEnd.slice(0, 10);
  }
  try {
    const report = await createReport(
      projectId,
      userId,
      periodType,
      periodStart,
      periodEnd,
      { status: "draft", reportFormat }
    );
    return NextResponse.json(report);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create report";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
