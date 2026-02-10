import { createAdminClient } from "@/lib/supabase/admin";
import { createReport } from "@/lib/create-report";
import { sendReportApprovalRequestEmail, sendReportReminderEmail } from "@/lib/invite-email";
import { NextResponse } from "next/server";

/** Verify cron secret (Vercel Cron sends CRON_SECRET in Authorization: Bearer or header) */
function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (authHeader === `Bearer ${secret}`) return true;
  const headerSecret = req.headers.get("x-cron-secret");
  return headerSecret === secret;
}

/** Get emails to notify for report approval: project owner + all super_admins */
async function getApprovalRecipientEmails(
  supabase: ReturnType<typeof createAdminClient>,
  ownerUserId: string
): Promise<string[]> {
  const [owner, superAdmins] = await Promise.all([
    supabase.from("users").select("email").eq("id", ownerUserId).single(),
    supabase.from("users").select("email").eq("role", "super_admin").not("email", "is", null),
  ]);
  const emails = new Set<string>();
  if (owner?.data?.email) emails.add(owner.data.email.trim().toLowerCase());
  (superAdmins.data ?? []).forEach((u: { email: string | null }) => {
    if (u.email) emails.add(u.email.trim().toLowerCase());
  });
  return Array.from(emails);
}

/** Current time in Central (America/Chicago) - time_utc in DB is stored as Central. */
function getCentralNow(): { timeUtc: string; dayOfWeek: number; dayOfMonth: number } {
  const now = new Date();
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    day: "numeric",
  });
  const timeParts = timeFormatter.formatToParts(now);
  const dateParts = dateFormatter.formatToParts(now);
  const get = (parts: Intl.DateTimeFormatPart[], type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const hour = get(timeParts, "hour").padStart(2, "0");
  const minute = get(timeParts, "minute").padStart(2, "0");
  const timeUtc = `${hour}:${minute}`;
  const dayNames: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayNames[get(dateParts, "weekday")] ?? 0;
  const dayOfMonth = Math.min(28, parseInt(get(dateParts, "day"), 10) || 1);
  return { timeUtc, dayOfWeek, dayOfMonth };
}

/**
 * Run report automations: create reports for due automations (requires_approval → pending_approval + email),
 * then send 24h reminders for reports still awaiting action.
 * Call via Vercel Cron: 0 * * * * (every hour) with Authorization: Bearer CRON_SECRET.
 * Schedule matching uses Central time (America/Chicago); time_utc in DB is stored as Central.
 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { timeUtc, dayOfWeek, dayOfMonth } = getCentralNow();

  const { data: automations } = await supabase
    .from("report_automations")
    .select("id, project_id, period_type, day_of_week, day_of_month, time_utc, requires_approval")
    .eq("is_active", true);

  const due = (automations ?? []).filter((a) => {
    if ((a.time_utc ?? "").slice(0, 5) !== timeUtc) return false;
    if (a.period_type === "week") return (a.day_of_week ?? 0) === dayOfWeek;
    if (a.period_type === "month") return (a.day_of_month ?? 1) === dayOfMonth;
    return false;
  });

  const results: { created?: string[]; reminders?: string[]; errors?: string[] } = {};
  const errors: string[] = [];

  for (const automation of due) {
    try {
      const { data: project } = await supabase
        .from("projects")
        .select("id, name, owner_user_id")
        .eq("id", automation.project_id)
        .single();
      if (!project?.owner_user_id) continue;
      const report = await createReport(
        automation.project_id,
        project.owner_user_id,
        automation.period_type as "week" | "month",
        undefined,
        undefined,
        {
          status: "pending_approval",
          approvalRequestedAt: new Date().toISOString(),
        }
      );
      const toEmails = await getApprovalRecipientEmails(supabase, project.owner_user_id);
      const sendErr = await sendReportApprovalRequestEmail(
        toEmails,
        project.name,
        automation.project_id,
        report.id
      );
      if (sendErr.error) errors.push(`approval email ${report.id}: ${sendErr.error}`);
      else (results.created = results.created ?? []).push(report.id);
    } catch (e) {
      errors.push(`create report ${automation.project_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: needsReminder } = await supabase
    .from("reports")
    .select("id, project_id")
    .in("status", ["pending_approval", "rejected"])
    .not("approval_requested_at", "is", null)
    .lt("approval_requested_at", twentyFourHoursAgo)
    .is("reminder_sent_at", null);

  for (const report of needsReminder ?? []) {
    try {
      const { data: project } = await supabase
        .from("projects")
        .select("id, name, owner_user_id")
        .eq("id", report.project_id)
        .single();
      if (!project?.owner_user_id) continue;
      const toEmails = await getApprovalRecipientEmails(supabase, project.owner_user_id);
      const sendErr = await sendReportReminderEmail(toEmails, project.name, report.project_id, report.id);
      if (sendErr.error) errors.push(`reminder ${report.id}: ${sendErr.error}`);
      else {
        await supabase.from("reports").update({ reminder_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", report.id);
        (results.reminders = results.reminders ?? []).push(report.id);
      }
    } catch (e) {
      errors.push(`reminder ${report.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (errors.length) results.errors = errors;
  return NextResponse.json(results);
}
