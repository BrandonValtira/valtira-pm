import type { HarvestTimeEntry } from "@/lib/harvest";
import { generateBudgetAllocationSummaries } from "@/lib/gemini/budget-allocation-summaries";

export type BudgetAllocationTimeEntry = {
  id: number;
  project: { id: number; name: string };
  task: { id: number; name: string };
  user: { id: number; name: string };
  spent_date: string;
  hours: number;
  notes: string | null;
  billable_rate?: number | null;
  hourly_rate?: number | null;
  external_reference?: { id: string; permalink?: string } | null;
  project_code?: string | null;
};

export type BudgetAllocationSegment = {
  /** Project code from notes (e.g. ESB, RSTR), or __unassigned__ */
  key: string;
  /** @deprecated Legacy snapshots used jiraKey or Harvest task ids */
  jiraKey?: string;
  displayName: string;
  hours: number;
  percent: number;
  /** Integer percent for display; all segments sum to 100 */
  percentDisplay?: number;
  summary: string;
  entries: BudgetAllocationTimeEntry[];
};

export type BudgetAllocationData = {
  totalHours: number;
  segments: BudgetAllocationSegment[];
};

const UNASSIGNED_KEY = "__unassigned__";

/** Issue key pattern in Harvest notes, e.g. ESB-294, RSTR-12, LBD-1 */
const ISSUE_KEY_IN_TEXT = /\b([A-Za-z][A-Za-z0-9]+)-(\d+)\b/;

export function projectCodeFromIssueKey(issueKey: string): string {
  const idx = issueKey.lastIndexOf("-");
  if (idx > 0) return issueKey.slice(0, idx).toUpperCase();
  return issueKey.toUpperCase();
}

export function issueKeyFromExternalReference(
  ref?: { id: string; permalink?: string } | null
): string | null {
  if (!ref) return null;
  const fromPermalink =
    ref.permalink?.match(/\/browse\/([A-Za-z][A-Za-z0-9]+-\d+)/)?.[1] ??
    ref.permalink?.match(/\/issues\/([A-Za-z][A-Za-z0-9]+-\d+)/)?.[1];
  if (fromPermalink) return fromPermalink.toUpperCase();
  if (/^[A-Za-z][A-Za-z0-9]+-\d+$/.test(ref.id)) return ref.id.toUpperCase();
  return null;
}

/** Parse project code (prefix before issue number) from free text such as Harvest notes. */
export function projectCodeFromText(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  const match = text.match(ISSUE_KEY_IN_TEXT);
  if (!match) return null;
  return match[1].toUpperCase();
}

/** Attribute a time entry to a ticket project code found in notes or external reference. */
export function attributeEntryToProjectCode(entry: BudgetAllocationTimeEntry): string {
  const fromNotes = projectCodeFromText(entry.notes);
  if (fromNotes) return fromNotes;

  const issueKey = issueKeyFromExternalReference(entry.external_reference);
  if (issueKey) return projectCodeFromIssueKey(issueKey);

  return UNASSIGNED_KEY;
}

function fallbackSummary(segment: { displayName: string; entries: BudgetAllocationTimeEntry[] }): string {
  const notes = segment.entries
    .map((e) => e.notes?.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (notes.length === 0) {
    return `${segment.displayName}: ${segment.entries.length} time ${segment.entries.length === 1 ? "entry" : "entries"} logged this period.`;
  }
  const preview = notes.join("; ").slice(0, 180);
  return preview.length < notes.join("; ").length ? `${preview}…` : preview;
}

export function segmentKey(seg: BudgetAllocationSegment): string {
  return seg.key ?? seg.jiraKey ?? UNASSIGNED_KEY;
}

/** Integer percentages that sum to exactly 100 (largest-remainder method). */
export function integerPercentsSummingTo100(hoursList: number[], totalHours: number): number[] {
  if (totalHours <= 0 || hoursList.length === 0) return hoursList.map(() => 0);
  const exact = hoursList.map((h) => (h / totalHours) * 100);
  const floored = exact.map((p) => Math.floor(p));
  const remainder = 100 - floored.reduce((sum, p) => sum + p, 0);
  const byFraction = exact
    .map((p, i) => ({ i, frac: p - floored[i] }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floored];
  for (let j = 0; j < remainder; j++) {
    result[byFraction[j % byFraction.length].i]++;
  }
  return result;
}

export function displayPercentsForSegments(
  segments: Pick<BudgetAllocationSegment, "hours" | "percentDisplay">[],
  totalHours: number
): number[] {
  if (
    segments.length > 0 &&
    segments.every((s) => typeof s.percentDisplay === "number")
  ) {
    return segments.map((s) => s.percentDisplay as number);
  }
  return integerPercentsSummingTo100(
    segments.map((s) => s.hours),
    totalHours
  );
}

export function segmentDisplayPercent(
  segment: Pick<BudgetAllocationSegment, "hours" | "percent" | "percentDisplay">,
  segments: Pick<BudgetAllocationSegment, "hours" | "percentDisplay">[],
  totalHours: number,
  index: number
): number {
  return displayPercentsForSegments(segments, totalHours)[index] ?? Math.round(segment.percent);
}

export async function buildBudgetAllocationData(
  entries: BudgetAllocationTimeEntry[],
  periodLabel: string
): Promise<BudgetAllocationData> {
  const grouped = new Map<string, BudgetAllocationTimeEntry[]>();

  for (const entry of entries) {
    const key = attributeEntryToProjectCode(entry);
    entry.project_code = key === UNASSIGNED_KEY ? null : key;
    const list = grouped.get(key) ?? [];
    list.push(entry);
    grouped.set(key, list);
  }

  const totalHours = entries.reduce((s, e) => s + e.hours, 0);
  const segments: BudgetAllocationSegment[] = [];

  for (const [key, list] of Array.from(grouped.entries())) {
    if (list.length === 0) continue;
    const hours = list.reduce((s, e) => s + e.hours, 0);
    const displayName = key === UNASSIGNED_KEY ? "Other / unassigned" : key;
    segments.push({
      key,
      displayName,
      hours,
      percent: totalHours > 0 ? (hours / totalHours) * 100 : 0,
      summary: "",
      entries: list.sort((a, b) => a.spent_date.localeCompare(b.spent_date)),
    });
  }

  segments.sort((a, b) => b.hours - a.hours);

  const displayPercents = integerPercentsSummingTo100(
    segments.map((s) => s.hours),
    totalHours
  );
  segments.forEach((segment, index) => {
    segment.percentDisplay = displayPercents[index];
  });

  const summaries = await generateBudgetAllocationSummaries(
    segments.map((s) => ({
      displayName: s.displayName,
      hours: s.hours,
      percent: s.percentDisplay ?? s.percent,
      notes: s.entries.map((e) => e.notes?.trim()).filter(Boolean) as string[],
    })),
    periodLabel
  );

  for (const segment of segments) {
    segment.summary =
      summaries[segment.displayName] ??
      summaries[segment.key] ??
      fallbackSummary(segment);
  }

  return { totalHours, segments };
}

export function mapHarvestEntriesForBudgetAllocation(
  entries: HarvestTimeEntry[]
): BudgetAllocationTimeEntry[] {
  return entries.map((e) => ({
    id: e.id,
    project: e.project,
    task: e.task,
    user: e.user,
    spent_date: e.spent_date,
    hours: e.hours,
    notes: e.notes,
    billable_rate: e.billable_rate ?? null,
    hourly_rate: e.hourly_rate ?? null,
    external_reference: e.external_reference
      ? { id: e.external_reference.id, permalink: e.external_reference.permalink }
      : null,
  }));
}
