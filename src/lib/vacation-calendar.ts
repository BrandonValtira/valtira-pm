import { matchCalendarNameToResource } from "@/lib/vacation-name-match";

type CalendarEvent = {
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

function eventDateRange(event: CalendarEvent): { start: string; end: string } | null {
  const startRaw = event.start?.date ?? event.start?.dateTime;
  if (!startRaw) return null;
  const start = startRaw.slice(0, 10);
  const endRaw = event.end?.date ?? event.end?.dateTime;
  let end = endRaw ? endRaw.slice(0, 10) : start;
  // All-day events use exclusive end date in Google Calendar API
  if (event.start?.date && event.end?.date && end > start) {
    const d = new Date(end + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    end = d.toISOString().slice(0, 10);
  }
  if (end < start) end = start;
  return { start, end };
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Sunday (YYYY-MM-DD) of the week containing dateStr. */
export function weekStartForDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Week starts (Sundays) between rangeStart and rangeEnd inclusive. */
export function enumerateWeekStarts(rangeStart: string, rangeEnd: string): string[] {
  const weeks: string[] = [];
  let ws = weekStartForDate(rangeStart);
  const endWs = weekStartForDate(rangeEnd);
  while (ws <= endWs) {
    weeks.push(ws);
    ws = addDays(ws, 7);
  }
  return weeks;
}

function isBusinessDay(dateStr: string): boolean {
  const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
  return dow >= 1 && dow <= 5;
}

/** Week starts where the event covers at least one Mon–Fri in that week. */
function weeksWithBusinessDayOverlap(
  eventStart: string,
  eventEnd: string,
  weekStarts: string[]
): string[] {
  return weekStarts.filter((ws) => {
    const we = addDays(ws, 6);
    if (!rangesOverlap(eventStart, eventEnd, ws, we)) return false;
    const overlapStart = eventStart > ws ? eventStart : ws;
    const overlapEnd = eventEnd < we ? eventEnd : we;
    let day = overlapStart;
    while (day <= overlapEnd) {
      if (isBusinessDay(day)) return true;
      day = addDays(day, 1);
    }
    return false;
  });
}

export type VacationWeeksResult = {
  weeksByResource: Record<string, string[]>;
  calendarNames: string[];
};

/**
 * Fetch the dedicated Vacation/OOO calendar. Any event on a business day flags that week
 * for the matched resource (event title is used only to identify the person).
 */
export async function fetchVacationWeeksByResource(
  accessToken: string,
  calendarId: string,
  rangeStart: string,
  rangeEnd: string,
  resourceNames: string[]
): Promise<VacationWeeksResult> {
  const weekStarts = enumerateWeekStarts(rangeStart, rangeEnd);
  const timeMin = new Date(rangeStart + "T00:00:00Z").toISOString();
  const timeMax = new Date(addDays(rangeEnd, 1) + "T00:00:00Z").toISOString();

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
  );
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("maxResults", "2500");
  url.searchParams.set("orderBy", "startTime");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar API error (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { items?: CalendarEvent[] };
  const items = data.items ?? [];

  const weeksByResource: Record<string, Set<string>> = {};
  for (const name of resourceNames) {
    weeksByResource[name] = new Set();
  }

  const uniqueResources = Array.from(
    new Set(resourceNames.map((n) => n.trim()).filter(Boolean))
  );

  type ParsedEvent = { calendarName: string; eventWeeks: string[] };
  const parsedEvents: ParsedEvent[] = [];
  const calendarNames = new Set<string>();

  for (const event of items) {
    const range = eventDateRange(event);
    if (!range) continue;
    const calendarName = (event.summary ?? "").trim();
    if (!calendarName) continue;
    calendarNames.add(calendarName);
    const eventWeeks = weeksWithBusinessDayOverlap(range.start, range.end, weekStarts);
    if (eventWeeks.length === 0) continue;
    parsedEvents.push({ calendarName, eventWeeks });
  }

  const allCalNames = Array.from(calendarNames);

  for (const { calendarName, eventWeeks } of parsedEvents) {
    for (const resourceName of uniqueResources) {
      if (
        !matchCalendarNameToResource(
          calendarName,
          resourceName,
          allCalNames,
          uniqueResources
        )
      ) {
        continue;
      }
      for (const w of eventWeeks) {
        weeksByResource[resourceName]?.add(w);
      }
    }
  }

  const out: Record<string, string[]> = {};
  for (const [name, set] of Object.entries(weeksByResource)) {
    out[name] = Array.from(set).sort();
  }
  return { weeksByResource: out, calendarNames: Array.from(calendarNames) };
}

/** Resolve calendar ID from env (raw ID or email). */
export function getVacationCalendarId(): string | null {
  const id = process.env.GOOGLE_VACATION_CALENDAR_ID?.trim();
  return id || null;
}
