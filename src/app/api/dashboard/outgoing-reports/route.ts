import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const CENTRAL_TZ = "America/Chicago";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Calendar date (1–31) of the Nth business day (1st, 2nd, … weekday) in the given month, Central. */
function getCalendarDateOfNthBusinessDay(year: number, month: number, n: number): number {
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(Date.UTC(year, month - 1, d, 12, 0, 0));
    const w = new Intl.DateTimeFormat("en-US", { timeZone: CENTRAL_TZ, weekday: "short" }).format(date);
    if (w !== "Sat" && w !== "Sun") {
      count++;
      if (count === n) return d;
    }
  }
  return Math.min(28, daysInMonth);
}

/** Get next run in Central; return { sortKey, label } for display and sorting. Monthly = Nth business day. */
function getNextRunCentral(
  periodType: "week" | "month",
  dayOfWeek: number,
  businessDayOfMonth: number,
  timeUtc: string
): { sortKey: string; label: string } {
  const [h, m] = timeUtc.slice(0, 5).split(":").map(Number);
  const hour = Math.min(23, Math.max(0, h ?? 9));
  const minute = Math.min(59, Math.max(0, m ?? 0));

  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TZ,
    weekday: "short",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const currentDow = DAY_NAMES.indexOf(get("weekday"));
  const currentDay = parseInt(get("day"), 10) || 1;
  const currentMonth = parseInt(get("month"), 10) || 1;
  const currentYear = parseInt(get("year"), 10) || now.getFullYear();
  const currentHour = parseInt(get("hour"), 10) || 0;
  const currentMin = parseInt(get("minute"), 10) || 0;

  let y: number;
  let mo: number;
  let d: number;
  if (periodType === "month") {
    const n = Math.min(22, Math.max(1, businessDayOfMonth ?? 1));
    mo = currentMonth;
    y = currentYear;
    const runDate = getCalendarDateOfNthBusinessDay(y, mo, n);
    const monthPassed = runDate < currentDay || (runDate === currentDay && (currentHour > hour || (currentHour === hour && currentMin >= minute)));
    if (monthPassed) {
      mo += 1;
      if (mo > 12) {
        mo = 1;
        y += 1;
      }
    }
    d = getCalendarDateOfNthBusinessDay(y, mo, n);
  } else {
    const targetDow = dayOfWeek ?? 1;
    let daysAhead = (targetDow - currentDow + 7) % 7;
    if (daysAhead === 0 && (currentHour < hour || (currentHour === hour && currentMin < minute))) {
      // today but still ahead
    } else if (daysAhead === 0) {
      daysAhead = 7;
    }
    const nextDate = new Date(currentYear, currentMonth - 1, currentDay + daysAhead);
    y = nextDate.getFullYear();
    mo = nextDate.getMonth() + 1;
    d = nextDate.getDate();
  }

  const sortKey = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const dow = new Date(y, mo - 1, d).getDay();
  const timeStr = hour === 0 ? `12:${String(minute).padStart(2, "0")} AM` : hour < 12 ? `${hour}:${String(minute).padStart(2, "0")} AM` : hour === 12 ? `12:${String(minute).padStart(2, "0")} PM` : `${hour - 12}:${String(minute).padStart(2, "0")} PM`;
  const currentMs = new Date(currentYear, currentMonth - 1, currentDay).getTime();
  const nextMs = new Date(y, mo - 1, d).getTime();
  const diffDays = (nextMs - currentMs) / (24 * 60 * 60 * 1000);
  const label =
    diffDays > 7
      ? `${MONTH_NAMES[mo - 1]} ${d}${y !== currentYear ? `, ${y}` : ""} ${timeStr}`
      : `${DAY_NAMES[dow]} ${timeStr}`;
  return { sortKey, label };
}

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name")
    .eq("owner_user_id", userId);
  if (!projects?.length) {
    return NextResponse.json({ items: [] });
  }

  const projectIds = projects.map((p) => p.id);
  const projectNames = Object.fromEntries(projects.map((p) => [p.id, p.name]));

  const { data: automations } = await supabase
    .from("report_automations")
    .select("id, project_id, period_type, day_of_week, day_of_month, time_utc, title")
    .in("project_id", projectIds)
    .eq("is_active", true);

  const items: { projectName: string; label: string; nextRunLabel: string; sortKey: string; projectId: string }[] = [];

  for (const a of automations ?? []) {
    const { sortKey, label: nextRunLabel } = getNextRunCentral(
      a.period_type as "week" | "month",
      a.day_of_week ?? 1,
      a.day_of_month ?? 1,
      (a.time_utc ?? "09:00").slice(0, 5)
    );
    const projectName = projectNames[a.project_id] ?? "Project";
    const label = a.title?.trim() || (a.period_type === "month" ? "Monthly report" : "Weekly report");
    items.push({ projectName, label, nextRunLabel, sortKey, projectId: a.project_id });
  }

  items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return NextResponse.json({ items });
}
