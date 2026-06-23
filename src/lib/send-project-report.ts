import type { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailViaGmail } from "@/lib/gmail-send";
import { generateReportHtml } from "@/lib/report-pdf";
import { formatDateOnly } from "@/lib/report-week";

type ReportRow = {
  id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  harvest_data_snapshot?: unknown | null;
  report_format?: string | null;
};

type ProjectRow = {
  id: string;
  name: string;
  owner_user_id: string;
  client_emails?: string[] | null;
};

/** Send report HTML to project client recipients via the owner's Gmail. Marks report sent. */
export async function sendProjectReportToClients(
  supabase: ReturnType<typeof createAdminClient>,
  report: ReportRow,
  project: ProjectRow
): Promise<{ error?: string; sentTo?: string[] }> {
  const toAddresses = (project.client_emails ?? [])
    .map((e) => String(e).trim().toLowerCase())
    .filter(Boolean);
  if (toAddresses.length === 0) {
    return { error: "No client recipient emails configured on this project." };
  }

  const toSet = new Set(toAddresses);
  const ccAddresses: string[] = [];
  const { data: ownerUser } = await supabase
    .from("users")
    .select("email")
    .eq("id", project.owner_user_id)
    .single();
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
    harvest_data_snapshot: report.harvest_data_snapshot ?? null,
  });
  const html = `
    <p>Please find below the project report for <strong>${project.name}</strong> (${periodLabel}).</p>
    ${reportBodyHtml}
    <p style="margin-top:16px;">If you have any questions, reply to this email.</p>
  `;

  const { error: emailError } = await sendEmailViaGmail(project.owner_user_id, {
    to: toAddresses,
    cc: ccAddresses.length > 0 ? ccAddresses : undefined,
    subject,
    html,
  });
  if (emailError) return { error: emailError };

  const now = new Date().toISOString();
  await supabase
    .from("reports")
    .update({
      status: "sent",
      sent_at: now,
      updated_at: now,
    })
    .eq("id", report.id);

  await supabase.from("report_history").insert({
    report_id: report.id,
    sent_at: now,
    recipient_emails: toAddresses,
  });

  return { sentTo: toAddresses };
}
