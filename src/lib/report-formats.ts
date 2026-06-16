export const REPORT_FORMAT_STANDARD = "standard" as const;
export const REPORT_FORMAT_BUDGET_ALLOCATION = "budget_allocation" as const;

export type ReportFormat = typeof REPORT_FORMAT_STANDARD | typeof REPORT_FORMAT_BUDGET_ALLOCATION;

export const REPORT_FORMAT_OPTIONS: {
  value: ReportFormat;
  label: string;
  description: string;
}[] = [
  {
    value: REPORT_FORMAT_STANDARD,
    label: "Standard Report",
    description: "Budget summary and a single tasks table for the period.",
  },
  {
    value: REPORT_FORMAT_BUDGET_ALLOCATION,
    label: "Budget Allocation Report",
    description:
      "Percentage of hours per ticket project (from notes, e.g. ESB-294 → ESB), a one-line summary for each, then a tasks table per project.",
  },
];

export function normalizeReportFormat(value: unknown): ReportFormat {
  return value === REPORT_FORMAT_BUDGET_ALLOCATION
    ? REPORT_FORMAT_BUDGET_ALLOCATION
    : REPORT_FORMAT_STANDARD;
}

export function reportFormatLabel(format: ReportFormat | string | null | undefined): string {
  const opt = REPORT_FORMAT_OPTIONS.find((o) => o.value === format);
  return opt?.label ?? "Standard Report";
}
