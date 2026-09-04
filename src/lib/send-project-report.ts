import { readFile } from "node:fs/promises";
import path from "node:path";
import type { createAdminClient } from "@/lib/supabase/admin";
import { sendEmailViaGmail } from "@/lib/gmail-send";
import { generateReportEmailHtml, formatReportDateRange, VALTIRA_LOGO_CID } from "@/lib/report-email";
import {
  budgetReportLabel,
  isOutdatedOutgoingReport,
  LEGACY_REPORT_SEND_ERROR,
  normalizeReportConfig,
} from "@/lib/report-config";
import { generateTaskDetailCsv, taskDetailFilename } from "@/lib/report-task-csv";

type ReportRow = {
  id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  harvest_data_snapshot?: unknown | null;
  report_format?: string | null;
  report_config?: unknown;
  status?: string | null;
};

type ProjectRow = {
  id: string;
  name: string;
  owner_user_id: string;
  client_emails?: string[] | null;
};

async function loadValtiraLogoPng(): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "public", "valtira-logo.png"));
  } catch {
    return null;
  }
}

/** Send report HTML to project client recipients via the owner's Gmail. Marks report sent. */
export async function sendProjectReportToClients(
  supabase: ReturnType<typeof createAdminClient>,
  report: ReportRow,
  project: ProjectRow
): Promise<{ error?: string; sentTo?: string[] }> {
  if (isOutdatedOutgoingReport(report.report_config, report.status)) {
    return { error: LEGACY_REPORT_SEND_ERROR };
  }

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

  const config = normalizeReportConfig(report.report_config, report.report_format);
  const subject = `${budgetReportLabel(report.period_type)}: ${project.name} · ${formatReportDateRange(String(report.period_start), String(report.period_end))}`;
  const html = generateReportEmailHtml(
    {
      period_type: report.period_type,
      period_start: report.period_start,
      period_end: report.period_end,
      report_format: report.report_format,
      report_config: config,
      harvest_data_snapshot: (report.harvest_data_snapshot ?? null) as never,
    },
    project.name
  );

  const attachments: { filename: string; content: Buffer; cid?: string; contentType?: string }[] = [];
  const logo = await loadValtiraLogoPng();
  if (logo) {
    attachments.push({
      filename: "valtira-logo.png",
      content: logo,
      cid: VALTIRA_LOGO_CID,
      contentType: "image/png",
    });
  }

  if (config.components.taskDetail) {
    const snapshot = (report.harvest_data_snapshot ?? {}) as {
      timeEntries?: Parameters<typeof generateTaskDetailCsv>[0];
      harvestProjects?: { hourly_rate?: number | null }[];
    };
    const fallbackRate =
      snapshot.harvestProjects && snapshot.harvestProjects.length > 0
        ? snapshot.harvestProjects.reduce((s, p) => s + (p.hourly_rate ?? 0), 0) /
          snapshot.harvestProjects.length
        : null;
    attachments.push({
      filename: taskDetailFilename(project.name, String(report.period_start), String(report.period_end)),
      content: generateTaskDetailCsv(snapshot.timeEntries ?? [], fallbackRate),
      contentType: "text/csv",
    });
  }

  const { error: emailError } = await sendEmailViaGmail(project.owner_user_id, {
    to: toAddresses,
    cc: ccAddresses.length > 0 ? ccAddresses : undefined,
    subject,
    html,
    attachments: attachments.length > 0 ? attachments : undefined,
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
