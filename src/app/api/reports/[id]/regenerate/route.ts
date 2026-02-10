import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { regenerateReportSnapshot } from "@/lib/create-report";
import { NextResponse } from "next/server";

/** Re-fetch Harvest data for this report and set status back to draft (e.g. after reject). Caller must be project owner. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: reportId } = await params;
  const supabase = createAdminClient();
  const { data: report } = await supabase.from("reports").select("id, project_id").eq("id", reportId).single();
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", report.project_id)
    .eq("owner_user_id", userId)
    .single();
  if (!project) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  try {
    const updated = await regenerateReportSnapshot(reportId, userId);
    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Regenerate failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
