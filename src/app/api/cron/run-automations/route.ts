import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPlaceholderReport, createReport } from "@/lib/create-report";
import {
  automationNeedsApproval,
  sendReportApprovalRequest,
  sendReportReminder,
} from "@/lib/send-report-approval-email";
import { sendProjectReportToClients } from "@/lib/send-project-report";
import { NextResponse } from "next/server";

export const maxDuration = 300;

/** Authorized if: (1) CRON_SECRET matches Bearer or x-cron-secret header, or (2) user is logged in (for testing). */
async function isAuthorized(req: Request): Promise<{ ok: boolean; isTestRun: boolean; automationId: string | null; userId: string | null; isSuperAdmin: boolean }> {
  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && (authHeader === `Bearer ${secret}` || req.headers.get("x-cron-secret") === secret)) {
    return { ok: true, isTestRun: false, automationId: null, userId: null, isSuperAdmin: false };
  }
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id ?? null;
  const isSuperAdmin = (session?.user as { role?: string })?.role === "super_admin";
  if (userId) {
    const testRun = url.searchParams.get("test") === "1";
    const automationId = url.searchParams.get("automationId")?.trim() || null;
    return { ok: true, isTestRun: testRun, automationId, userId, isSuperAdmin };
  }
  return { ok: false, isTestRun: false, automationId: null, userId: null, isSuperAdmin: false };
}

/** Get emails to notify for report approval: project owner only (no super_admin CC). */
async function getApprovalRecipientEmails(
  supabase: ReturnType<typeof createAdminClient>,
  ownerUserId: string
): Promise<string[]> {
  const { data: owner } = await supabase.from("users").select("email").eq("id", ownerUserId).single();
  if (!owner?.email) return [];
  return [owner.email.trim().toLowerCase()];
}

