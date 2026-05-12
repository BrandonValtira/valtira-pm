/**
 * Report week aligned with Harvest: Sunday–Saturday (7 days).
 * "Today" is computed in America/Chicago so cron and manual creation agree.
 */

/** Current date in Central (America/Chicago) as YYYY-MM-DD for consistent week math. */
function getCentralDateString(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Last completed week (Sun–Sat, Harvest default) in Central. Same definition everywhere: approval, send, PDF. */
export function getHarvestWeekBounds(): { start: string; end: string } {
  const today = getCentralDateString();
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  const daysBackToLastSaturday = day === 0 ? 1 : day + 1;
  const lastSaturday = new Date(date);
  lastSaturday.setDate(date.getDate() - daysBackToLastSaturday);
  const lastSunday = new Date(lastSaturday);
  lastSunday.setDate(lastSaturday.getDate() - 6);
  return {
    start: lastSunday.toISOString().slice(0, 10),
    end: lastSaturday.toISOString().slice(0, 10),
  };
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format YYYY-MM-DD as "Feb 8, 2026" with no timezone (parse string only, never use Date for display). */
export function formatDateOnly(dateStr: string): string {
  const s = String(dateStr).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return s;
  const [, y, m, day] = match;
  const monthNum = parseInt(m, 10);
  const dayNum = parseInt(day, 10);
  if (monthNum < 1 || monthNum > 12) return s;
  const monthName = MONTH_NAMES[monthNum - 1];
  return `${monthName} ${dayNum}, ${y}`;
}
