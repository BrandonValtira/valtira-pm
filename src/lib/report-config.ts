import {
  REPORT_FORMAT_BUDGET_ALLOCATION,
  REPORT_FORMAT_STANDARD,
  type ReportFormat,
} from "@/lib/report-formats";

export type ReportPeriodType = "week" | "biweek" | "month";

export type ReportComponentId =
  | "taskDetail"
  | "projectSummary"
  | "financialSummary"
  | "additionalInfo"
  | "footer";

export type ReportComponents = Record<ReportComponentId, boolean>;

export type ReportConfig = {
  schemaVersion: number;
  components: ReportComponents;
  additionalInfoText: string;
  footerName: string;
  footerTitle: string;
};

/** Reports saved without this version were created before the current email/report format. */
export const CURRENT_REPORT_SCHEMA_VERSION = 1;

export const LEGACY_REPORT_SEND_ERROR =
  "This report was created before a recent app update and can no longer be sent. Delete it and generate a new report.";

export const ALWAYS_ON_SECTIONS = [
  {
    id: "projectIdentification",
    label: "Project identification",
    description: "Project name and client.",
  },
  {
    id: "reportingPeriod",
    label: "Reporting period",
    description: "The week, two-week, or month covered by this report.",
  },
  {
    id: "budgetConsumption",
    label: "Budget consumption",
    description: "Hours used vs budgeted, with variance for the period and contract.",
  },
  {
    id: "budgetRemaining",
    label: "Budget remaining",
    description: "Hours still available on the project.",
  },
] as const;

export const OPTIONAL_COMPONENTS: {
  id: ReportComponentId;
  label: string;
  description: string;
}[] = [
  {
    id: "taskDetail",
    label: "Task details",
    description: "Line-item work log sent as a spreadsheet attachment (not in the email body).",
  },
  {
    id: "projectSummary",
    label: "Hours by project",
    description:
      "Gemini summary of hours by ticket project (e.g. LBD 93% — project management and QA), the same section as the old budget allocation report.",
  },
  {
    id: "financialSummary",
    label: "Financial summary",
    description: "Period totals for hours and estimated cost.",
  },
  {
    id: "additionalInfo",
    label: "Additional information",
    description: "PM notes or risks. Selecting this requires approval before the report can send.",
  },
  {
    id: "footer",
    label: "Footer",
    description: "Your name and title at the bottom of the report.",
  },
];

export const PERIOD_TYPE_OPTIONS: { value: ReportPeriodType; label: string }[] = [
  { value: "week", label: "Weekly" },
  { value: "biweek", label: "Bi-weekly" },
  { value: "month", label: "Monthly" },
];

const DEFAULT_COMPONENTS: ReportComponents = {
  taskDetail: false,
  projectSummary: false,
  financialSummary: false,
  additionalInfo: false,
  footer: false,
};

export function defaultReportComponents(): ReportComponents {
  return { ...DEFAULT_COMPONENTS };
}

export function defaultReportConfig(): ReportConfig {
  return {
    schemaVersion: CURRENT_REPORT_SCHEMA_VERSION,
    components: defaultReportComponents(),
    additionalInfoText: "",
    footerName: "",
    footerTitle: "",
  };
}

export function stampReportConfig(config: ReportConfig): ReportConfig {
  return { ...config, schemaVersion: CURRENT_REPORT_SCHEMA_VERSION };
}

export function isLegacyReport(reportConfig: unknown): boolean {
  if (!reportConfig || typeof reportConfig !== "object" || Array.isArray(reportConfig)) return true;
  return (reportConfig as { schemaVersion?: unknown }).schemaVersion !== CURRENT_REPORT_SCHEMA_VERSION;
}

/** Already-sent reports stay valid. Only unsent reports from before the update are blocked. */
export function isOutdatedOutgoingReport(
  reportConfig: unknown,
  status: string | null | undefined
): boolean {
  if (status === "sent") return false;
  return isLegacyReport(reportConfig);
}

export function isOutdatedAutomation(reportConfig: unknown): boolean {
  return isLegacyReport(reportConfig);
}

