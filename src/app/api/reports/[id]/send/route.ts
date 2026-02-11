import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailViaGmail } from "@/lib/gmail-send";
import { generateReportPdf } from "@/lib/report-pdf";
import { NextResponse } from "next/server";

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Send report by email (PDF attachment) to the given addresses.
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
    .select("id, project_id, period_type, period_start, period_end, harvest_data_snapshot, status")
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
  const [ownerUser, superAdmins] = await Promise.all([
    supabase.from("users").select("email").eq("id", project.owner_user_id).single(),
    supabase.from("users").select("email").eq("role", "super_admin").not("email", "is", null),
  ]);
  for (const row of [ownerUser.data, ...(superAdmins.data ?? [])]) {
    if (row?.email) {
      const e = (row as { email: string }).email.trim().toLowerCase();
      if (e && !toSet.has(e)) {
        ccAddresses.push(e);
        toSet.add(e);
      }
    }
  }

  const periodLabel =
    report.period_type === "month"
      ? `${new Date(report.period_start).toLocaleDateString("en-US", { month: "long", year: "numeric" })}`
      : `Week of ${formatDate(report.period_start)} – ${formatDate(report.period_end)}`;
  const subject = `Report: ${project.name} – ${periodLabel}`;
  const html = `
    <p>Please find attached the project report for <strong>${project.name}</strong> (${periodLabel}).</p>
    <p>If you have any questions, reply to this email.</p>
  `;

  try {
    const pdfArrayBuffer = generateReportPdf({
      period_type: report.period_type,
      period_start: report.period_start,
      period_end: report.period_end,
      harvest_data_snapshot: report.harvest_data_snapshot,
    });
    const pdfBytes = Buffer.from(pdfArrayBuffer);
    const fileName = `report-${project.name.replace(/[^a-z0-9]/gi, "-")}-${report.period_start}.pdf`;

    const { error: emailError } = await sendEmailViaGmail(project.owner_user_id, {
      to: toAddresses,
      cc: ccAddresses.length > 0 ? ccAddresses : undefined,
      subject,
      html,
      attachments: [{ filename: fileName, content: pdfBytes }],
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
