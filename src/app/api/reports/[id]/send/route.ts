import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailViaGmail } from "@/lib/gmail-send";
import { generateReportHtml } from "@/lib/report-pdf";
import { formatDateOnly } from "@/lib/report-week";
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
    .select("id, name, owner_user_id")
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

  const toSet = new Set(toAddresses);
  const ccAddresses: string[] = [];
  const { data: ownerUser } = await supabase.from("users").select("email").eq("id", project.owner_user_id).single();
  if (ownerUser?.email) {
    const e = ownerUser.email.trim().toLowerCase();
    if (e && !toSet.has(e)) {
      ccAddresses.push(e);
      toSet.add(e);
    }
  }

  const startDateStr = String(report.period_start).slice(0, 10);
  const endDateStr = String(report.period_end).slice(0, 10);
  const [y, m] = startDateStr.split("-").map(Number);
  const periodLabel =
    report.period_type === "month"
      ? new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : `Week of ${formatDateOnly(startDateStr)} – ${formatDateOnly(endDateStr)}`;
  const subject = `Report: ${project.name} – ${periodLabel}`;
  const reportBodyHtml = generateReportHtml({
    period_type: report.period_type,
    period_start: report.period_start,
    period_end: report.period_end,
    report_format: report.report_format,
    harvest_data_snapshot: report.harvest_data_snapshot,
  });
  const html = `
    <p>Please find below the project report for <strong>${project.name}</strong> (${periodLabel}).</p>
    ${reportBodyHtml}
    <p style="margin-top:16px;">If you have any questions, reply to this email.</p>
  `;

  try {
    const { error: emailError } = await sendEmailViaGmail(project.owner_user_id, {
      to: toAddresses,
      cc: ccAddresses.length > 0 ? ccAddresses : undefined,
      subject,
      html,
    });

    if (emailError) {
      const status = emailError.includes("Connect Google") ? 400 : 502;
      return NextResponse.json({ error: emailError }, { status });
    }

    const now = new Date().toISOString();
    await supabase.from("reports").update({
      status: "sent",
      sent_at: now,
      updated_at: now,
    }).eq("id", reportId);

    await supabase.from("report_history").insert({
      report_id: reportId,
      sent_at: now,
      recipient_emails: toAddresses,
    });

    return NextResponse.json({
      ok: true,
      sentTo: toAddresses,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
