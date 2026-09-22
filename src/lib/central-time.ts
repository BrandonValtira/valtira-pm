const CENTRAL_TZ = "America/Chicago";
const DAY_NAMES: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** 24-hour Central clock. hour12:false can still emit 1–12 on some Node/ICU builds. */
export function getCentralDateTime(now = new Date()): {
  timeHm: string;
  hour: number;
  minute: number;
  dayOfWeek: number;
  dayOfMonth: number;
  businessDayOfMonth: number;
  year: number;
  month: number;
  day: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TZ,
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "0";
  const hour = Math.min(23, Math.max(0, parseInt(get("hour"), 10) || 0));
  const minute = Math.min(59, Math.max(0, parseInt(get("minute"), 10) || 0));
  const year = parseInt(get("year"), 10) || now.getFullYear();
  const month = parseInt(get("month"), 10) || 1;
  const day = parseInt(get("day"), 10) || 1;
  return {
    timeHm: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
    hour,
    minute,
    dayOfWeek: DAY_NAMES[get("weekday")] ?? 0,
    dayOfMonth: Math.min(28, day),
    businessDayOfMonth: getBusinessDayOfMonthInCentral(year, month, day),
    year,
    month,
    day,
  };
}

/** Count weekdays (1–5) from the 1st through the given day in Central. */
export function getBusinessDayOfMonthInCentral(year: number, month: number, day: number): number {
  let count = 0;
  for (let d = 1; d <= day; d++) {
    const date = new Date(Date.UTC(year, month - 1, d, 12, 0, 0));
    const w = new Intl.DateTimeFormat("en-US", { timeZone: CENTRAL_TZ, weekday: "short" }).format(date);
    if (w !== "Sat" && w !== "Sun") count++;
  }
  return count;
}
