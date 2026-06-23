import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendProjectReportToClients } from "@/lib/send-project-report";
import { NextResponse } from "next/server";

/**
 * Send report by email (content in body, same as weekly). No PDF attachment.
 * Caller must be the project owner. Report can be draft or approved.
 */
export async function POST(
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
    .select("id, project_id, period_type, period_start, period_end, harvest_data_snapshot, status, report_format")
    .eq("id", reportId)
    .single();
  if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, owner_user_id, client_emails")
    .eq("id", report.project_id)
    .eq("owner_user_id", userId)
    .single();
  if (!project) return NextResponse.json({ error: "Report not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const emails = Array.isArray(body.emails) ? body.emails : typeof body.emails === "string" ? [body.emails] : [];
  const toAddresses = emails.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean);
  if (toAddresses.length === 0) {
    return NextResponse.json({ error: "At least one recipient email is required" }, { status: 400 });
  }

  const projectForSend = { ...project, client_emails: toAddresses };
  const result = await sendProjectReportToClients(supabase, report, projectForSend);
  if (result.error) {
    const status = result.error.includes("Connect Google") ? 400 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    sentTo: result.sentTo,
  });
}
