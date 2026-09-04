import { issueKeyFromExternalReference } from "@/lib/budget-allocation-report";

export type TaskDetailEntry = {
  spent_date: string;
  hours: number;
  notes?: string | null;
  task?: { name?: string | null } | null;
  user?: { name?: string | null } | null;
  billable_rate?: number | null;
  hourly_rate?: number | null;
  external_reference?: { id?: string; permalink?: string } | null;
};

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function taskLabel(entry: TaskDetailEntry): string {
  const issue = issueKeyFromExternalReference(
    entry.external_reference?.id
      ? { id: entry.external_reference.id, permalink: entry.external_reference.permalink }
      : null
  );
  const notes = entry.notes?.trim();
  const taskName = entry.task?.name?.trim();
  if (issue && notes) return `${issue}: ${notes}`;
  if (issue) return issue;
  if (notes) return notes;
  return taskName || "—";
}

function rateForEntry(entry: TaskDetailEntry, fallbackRate: number | null): number | null {
  if (typeof entry.billable_rate === "number") return entry.billable_rate;
  if (typeof entry.hourly_rate === "number") return entry.hourly_rate;
  return fallbackRate;
}

/** Build a CSV buffer of task-level Harvest rows for email attachment. */
export function generateTaskDetailCsv(
  entries: TaskDetailEntry[],
  fallbackHourlyRate: number | null = null
): Buffer {
  const header = [
    "Date",
    "Task / Jira card",
    "Resource",
    "Hours",
    "Billable rate",
    "Cost",
    "External reference",
  ];
  const rows = entries.map((entry) => {
    const rate = rateForEntry(entry, fallbackHourlyRate);
    const cost = rate != null ? rate * entry.hours : null;
    return [
      entry.spent_date,
      taskLabel(entry),
      entry.user?.name?.trim() || "—",
      entry.hours.toFixed(2),
      rate != null ? rate.toFixed(2) : "",
      cost != null ? cost.toFixed(2) : "",
      entry.external_reference?.permalink || entry.external_reference?.id || "",
    ].map((cell) => csvEscape(String(cell)));
  });
  const csv = [header.join(","), ...rows.map((row) => row.join(","))].join("\r\n");
  return Buffer.from(`\uFEFF${csv}`, "utf8");
}

export function taskDetailFilename(projectName: string, periodStart: string, periodEnd: string): string {
  const slug = projectName.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "project";
  return `${slug}-task-details-${periodStart.slice(0, 10)}-to-${periodEnd.slice(0, 10)}.csv`;
}