export function normalizePeriodType(value: unknown): ReportPeriodType {
  if (value === "month" || value === "biweek" || value === "week") return value;
  return "week";
}

export function periodTypeLabel(periodType: string | null | undefined): string {
  if (periodType === "month") return "Monthly";
  if (periodType === "biweek") return "Bi-weekly";
  return "Weekly";
}

export function budgetReportLabel(periodType: string | null | undefined): string {
  if (periodType === "month") return "Monthly Budget Report";
  if (periodType === "biweek") return "Biweekly Budget Report";
  return "Weekly Budget Report";
}

/** Client · project, without repeating the client name in the Harvest project title. */
export function formatReportTitleLine(
  clientLabel: string | null | undefined,
  projectLabel: string | null | undefined
): string {
  const client = clientLabel?.trim() ?? "";
  const project = projectLabel?.trim() ?? "";
  if (!client) return project;
  if (!project) return client;
  const rest = project.toLowerCase().startsWith(client.toLowerCase())
    ? project.slice(client.length).replace(/^[\s\-–—:·.,]+/, "").trim()
    : project;
  return rest ? `${client} · ${rest}` : client;
}

export function periodNoun(periodType: string | null | undefined): string {
  if (periodType === "month") return "month";
  if (periodType === "biweek") return "two weeks";
  return "week";
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function componentsFromLegacyFormat(format: ReportFormat | string | null | undefined): ReportComponents {
  if (format === REPORT_FORMAT_BUDGET_ALLOCATION) {
    return {
      taskDetail: true,
      projectSummary: true,
      financialSummary: true,
      additionalInfo: false,
      footer: false,
    };
  }
  return {
    taskDetail: true,
    projectSummary: false,
    financialSummary: false,
    additionalInfo: false,
    footer: false,
  };
}

export function normalizeReportConfig(
  value: unknown,
  legacyFormat?: ReportFormat | string | null
): ReportConfig {
  const fallback = componentsFromLegacyFormat(legacyFormat);
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const rawComponents =
    raw.components && typeof raw.components === "object" && !Array.isArray(raw.components)
      ? (raw.components as Record<string, unknown>)
      : raw;
  const hasExplicitComponents =
    "taskDetail" in rawComponents ||
    "projectSummary" in rawComponents ||
    "hoursByProject" in rawComponents ||
    "financialSummary" in rawComponents ||
    "additionalInfo" in rawComponents ||
    "footer" in rawComponents;

  const source = hasExplicitComponents ? rawComponents : fallback;

  const schemaVersion =
    raw.schemaVersion === CURRENT_REPORT_SCHEMA_VERSION ? CURRENT_REPORT_SCHEMA_VERSION : 0;

  return {
    schemaVersion,
    components: {
      taskDetail: asBoolean(source.taskDetail, fallback.taskDetail),
      projectSummary: asBoolean(
        source.projectSummary ?? (source as Record<string, unknown>).hoursByProject,
        fallback.projectSummary
      ),
      financialSummary: asBoolean(source.financialSummary, fallback.financialSummary),
      additionalInfo: asBoolean(source.additionalInfo, fallback.additionalInfo),
      footer: asBoolean(source.footer, fallback.footer),
    },
    additionalInfoText: asString(raw.additionalInfoText).slice(0, 4000),
    footerName: asString(raw.footerName).slice(0, 120),
    footerTitle: asString(raw.footerTitle).slice(0, 120),
  };
}

export function parseReportConfigInput(value: unknown): ReportConfig {
  return stampReportConfig(normalizeReportConfig(value, REPORT_FORMAT_STANDARD));
}

export function reportFormatFromConfig(config: ReportConfig): ReportFormat {
  return config.components.projectSummary
    ? REPORT_FORMAT_BUDGET_ALLOCATION
    : REPORT_FORMAT_STANDARD;
}

export function configRequiresApproval(config: ReportConfig): boolean {
  return config.components.additionalInfo;
}

export function summarizeReportComponents(config: ReportConfig): string {
  const selected = OPTIONAL_COMPONENTS.filter((c) => config.components[c.id]).map((c) => c.label);
  return selected.length > 0 ? selected.join(", ") : "Basics only";
}
