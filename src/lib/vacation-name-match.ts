/** Parsed person name for matching Harvest resources to Google Calendar titles. */
export type ParsedPersonName = {
  firstKey: string;
  lastInitial: string | null;
};

/**
 * Person name from a Vacation/OOO calendar event title (e.g. "Brandon - OOO" → "Brandon").
 * Event title is only used to identify who is out, not whether it counts as vacation.
 */
export function calendarPersonNameFromEventSummary(summary: string): string {
  let s = summary.trim();
  if (!s) return "";
  const dashParts = s.split(/\s+[-–—]\s+/);
  if (dashParts.length > 1 && dashParts[0]?.trim()) {
    s = dashParts[0].trim();
  } else {
    s = s
      .replace(/[-–—]?\s*(ooo|pto|out\s*of\s*office|vacation|000)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  return s;
}

/** First name = all tokens except the last; single token = whole name. */
export function parsePersonName(full: string): ParsedPersonName {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstKey: "", lastInitial: null };
  if (parts.length === 1) {
    return { firstKey: parts[0].toLowerCase(), lastInitial: null };
  }
  const last = parts[parts.length - 1]!;
  return {
    firstKey: parts.slice(0, -1).join(" ").toLowerCase(),
    lastInitial: last[0]?.toLowerCase() ?? null,
  };
}

/**
 * Match a Google Calendar display name to a Harvest/resource full name.
 * Uses first name; if multiple people share the same first name, uses last initial.
 */
export function matchCalendarNameToResource(
  calendarName: string,
  resourceName: string,
  allCalendarNames: string[],
  allResourceNames: string[]
): boolean {
  const c = parsePersonName(calendarName);
  const r = parsePersonName(resourceName);
  if (!c.firstKey || c.firstKey !== r.firstKey) return false;

  const calSameFirst = allCalendarNames.filter(
    (n) => parsePersonName(n).firstKey === c.firstKey
  ).length;
  const resSameFirst = allResourceNames.filter(
    (n) => parsePersonName(n).firstKey === r.firstKey
  ).length;

  if (calSameFirst <= 1 && resSameFirst <= 1) return true;
  if (calSameFirst <= 1) return true;
  if (resSameFirst <= 1 && !c.lastInitial) return true;
  if (c.lastInitial && r.lastInitial) return c.lastInitial === r.lastInitial;
  return false;
}

/** First token(s) for user-facing copy, e.g. "Brandon" or "Maggie Anne". */
export function displayFirstName(resourceName: string): string {
  const parts = resourceName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? resourceName;
  return parts.slice(0, -1).join(" ");
}
