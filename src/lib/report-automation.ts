import type { createAdminClient } from "@/lib/supabase/admin";
import type { ReportPeriodType } from "@/lib/report-config";
import { getHarvestBiweekBounds, getHarvestWeekBounds } from "@/lib/report-week";

const REMINDER_MIN_HOURS_AFTER_REQUEST = 24;
const REMINDER_MIN_HOURS_BETWEEN = 72;
export const MAX_REMINDERS_PER_WEEK = 2;

const APPROVAL_RETRY_MIN_HOURS = 12;
export const MAX_APPROVAL_EMAIL_ATTEMPTS = 3;

function getLastMonthBounds(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) };
}

export function resolveReportPeriodBounds(
  periodType: ReportPeriodType | string,
  periodStart?: string,
  periodEnd?: string
): { start: string; end: string } {
  if (periodStart && periodEnd) {
    return { start: periodStart.slice(0, 10), end: periodEnd.slice(0, 10) };
  }
  if (periodType === "month") return getLastMonthBounds();
  if (periodType === "biweek") return getHarvestBiweekBounds();
  return getHarvestWeekBounds();
}

/** Even weeks since the automation was created (Central Monday-start week). */
export function isBiweekSendWeek(createdAt: string, now = new Date()): boolean {
  const createdWeek = getCentralWeekStartKey(new Date(createdAt));
  const currentWeek = getCentralWeekStartKey(now);
  const created = new Date(`${createdWeek}T12:00:00`);
  const current = new Date(`${currentWeek}T12:00:00`);
  const weeks = Math.round((current.getTime() - created.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return weeks >= 0 && weeks % 2 === 0;
}

/** Monday-start calendar week in America/Chicago, as YYYY-MM-DD. */
export function getCentralWeekStartKey(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "01";
  const y = parseInt(get("year"), 10);
  const m = parseInt(get("month"), 10);
  const d = parseInt(get("day"), 10);
  const local = new Date(y, m - 1, d);
  const weekday = local.getDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  local.setDate(local.getDate() - daysFromMonday);
  return local.toISOString().slice(0, 10);
}

export async function findExistingReportForPeriod(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
  periodType: string,
  start: string,
  end: string
): Promise<string | null> {
  const { data } = await supabase
    .from("reports")
    .select("id")
    .eq("project_id", projectId)
    .eq("period_type", periodType)
    .eq("period_start", start)
    .eq("period_end", end)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

type ReminderCandidate = {
  approval_requested_at: string;
  reminder_sent_at: string | null;
  reminder_count: number | null;
  reminder_week: string | null;
};

export function canSendReportReminder(report: ReminderCandidate, now = new Date()): boolean {
  const requestedAt = new Date(report.approval_requested_at).getTime();
  if (now.getTime() - requestedAt < REMINDER_MIN_HOURS_AFTER_REQUEST * 60 * 60 * 1000) {
    return false;
  }

  const weekKey = getCentralWeekStartKey(now);
  const countThisWeek =
    report.reminder_week === weekKey ? (report.reminder_count ?? 0) : 0;
  if (countThisWeek >= MAX_REMINDERS_PER_WEEK) return false;

  if (report.reminder_sent_at) {
    const lastSent = new Date(report.reminder_sent_at).getTime();
    if (now.getTime() - lastSent < REMINDER_MIN_HOURS_BETWEEN * 60 * 60 * 1000) {
      return false;
    }
  }

  return true;
}

type ApprovalRetryCandidate = {
  approval_requested_at: string;
  approval_email_sent_at: string | null;
  approval_email_attempts: number | null;
  approval_email_last_attempt_at: string | null;
};

export function canRetryApprovalEmail(report: ApprovalRetryCandidate, now = new Date()): boolean {
  if (report.approval_email_sent_at) return false;
  const attempts = report.approval_email_attempts ?? 0;
  if (attempts >= MAX_APPROVAL_EMAIL_ATTEMPTS) return false;

  const requestedAt = new Date(report.approval_requested_at).getTime();
  const ageHours = (now.getTime() - requestedAt) / (60 * 60 * 1000);
  if (ageHours > 48) return false;

  if (report.approval_email_last_attempt_at) {
    const lastAttempt = new Date(report.approval_email_last_attempt_at).getTime();
    if (now.getTime() - lastAttempt < APPROVAL_RETRY_MIN_HOURS * 60 * 60 * 1000) {
      return false;
    }
  }

  return true;
}