/** Normalize HH:MM so "9:00" and "09:00" match. */
function normalizeTime(hhmm: string): string {
  const parts = (hhmm ?? "").trim().split(":");
  const h = Math.min(23, Math.max(0, parseInt(parts[0], 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0));
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function isAutomationDue(
  automation: {
    period_type: string;
    day_of_week: number | null;
    day_of_month: number | null;
    time_utc: string;
  },
  timeUtc: string,
  dayOfWeek: number,
  businessDayOfMonth: number
): boolean {
  const scheduled = normalizeTime((automation.time_utc ?? "").slice(0, 5));
  const [schedH, schedM] = scheduled.split(":").map((n) => parseInt(n, 10));
  const [currH, currM] = timeUtc.split(":").map((n) => parseInt(n, 10));
  // Hourly cron fires at :00; match the scheduled hour (and minute when not on the hour).
  if (schedH !== currH) return false;
  if (schedM !== 0 && !(schedM === currM)) return false;
  if (automation.period_type === "week") return (automation.day_of_week ?? 0) === dayOfWeek;
  if (automation.period_type === "month") return (automation.day_of_month ?? 1) === businessDayOfMonth;
  return false;
}

async function markApprovalEmailSent(
  supabase: ReturnType<typeof createAdminClient>,
  reportId: string
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("reports")
    .update({ approval_email_sent_at: now, updated_at: now })
    .eq("id", reportId);
}

/** Count weekdays (1–5) from the 1st through the given day in Central. */
function getBusinessDayOfMonthInCentral(year: number, month: number, day: number): number {
  let count = 0;
  for (let d = 1; d <= day; d++) {
    const date = new Date(Date.UTC(year, month - 1, d, 12, 0, 0));
    const w = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(date);
    if (w !== "Sat" && w !== "Sun") count++;
  }
  return count;
}

/** Current time in Central (America/Chicago). Monthly automations use business day (1st, 2nd, 3rd… weekday). */
function getCentralNow(): { timeUtc: string; dayOfWeek: number; dayOfMonth: number; businessDayOfMonth: number; centralYear: number; centralMonth: number; centralDay: number } {
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
    month: "numeric",
    year: "numeric",
  });
  const timeParts = timeFormatter.formatToParts(now);
  const dateParts = dateFormatter.formatToParts(now);
  const get = (parts: Intl.DateTimeFormatPart[], type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const hour = get(timeParts, "hour").padStart(2, "0");
  const minute = get(timeParts, "minute").padStart(2, "0");
  const timeUtc = `${hour}:${minute}`;
  const dayNames: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayNames[get(dateParts, "weekday")] ?? 0;
  const centralDay = parseInt(get(dateParts, "day"), 10) || 1;
  const centralMonth = parseInt(get(dateParts, "month"), 10) || 1;
  const centralYear = parseInt(get(dateParts, "year"), 10) || now.getFullYear();
  const dayOfMonth = Math.min(28, centralDay);
  const businessDayOfMonth = getBusinessDayOfMonthInCentral(centralYear, centralMonth, centralDay);
  return { timeUtc, dayOfWeek, dayOfMonth, businessDayOfMonth, centralYear, centralMonth, centralDay };
}

/**
 * Run report automations: create reports for due automations (requires_approval → pending_approval + email),
 * then send 24h reminders for reports still awaiting action.
 * - Prod: Vercel Cron calls with Authorization: Bearer CRON_SECRET (no query params).
 * - Test: Logged-in user calls GET with ?test=1 to run all active automations now (ignores schedule).
 * - Test one: GET with ?test=1&automationId=xxx to run only that automation (user must own the project or be super_admin).
 */
export async function GET(req: Request) {
  const { ok, isTestRun, automationId: requestedAutomationId, userId, isSuperAdmin } = await isAuthorized(req);
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized. Use CRON_SECRET or log in and add ?test=1 to test." }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { timeUtc, dayOfWeek, businessDayOfMonth } = getCentralNow();

  let due: {
    id: string;
    project_id: string;
    period_type: string;
    day_of_week: number | null;
    day_of_month: number | null;
    time_utc: string;
    requires_approval: boolean;
    report_format: string;
  }[];

  if (isTestRun && requestedAutomationId && userId) {
    const { data: automation } = await supabase
      .from("report_automations")
      .select("id, project_id, period_type, day_of_week, day_of_month, time_utc, requires_approval, report_format")
      .eq("id", requestedAutomationId)
      .eq("is_active", true)
      .maybeSingle();
    if (!automation) {
      return NextResponse.json({ error: "Automation not found or inactive." }, { status: 404 });
    }
    const { data: project } = await supabase
      .from("projects")
      .select("owner_user_id")
      .eq("id", automation.project_id)
      .single();
    if (!project?.owner_user_id) {
      return NextResponse.json({ error: "Project not found." }, { status: 404 });
    }
    if (project.owner_user_id !== userId && !isSuperAdmin) {
      return NextResponse.json({ error: "You don't have access to this automation." }, { status: 403 });
    }
    due = [automation];
  } else {
    const { data: automations } = await supabase
      .from("report_automations")
      .select("id, project_id, period_type, day_of_week, day_of_month, time_utc, requires_approval, report_format")
      .eq("is_active", true);

    due = isTestRun
      ? (automations ?? [])
      : (automations ?? []).filter((a) => isAutomationDue(a, timeUtc, dayOfWeek, businessDayOfMonth));
  }

  const results: {
    created?: string[];
    sent?: string[];
    reminders?: string[];
    approvalEmailsRetried?: string[];
    errors?: string[];
  } = {};
  const errors: string[] = [];

  for (const automation of due) {
    let report: {
      id: string;
      period_type: string;
      period_start: string;
      period_end: string;
      harvest_data_snapshot?: unknown;
      report_format?: string | null;
    };
    const needsApproval = automationNeedsApproval(automation.requires_approval);
    const reportFormat =
      automation.report_format === "budget_allocation" ? "budget_allocation" : "standard";

    try {
      const { data: project } = await supabase
        .from("projects")
        .select("id, name, owner_user_id, client_emails")
        .eq("id", automation.project_id)
        .single();
      if (!project?.owner_user_id) continue;

      if (needsApproval) {
        try {
          report = await createReport(
            automation.project_id,
            project.owner_user_id,
            automation.period_type as "week" | "month",
            undefined,
            undefined,
            {
              status: "pending_approval",
              approvalRequestedAt: new Date().toISOString(),
              reportFormat,
            }
          );
        } catch (createErr) {
          const msg = createErr instanceof Error ? createErr.message : String(createErr);
          report = await createPlaceholderReport(
            automation.project_id,
            project.owner_user_id,
            automation.period_type as "week" | "month",
            msg,
            reportFormat
          );
          errors.push(`report placeholder (Harvest failed) ${automation.project_id}: ${msg}`);
        }
        const toEmails = await getApprovalRecipientEmails(supabase, project.owner_user_id);
        const sendErr = await sendReportApprovalRequest(
          project.owner_user_id,
          toEmails,
          project.name,
          automation.project_id,
          report.id
        );
        if (sendErr.error) errors.push(`approval email ${report.id}: ${sendErr.error}`);
        else {
          await markApprovalEmailSent(supabase, report.id);
          (results.created = results.created ?? []).push(report.id);
        }
        continue;
      }

      // Auto-send: email clients directly (no approval step).
      try {
        report = await createReport(
          automation.project_id,
          project.owner_user_id,
          automation.period_type as "week" | "month",
          undefined,
          undefined,
          { reportFormat }
        );
      } catch (createErr) {
        const msg = createErr instanceof Error ? createErr.message : String(createErr);
        report = await createPlaceholderReport(
          automation.project_id,
          project.owner_user_id,
          automation.period_type as "week" | "month",
          msg,
          reportFormat
        );
        errors.push(`auto-send failed (Harvest) ${automation.project_id}: ${msg}; owner notified to review`);
        const toEmails = await getApprovalRecipientEmails(supabase, project.owner_user_id);
        const sendErr = await sendReportApprovalRequest(
          project.owner_user_id,
          toEmails,
          project.name,
          automation.project_id,
          report.id
        );
        if (sendErr.error) errors.push(`approval email ${report.id}: ${sendErr.error}`);
        else {
          await markApprovalEmailSent(supabase, report.id);
          (results.created = results.created ?? []).push(report.id);
        }
        continue;
      }

      const sendResult = await sendProjectReportToClients(supabase, report, project);
      if (sendResult.error) {
        errors.push(`auto-send ${report.id}: ${sendResult.error}`);
        (results.created = results.created ?? []).push(report.id);
      } else {
        (results.sent = results.sent ?? []).push(report.id);
      }
    } catch (e) {
      errors.push(`create report ${automation.project_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const runReminders = !(isTestRun && requestedAutomationId);
  const now = new Date();
  const thirtySixHoursAgo = new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Retry approval emails when Gmail failed during the scheduled run (hourly until sent).
  const { data: needsApprovalEmail } = runReminders
    ? await supabase
        .from("reports")
        .select("id, project_id")
        .eq("status", "pending_approval")
        .not("approval_requested_at", "is", null)
        .is("approval_email_sent_at", null)
        .gte("approval_requested_at", thirtySixHoursAgo)
    : { data: [] as { id: string; project_id: string }[] };

  for (const report of needsApprovalEmail ?? []) {
    try {
      const { data: project } = await supabase
        .from("projects")
        .select("id, name, owner_user_id")
        .eq("id", report.project_id)
        .single();
      if (!project?.owner_user_id) continue;
      const toEmails = await getApprovalRecipientEmails(supabase, project.owner_user_id);
      const sendErr = await sendReportApprovalRequest(
        project.owner_user_id,
        toEmails,
        project.name,
        project.id,
        report.id
      );
      if (sendErr.error) errors.push(`approval email retry ${report.id}: ${sendErr.error}`);
      else {
        await markApprovalEmailSent(supabase, report.id);
        (results.approvalEmailsRetried = results.approvalEmailsRetried ?? []).push(report.id);
      }
    } catch (e) {
      errors.push(`approval email retry ${report.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const { data: needsReminder } = runReminders
    ? await supabase
        .from("reports")
        .select("id, project_id")
        .in("status", ["pending_approval", "rejected"])
        .not("approval_requested_at", "is", null)
        .lt("approval_requested_at", twentyFourHoursAgo)
        .is("reminder_sent_at", null)
    : { data: [] as { id: string; project_id: string }[] };

  for (const report of needsReminder ?? []) {
    try {
      const { data: project } = await supabase
        .from("projects")
        .select("id, name, owner_user_id")
        .eq("id", report.project_id)
        .single();
      if (!project?.owner_user_id) continue;
      const toEmails = await getApprovalRecipientEmails(supabase, project.owner_user_id);
      const sendErr = await sendReportReminder(
        project.owner_user_id,
        toEmails,
        project.name,
        report.project_id,
        report.id
      );
      if (sendErr.error) errors.push(`reminder ${report.id}: ${sendErr.error}`);
      else {
        await supabase.from("reports").update({ reminder_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", report.id);
        (results.reminders = results.reminders ?? []).push(report.id);
      }
    } catch (e) {
      errors.push(`reminder ${report.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (errors.length) {
    results.errors = errors;
    console.error("[cron/run-automations] errors:", errors);
  }
  if (isTestRun) (results as { testRun?: boolean }).testRun = true;
  if (due.length > 0 || (results.created?.length ?? 0) > 0 || (results.sent?.length ?? 0) > 0) {
    console.info("[cron/run-automations] completed:", {
      due: due.length,
      created: results.created?.length ?? 0,
      sent: results.sent?.length ?? 0,
      approvalEmailsRetried: results.approvalEmailsRetried?.length ?? 0,
      errors: errors.length,
    });
  }
  return NextResponse.json(results);
}
