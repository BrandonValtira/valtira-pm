"use client";

import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useState, useEffect, type RefObject } from "react";
import { PeriodTypeFields, ReportConfigFields } from "@/components/report-config-fields";
import { ValtiraLogo } from "@/components/valtira-logo";
import type { BudgetAllocationData } from "@/lib/budget-allocation-report";
import { segmentDisplayPercent, segmentKey } from "@/lib/budget-allocation-report";
import {
  buildBudgetBurnDisplay,
  type BudgetBurnSnapshot,
} from "@/lib/budget-burn-chart";
import {
  budgetReportLabel,
  defaultReportConfig,
  formatReportTitleLine,
  isLegacyReport,
  normalizePeriodType,
  normalizeReportConfig,
  periodTypeLabel,
  summarizeReportComponents,
  type ReportConfig,
  type ReportPeriodType,
} from "@/lib/report-config";
import { formatDateOnly } from "@/lib/report-week";

type TimeEntry = {
  id: number;
  project: { id: number; name: string };
  task: { id: number; name: string };
  user: { id: number; name: string };
  spent_date: string;
  hours: number;
  notes: string | null;
  external_reference?: { id: string; permalink?: string } | null;
};

type HarvestProjectSnapshot = {
  id: number;
  name: string;
  client_name?: string | null;
  budget: number | null;
  cost_budget: number | null;
  hourly_rate: number | null;
  budget_by?: string | null;
  /** From Harvest Project Budget Report: total hours consumed (all-time) */
  budget_spent?: number | null;
  /** From Harvest Project Budget Report: hours left in budget */
  budget_remaining?: number | null;
};

type Report = {
  id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  status: string;
  created_at: string;
  approved_at?: string | null;
  report_format?: string | null;
  report_config?: unknown;
  harvest_data_snapshot?: {
    reportFormat?: string;
    timeEntries?: TimeEntry[];
    harvestProjectNames?: string[];
    harvestProjects?: HarvestProjectSnapshot[];
    budgetAllocation?: BudgetAllocationData;
    budgetBurn?: BudgetBurnSnapshot | null;
    _placeholder?: boolean;
    _error?: string;
  } | null;
};

type Automation = {
  id: string;
  period_type: string;
  day_of_week: number | null;
  day_of_month: number | null;
  time_utc: string;
  is_active: boolean;
  title?: string | null;
  requires_approval?: boolean;
  report_format?: string | null;
  report_config?: unknown;
  created_at: string;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function firstName(fullName: string): string {
  const part = fullName.trim().split(/\s+/)[0];
  return part ?? fullName;
}

function TimeEntriesTable({ entries }: { entries: TimeEntry[] }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="min-w-full text-sm text-neutral-900">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-800">
            <th className="pb-2 pr-3">Date</th>
            <th className="pb-2 pr-3">Notes from Harvest</th>
            <th className="pb-2 pr-3 text-right">Hours</th>
            <th className="pb-2 pr-3">Resource</th>
            <th className="pb-2">Jira / Reference</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-neutral-100">
              <td className="py-2 pr-3">{e.spent_date}</td>
              <td className="max-w-[200px] truncate py-2 pr-3" title={e.notes ?? ""}>
                {e.notes || "—"}
              </td>
              <td className="py-2 pr-3 text-right">{e.hours.toFixed(1)}</td>
              <td className="py-2 pr-3">{firstName(e.user.name)}</td>
              <td className="py-2">
                {e.external_reference?.permalink ? (
                  <a
                    href={e.external_reference.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    View
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WarningGlyph() {
  return (
    <svg className="h-5 w-5 shrink-0 text-amber-700" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6.5zm0 8a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function LegacyReportWarning() {
  return (
    <div
      role="alert"
      className="mt-4 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
    >
      <WarningGlyph />
      <div>
        <p className="font-semibold">This report is outdated</p>
        <p className="mt-1 text-amber-900">
          Due to a recent app update, existing reports can no longer be sent. Delete this report and generate a new one.
        </p>
      </div>
    </div>
  );
}

/** Format YYYY-MM-DD for display without timezone shift (matches PDF/email). */
function formatReportDate(d: string) {
  return formatDateOnly(d);
}

const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatMonthRange(start: string, end: string) {
  const startStr = String(start).slice(0, 10);
  const endStr = String(end).slice(0, 10);
  const [y1, m1] = startStr.split("-").map(Number);
  const [y2, m2] = endStr.split("-").map(Number);
  if (y1 === y2 && m1 === m2 && m1 >= 1 && m1 <= 12) {
    return `${LONG_MONTHS[m1 - 1]} ${y1}`;
  }
  return `${formatDateOnly(startStr)} – ${formatDateOnly(endStr)}`;
}

/** Format HH:MM (24h) as "9:00 AM" (Central time display) */
function formatTimeCentral(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const hour = Math.min(23, Math.max(0, isNaN(h) ? 9 : h));
  const min = Math.min(59, Math.max(0, isNaN(m) ? 0 : m));
  if (hour === 0) return `12:${min.toString().padStart(2, "0")} AM`;
  if (hour < 12) return `${hour}:${min.toString().padStart(2, "0")} AM`;
  if (hour === 12) return `12:${min.toString().padStart(2, "0")} PM`;
  return `${hour - 12}:${min.toString().padStart(2, "0")} PM`;
}

function ordinal(n: number): string {
  const s = n.toString();
  if (s.endsWith("11") || s.endsWith("12") || s.endsWith("13")) return `${n}th`;
  if (s.endsWith("1")) return `${n}st`;
  if (s.endsWith("2")) return `${n}nd`;
  if (s.endsWith("3")) return `${n}rd`;
  return `${n}th`;
}

function formatSchedule(a: Automation): string {
  const timeStr = formatTimeCentral(a.time_utc) + " CT";
  if (a.period_type === "month") {
    const n = a.day_of_month ?? 1;
    return `${ordinal(n)} business day of month at ${timeStr}`;
  }
  const day = a.day_of_week ?? 1;
  if (a.period_type === "biweek") return `Every other ${DAYS[day]} at ${timeStr}`;
  return `${DAYS[day]}s at ${timeStr}`;
}

function varianceClassName(v: { emailColor: string }): string {
  if (v.emailColor === "#b91c1c") return "font-medium text-red-600";
  if (v.emailColor === "#15803d") return "font-medium text-green-700";
  return "text-neutral-600";
}

function BudgetBurnOverview({
  report,
  snapshot,
  periodHours,
}: {
  report: Report;
  snapshot: NonNullable<Report["harvest_data_snapshot"]>;
  periodHours: number;
}) {
  const display = buildBudgetBurnDisplay({
    budgetBurn: snapshot.budgetBurn,
    harvestProjects: snapshot.harvestProjects ?? [],
    harvestProjectNames: snapshot.harvestProjectNames ?? [],
    periodType: report.period_type === "month" ? "month" : "week",
    periodEnd: report.period_end,
    periodHours,
  });

  if (!display) {
    return (
      <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
        No hour budget set in Harvest for this project. Add a budget in Harvest to see utilization tracking.
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <h4 className="text-sm font-semibold text-neutral-900">Budget consumption</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-neutral-200 bg-white p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            {display.periodLabel}
          </p>
          <p className="mt-1 text-sm text-neutral-900">
            <span className="font-bold">{display.periodActual.toFixed(1)}h</span> utilized ·{" "}
            <span className="font-medium">{display.periodBudget.toFixed(1)}h</span> budgeted
          </p>
          <p className={`mt-0.5 text-xs ${varianceClassName(display.periodVariance)}`}>
            {display.periodVariance.label}
          </p>
        </div>
        <div className="rounded-md border border-neutral-200 bg-white p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            {display.contractDateLabel}
          </p>
          <p className="mt-1 text-sm text-neutral-900">
            <span className="font-bold">{display.spentToDate.toFixed(1)}h</span> utilized ·{" "}
            <span className="font-medium">{display.totalBudget.toFixed(1)}h</span> total budget
          </p>
          <p className={`mt-0.5 text-xs ${varianceClassName(display.contractVariance)}`}>
            {display.contractVariance.label}
          </p>
          <p className="mt-0.5 text-xs text-neutral-600">
            Expected utilization: ~{display.monthlyBudget.toFixed(1)}h/mo · ~{display.weeklyBudget.toFixed(1)}h/wk
          </p>
        </div>
      </div>
    </div>
  );
}

/** Budget Allocation report: % breakdown by ticket project + per-project task tables */
/** Single report content block (used in list and in modal) */
function ReportContent({ report }: { report: Report }) {
  const snapshot = report.harvest_data_snapshot;
  const config = normalizeReportConfig(report.report_config, report.report_format);
  const isPlaceholder = !!(snapshot && "_placeholder" in snapshot && snapshot._placeholder);
  const placeholderError = isPlaceholder && snapshot && "_error" in snapshot ? String(snapshot._error) : "";
  const entries = snapshot?.timeEntries ?? [];
  const allocation = snapshot?.budgetAllocation;
  const segments = allocation?.segments ?? [];
  const totalHours = allocation?.totalHours ?? entries.reduce((s, e) => s + e.hours, 0);
  const projectNames = snapshot?.harvestProjectNames ?? [];
  const harvestProjects = snapshot?.harvestProjects ?? [];
  const totalBudgetHours = harvestProjects.reduce((s, p) => s + (p.budget ?? 0), 0) || null;
  const totalCostBudget = harvestProjects.reduce((s, p) => s + (p.cost_budget ?? 0), 0) || null;
  const totalBudgetSpent = harvestProjects.reduce((s, p) => s + (p.budget_spent ?? 0), 0);
  const totalBudgetRemaining = harvestProjects.reduce((s, p) => s + (p.budget_remaining ?? 0), 0);
  const hasHarvestBudgetReport = harvestProjects.some((p) => p.budget_spent != null || p.budget_remaining != null);
  const avgRate =
    harvestProjects.length > 0
      ? harvestProjects.reduce((s, p) => s + (p.hourly_rate ?? 0), 0) / harvestProjects.length
      : 0;
  const spentFundsEstimate = avgRate * totalHours;
  const clientNames = Array.from(new Set(harvestProjects.map((p) => p.client_name).filter(Boolean))) as string[];
  const clientLabel = clientNames.length > 0 ? clientNames.join(", ") : null;
  const projectLabel = projectNames.length > 0 ? projectNames.join(", ") : "Harvest project";
  const titleLine = formatReportTitleLine(clientLabel, projectLabel);
  const reportKind = budgetReportLabel(report.period_type);
  const dateRange = `${formatReportDate(report.period_start)} – ${formatReportDate(report.period_end)}`;

  const legacy = isLegacyReport(report.report_config);

  return (
    <div className="rounded-xl border border-[#E8E2DA] bg-[#F6F3EE]/40 p-5">
      <ValtiraLogo height={36} />
      {legacy && <LegacyReportWarning />}
      {isPlaceholder && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">Report was created but Harvest data could not be loaded.</p>
          {placeholderError && <p className="mt-1 text-amber-700">{placeholderError}</p>}
          <p className="mt-1">Connect Harvest (and link projects) in Settings, then use “Regenerate” to load data.</p>
        </div>
      )}
      <h3 className="mt-4 text-lg font-semibold text-neutral-900">{titleLine}</h3>
      <p className="mt-1 text-base font-semibold text-neutral-800">{reportKind}</p>
      <p className="mt-0.5 text-sm text-neutral-600">{dateRange}</p>

      {snapshot ? (
        <BudgetBurnOverview report={report} snapshot={snapshot} periodHours={totalHours} />
      ) : (
        <p className="mt-4 text-sm text-neutral-700">{totalHours.toFixed(1)} hours this period.</p>
      )}
      <div className="mt-3 rounded-lg border border-[#E8E2DA] bg-white p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Budget remaining</h4>
        <p className="mt-2 text-sm text-neutral-900">
          {hasHarvestBudgetReport || totalBudgetHours != null
            ? `${(hasHarvestBudgetReport ? totalBudgetRemaining : Math.max(0, (totalBudgetHours ?? 0) - totalBudgetSpent)).toFixed(1)}h remaining`
            : "No hour budget is set in Harvest."}
        </p>
        {totalBudgetHours != null && (
          <p className="mt-1 text-xs text-neutral-500">
            of {totalBudgetHours.toFixed(1)}h total
            {hasHarvestBudgetReport ? ` · ${totalBudgetSpent.toFixed(1)}h used to date` : ""}
          </p>
        )}
      </div>

      {config.components.projectSummary && (
        <div className="mt-5">
          <h4 className="text-sm font-medium text-neutral-900">Hours by project</h4>
          {segments.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-600">No time entries in this period.</p>
          ) : (
            <ul className="mt-2 space-y-3 text-sm text-neutral-900">
              {segments.map((seg, index) => (
                <li key={segmentKey(seg)}>
                  <span className="font-medium">
                    {seg.displayName} ({segmentDisplayPercent(seg, segments, totalHours, index)}% of hours):
                  </span>{" "}
                  {seg.summary}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs italic text-neutral-500">
            Valtira project managers review entered hours regularly and may shift time to the correct project.
          </p>
        </div>
      )}

      {config.components.financialSummary && (
        <div className="mt-5 rounded-lg border border-[#E8E2DA] bg-white p-3">
          <h4 className="text-sm font-medium text-neutral-900">Financial summary</h4>
          <p className="mt-2 text-sm text-neutral-900">Total hours: {totalHours.toFixed(1)}</p>
          {spentFundsEstimate > 0 && (
            <p className="text-sm text-neutral-900">
              Period total: ${spentFundsEstimate.toFixed(2)} (est.)
            </p>
          )}
          {totalCostBudget != null && totalCostBudget > 0 && (
            <p className="text-sm text-neutral-600">Contract funds budget: ${totalCostBudget.toLocaleString()}</p>
          )}
        </div>
      )}

      {config.components.additionalInfo && config.additionalInfoText.trim() && (
        <div className="mt-5 rounded-lg border border-[#E8E2DA] bg-white p-3">
          <h4 className="text-sm font-medium text-neutral-900">Additional information</h4>
          <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">{config.additionalInfoText.trim()}</p>
        </div>
      )}

      {config.components.taskDetail && (
        <div className="mt-5">
          <h4 className="text-sm font-medium text-neutral-900">Task details</h4>
          <p className="mt-1 text-xs text-neutral-500">
            Clients receive this as a spreadsheet attachment. Preview below is for your review only.
          </p>
          {entries.length > 0 ? (
            <TimeEntriesTable entries={entries} />
          ) : (
            <p className="mt-2 text-sm text-neutral-600">No time entries in this period.</p>
          )}
        </div>
      )}

      {config.components.footer && (
        <p className="mt-6 text-sm text-neutral-900">
          {config.footerName || "Valtira"}
          {config.footerTitle ? <span className="block text-neutral-600">{config.footerTitle}</span> : null}
        </p>
      )}
    </div>
  );
}

export function ReportSection({
  projectId,
  initialReports,
  initialAutomations,
  clientEmails = [],
  initialOpenReportId,
  actionsContainerRef,
  actionsSlotReady,
}: {
  projectId: string;
  initialReports: Report[];
  initialAutomations: Automation[];
  clientEmails?: string[];
  initialOpenReportId?: string;
  actionsContainerRef?: RefObject<HTMLDivElement | null>;
  actionsSlotReady?: boolean;
}) {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>(initialReports);
  const [automations, setAutomations] = useState<Automation[]>(initialAutomations);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [modalReport, setModalReport] = useState<Report | null>(null);
  const [sendToEmails, setSendToEmails] = useState<string[]>([""]);
  const [sending, setSending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generatePeriodType, setGeneratePeriodType] = useState<ReportPeriodType>("week");
  const [generatePeriodValue, setGeneratePeriodValue] = useState<string>("last");
  const [generateConfig, setGenerateConfig] = useState<ReportConfig>(defaultReportConfig);
  const [editingAutomationId, setEditingAutomationId] = useState<string | null>(null);
  const [sendTestAutomationId, setSendTestAutomationId] = useState<string | null>(null);

  useEffect(() => {
    setReports(initialReports);
  }, [initialReports]);

  useEffect(() => {
    if (!initialOpenReportId || reports.length === 0) return;
    const report = reports.find((r) => r.id === initialOpenReportId);
    if (report) {
      setModalReport(report);
      setSendToEmails((report.status === "pending_approval" || report.status === "draft") && clientEmails.length > 0 ? [...clientEmails] : [""]);
    }
  }, [initialOpenReportId, reports, clientEmails]);

  const sentReports = reports.filter((r) => r.status === "sent");
  const reportsNeedingReview = reports.filter((r) => r.status === "pending_approval" || r.status === "rejected");
  const legacyReports = reports.filter((r) => isLegacyReport(r.report_config));
  const modalIsLegacy = modalReport ? isLegacyReport(modalReport.report_config) : false;

  useEffect(() => {
    fetch(`/api/projects/${projectId}/automations`)
      .then((r) => r.json())
      .then((d) => d.automations && setAutomations(d.automations))
      .catch(() => {});
  }, [projectId]);

  async function createAutomation(
    title: string,
    requiresApproval: boolean,
    reportConfig: ReportConfig,
    periodType: ReportPeriodType,
    dayOfWeek: number | null,
    dayOfMonth: number | null,
    timeCentral: string
  ) {
    setError("");
    setLoading("add-automation");
    try {
      const res = await fetch(`/api/projects/${projectId}/automations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          requiresApproval,
          reportConfig,
          periodType,
          dayOfWeek: periodType === "month" ? undefined : dayOfWeek,
          dayOfMonth: periodType === "month" ? dayOfMonth : undefined,
          timeUtc: timeCentral || "09:00",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || res.statusText);
        return;
      }
      setAutomations((prev) => [...prev, data]);
      setShowAddForm(false);
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function toggleAutomation(id: string, isActive: boolean) {
    setLoading(`toggle-${id}`);
    try {
      const res = await fetch(`/api/automations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, is_active: data.is_active } : a)));
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function deleteAutomation(id: string) {
    if (!confirm("Remove this automation?")) return;
    setLoading(`del-${id}`);
    try {
      await fetch(`/api/automations/${id}`, { method: "DELETE" });
      setAutomations((prev) => prev.filter((a) => a.id !== id));
      setEditingAutomationId((current) => (current === id ? null : current));
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function sendTest(automationId: string) {
    setSendTestAutomationId(automationId);
    setError("");
    try {
      const res = await fetch(`/api/cron/run-automations?test=1&automationId=${encodeURIComponent(automationId)}`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Failed (${res.status})`);
        return;
      }
      router.refresh();
    } finally {
      setSendTestAutomationId(null);
    }
  }

  async function updateAutomation(
    id: string,
    title: string,
    requiresApproval: boolean,
    reportConfig: ReportConfig,
    periodType: ReportPeriodType,
    dayOfWeek: number | null,
    dayOfMonth: number | null,
    timeCentral: string
  ) {
    setError("");
    setLoading(`edit-${id}`);
    try {
      const res = await fetch(`/api/automations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          requiresApproval,
          reportConfig,
          periodType,
          dayOfWeek: periodType === "month" ? undefined : dayOfWeek,
          dayOfMonth: periodType === "month" ? dayOfMonth : undefined,
          timeUtc: timeCentral || "09:00",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || res.statusText);
        return;
      }
      setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, ...data } : a)));
      setEditingAutomationId(null);
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  /** Harvest week = Sunday–Saturday. Options match server getHarvestWeekBounds. */
  function getWeekPeriodOptions(): { value: string; label: string }[] {
    const opts = [{ value: "last", label: "Last completed week (Sun–Sat)" }];
    const today = new Date();
    const day = today.getDay();
    const daysBackToLastSaturday = day === 0 ? 1 : day + 1;
    const lastSaturday = new Date(today);
    lastSaturday.setDate(today.getDate() - daysBackToLastSaturday);
    for (let i = 0; i < 8; i++) {
      const sat = new Date(lastSaturday);
      sat.setDate(lastSaturday.getDate() - 7 * i);
      const sun = new Date(sat);
      sun.setDate(sat.getDate() - 6);
      const start = sun.toISOString().slice(0, 10);
      const end = sat.toISOString().slice(0, 10);
      opts.push({ value: `${start}|${end}`, label: `Week of ${formatReportDate(start)} – ${formatReportDate(end)} (Sun–Sat)` });
    }
    return opts;
  }

  function getMonthPeriodOptions(): { value: string; label: string }[] {
    const opts = [{ value: "last", label: "Last completed month" }];
    for (let i = 1; i <= 6; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const y = d.getFullYear();
      const m = d.getMonth();
      const start = new Date(y, m, 1).toISOString().slice(0, 10);
      const end = new Date(y, m + 1, 0).toISOString().slice(0, 10);
      opts.push({ value: `${start}|${end}`, label: formatMonthRange(start, end) });
    }
    return opts;
  }

  function getBiweekPeriodOptions(): { value: string; label: string }[] {
    const weeks = getWeekPeriodOptions().filter((o) => o.value !== "last");
    const opts = [{ value: "last", label: "Last two completed weeks (Sun–Sat)" }];
    for (let i = 0; i < weeks.length - 1; i += 2) {
      const newer = weeks[i].value.split("|");
      const older = weeks[i + 1].value.split("|");
      if (older[0] && newer[1]) {
        opts.push({
          value: `${older[0]}|${newer[1]}`,
          label: `${formatReportDate(older[0])} – ${formatReportDate(newer[1])}`,
        });
      }
    }
    return opts;
  }

  function periodOptionsFor(type: ReportPeriodType) {
    if (type === "month") return getMonthPeriodOptions();
    if (type === "biweek") return getBiweekPeriodOptions();
    return getWeekPeriodOptions();
  }

  async function generateReport() {
    const body: {
      periodType: ReportPeriodType;
      reportConfig: ReportConfig;
      periodStart?: string;
      periodEnd?: string;
    } = { periodType: generatePeriodType, reportConfig: generateConfig };
    if (generatePeriodValue && generatePeriodValue !== "last") {
      const [start, end] = generatePeriodValue.split("|");
      if (start && end) {
        body.periodStart = start;
        body.periodEnd = end;
      }
    }
    setError("");
    setLoading("generate-report");
    try {
      const res = await fetch(`/api/projects/${projectId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || res.statusText);
        return;
      }
      setReports((prev) => [data, ...prev]);
      setModalReport(data);
      setSendToEmails([""]);
      setGenerateModalOpen(false);
      setGeneratePeriodValue("last");
      setGenerateConfig(defaultReportConfig());
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  function openGenerateModal() {
    setGeneratePeriodValue("last");
    setGeneratePeriodType("week");
    setGenerateConfig(defaultReportConfig());
    setGenerateModalOpen(true);
  }

  async function rejectReport(reportId: string) {
    setError("");
    setLoading(`reject-${reportId}`);
    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReports((prev) =>
          prev.map((r) => (r.id === reportId ? { ...r, status: "rejected" as const } : r))
        );
        if (modalReport?.id === reportId) setModalReport((r) => (r ? { ...r, status: "rejected" } : null));
      } else setError(data.error || res.statusText);
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function regenerateReport(reportId: string) {
    setError("");
    setLoading(`regenerate-${reportId}`);
    try {
      const res = await fetch(`/api/reports/${reportId}/regenerate`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || res.statusText || "Regenerate failed");
        return;
      }
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, ...data } : r))
      );
      if (modalReport?.id === reportId) setModalReport((r) => (r ? { ...r, ...data } : null));
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function deleteReport(reportId: string) {
    setError("");
    setLoading(`delete-${reportId}`);
    try {
      const res = await fetch(`/api/reports/${reportId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || res.statusText || "Delete failed");
        return;
      }
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      if (modalReport?.id === reportId) setModalReport(null);
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  function addSendToEmail() {
    setSendToEmails((prev) => [...prev, ""]);
  }
  function setSendToEmailAt(i: number, value: string) {
    setSendToEmails((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  }
  function removeSendToEmail(i: number) {
    setSendToEmails((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSendReport() {
    const emails = sendToEmails.map((e) => e.trim()).filter(Boolean);
    if (emails.length === 0) return;
    if (!modalReport) return;
    if (isLegacyReport(modalReport.report_config)) {
      setError("This report is outdated and can no longer be sent. Delete it and generate a new one.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/reports/${modalReport.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || res.statusText || "Failed to send");
        return;
      }
      setReports((prev) =>
        prev.map((r) =>
          r.id === modalReport.id ? { ...r, status: "sent" as const } : r
        )
      );
      setModalReport(null);
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  const reportActions = (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={openGenerateModal}
        disabled={!!loading}
        className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        Generate report
      </button>
    </div>
  );

  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (actionsSlotReady && actionsContainerRef?.current) {
      setPortalTarget(actionsContainerRef.current);
    }
  }, [actionsSlotReady, actionsContainerRef]);

  return (
    <>
      {portalTarget && createPortal(reportActions, portalTarget)}
      {legacyReports.length > 0 && (
        <div role="alert" className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-5">
          <div className="flex gap-3">
            <WarningGlyph />
            <div>
              <h2 className="text-lg font-semibold text-amber-950">Outdated reports</h2>
              <p className="mt-1 text-sm text-amber-900">
                Due to a recent app update, existing reports can no longer be sent. Delete these reports and generate new ones.
              </p>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {legacyReports.map((report) => (
              <li
                key={report.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => {
                    setModalReport(report);
                    setSendToEmails(
                      (report.status === "pending_approval" || report.status === "draft") && clientEmails.length > 0
                        ? [...clientEmails]
                        : [""]
                    );
                  }}
                  className="text-left text-sm font-medium text-amber-950 hover:underline"
                >
                  {periodTypeLabel(report.period_type)} · {formatReportDate(report.period_start)} –{" "}
                  {formatReportDate(report.period_end)}
                  <span className="ml-2 font-normal text-amber-800">
                    {report.status === "sent" ? "Sent" : report.status.replace("_", " ")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteReport(report.id)}
                  disabled={!!loading}
                  className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
                >
                  {loading === `delete-${report.id}` ? "Deleting…" : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
        <div>
          <h2 className="text-lg font-medium text-neutral-900">Automated Reports</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Create one or more report automations. When active, the report is generated on schedule with the components you selected. Approval is required if you include additional information.
          </p>
        </div>

      {/* Automations list */}
      <div className="mt-4">
        <h3 className="text-sm font-medium text-neutral-700">Report automations</h3>
        {automations.length === 0 && !showAddForm ? (
          <p className="mt-2 text-sm text-neutral-600">No automations yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {automations.map((a) => (
              <li key={a.id} className="rounded-lg border border-neutral-200 bg-neutral-50/50">
                {editingAutomationId === a.id ? (
                  <EditAutomationForm
                    automation={a}
                    onSave={(title, requiresApproval, reportConfig, periodType, dayOfWeek, dayOfMonth, timeCentral) =>
                      updateAutomation(a.id, title, requiresApproval, reportConfig, periodType, dayOfWeek, dayOfMonth, timeCentral)
                    }
                    onCancel={() => setEditingAutomationId(null)}
                    loading={loading === `edit-${a.id}`}
                  />
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setEditingAutomationId(a.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditingAutomationId(a.id); } }}
                    className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-neutral-100/80"
                  >
                    <span className="text-sm font-medium text-neutral-900">
                      {a.title?.trim() || `${periodTypeLabel(a.period_type)} report`}
                      <span className="ml-1 text-xs font-normal text-neutral-600">
                        · {summarizeReportComponents(normalizeReportConfig(a.report_config, a.report_format))}
                      </span>
                      {a.requires_approval === false ? (
                        <span className="ml-1 text-xs font-normal text-neutral-600">(sends automatically)</span>
                      ) : (
                        <span className="ml-1 text-xs font-normal text-neutral-600">(requires approval)</span>
                      )}
                    </span>
                    <span className="text-sm text-neutral-600">{formatSchedule(a)}</span>
                    <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => sendTest(a.id)}
                        disabled={!!loading || sendTestAutomationId !== null}
                        className="shrink-0 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        {sendTestAutomationId === a.id ? "Sending…" : "Send test"}
                      </button>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={a.is_active}
                        title={a.is_active ? "Active" : "Inactive"}
                        onClick={() => toggleAutomation(a.id, !a.is_active)}
                        disabled={!!loading}
                        className={`toggle relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full border-0 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                          a.is_active ? "bg-green-600" : "bg-neutral-300"
                        }`}
                      >
                        <span
                          className={`toggle-thumb pointer-events-none absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border border-neutral-200/80 bg-white shadow-sm transition-transform ${
                            a.is_active ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </button>
                      <span className="text-sm text-neutral-600">{a.is_active ? "Active" : "Inactive"}</span>
                      <button
                        type="button"
                        onClick={() => deleteAutomation(a.id)}
                        disabled={!!loading}
                        className="shrink-0 rounded p-1 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50"
                        aria-label="Remove automation"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {showAddForm ? (
          <AddAutomationForm
            onSave={createAutomation}
            onCancel={() => setShowAddForm(false)}
            loading={loading === "add-automation"}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="mt-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            + Add automation
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {generateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-neutral-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-neutral-900">Generate report</h3>
            <p className="mt-1 text-sm text-neutral-700">
              Choose cadence, period, and optional components. Title, timeframe, and budget basics are always included.
            </p>
            <div className="mt-4 space-y-4">
              <PeriodTypeFields
                name="generate-period-type"
                periodType={generatePeriodType}
                onChange={(next) => {
                  setGeneratePeriodType(next);
                  setGeneratePeriodValue("last");
                }}
              />
              <div>
                <label htmlFor="generate-period" className="block text-sm font-medium text-neutral-900">
                  Period
                </label>
                <select
                  id="generate-period"
                  value={generatePeriodValue}
                  onChange={(e) => setGeneratePeriodValue(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
                >
                  {periodOptionsFor(generatePeriodType).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <ReportConfigFields
                config={generateConfig}
                onChange={setGenerateConfig}
                showNarrativeFields
                additionalInfoHint="Additional information requires your approval before the report can be sent automatically."
              />
            </div>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={generateReport}
                disabled={!!loading}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {loading === "generate-report" ? "Generating…" : "Generate"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setGenerateModalOpen(false);
                  setGeneratePeriodValue("last");
                  setGenerateConfig(defaultReportConfig());
                }}
                disabled={!!loading}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: report preview + close / send to */}
      {modalReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-neutral-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-lg font-semibold text-neutral-900">Report</h3>
              <button
                type="button"
                onClick={() => setModalReport(null)}
                className="rounded p-1 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-4">
              <ReportContent report={modalReport} />
            </div>
            {modalReport.status === "pending_approval" && !modalIsLegacy && (
              <div className="mt-6 flex flex-wrap gap-3 border-t border-neutral-200 pt-4">
                <button
                  type="button"
                  onClick={async () => {
                    if (clientEmails.length === 0) {
                      setError("Add report recipients in project settings to approve and send to clients.");
                      return;
                    }
                    setSending(true);
                    setError("");
                    try {
                      const res = await fetch(`/api/reports/${modalReport.id}/send`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ emails: clientEmails }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        setError(data.error || "Failed to send");
                        return;
                      }
                      setReports((prev) =>
                        prev.map((r) => (r.id === modalReport.id ? { ...r, status: "sent" as const } : r))
                      );
                      setModalReport(null);
                      router.refresh();
                    } finally {
                      setSending(false);
                    }
                  }}
                  disabled={sending || !!loading}
                  className="rounded-xl bg-green-600 px-6 py-3 text-base font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {sending ? "Sending…" : "Approve and send to clients"}
                </button>
                <button
                  type="button"
                  onClick={() => rejectReport(modalReport.id)}
                  disabled={!!loading}
                  className="rounded-xl border border-red-300 bg-white px-6 py-3 text-base font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {loading === `reject-${modalReport.id}` ? "Rejecting…" : "Reject"}
                </button>
              </div>
            )}
            {modalReport.status === "rejected" && !modalIsLegacy && (
              <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-900">
                  It looks like this report is not ready yet. Follow up with your team on Slack to update their time entries. Once that&apos;s done, come back here and regenerate the report to review and approve for sending. Or delete this report if you don&apos;t need it.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => regenerateReport(modalReport.id)}
                    disabled={!!loading}
                    className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {loading === `regenerate-${modalReport.id}` ? "Regenerating…" : "Regenerate report"}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteReport(modalReport.id)}
                    disabled={!!loading}
                    className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {loading === `delete-${modalReport.id}` ? "Deleting…" : "Delete report"}
                  </button>
                </div>
              </div>
            )}
            {(modalIsLegacy || ["draft", "pending_approval"].includes(modalReport.status)) && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => deleteReport(modalReport.id)}
                  disabled={!!loading}
                  className="text-sm text-red-600 hover:underline disabled:opacity-50"
                >
                  {loading === `delete-${modalReport.id}` ? "Deleting…" : "Delete this report"}
                </button>
              </div>
            )}
            {modalIsLegacy ? null : (
            <div className="mt-6 border-t border-neutral-200 pt-4">
              <h4 className="text-sm font-medium text-neutral-700">Send to</h4>
              <p className="mt-1 text-xs text-neutral-600">Send this report to one or more people by email.</p>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <div className="mt-2 space-y-2">
                {sendToEmails.map((email, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setSendToEmailAt(i, e.target.value)}
                      placeholder="email@example.com"
                      className="block flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
                    />
                    {sendToEmails.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeSendToEmail(i)}
                        className="rounded-md border border-neutral-300 px-2 text-sm text-neutral-600 hover:bg-neutral-50"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addSendToEmail}
                  className="text-sm text-neutral-600 underline hover:no-underline"
                >
                  + Add another email
                </button>
              </div>
              <button
                type="button"
                onClick={handleSendReport}
                disabled={sending || sendToEmails.every((e) => !e.trim())}
                className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send report"}
              </button>
            </div>
            )}
          </div>
        </div>
      )}

      {/* Reports needing review */}
      {reportsNeedingReview.length > 0 && (
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
          <h3 className="text-sm font-medium text-amber-900">Reports needing your review</h3>
          <ul className="mt-2 space-y-1">
            {reportsNeedingReview.map((report) => (
              <li key={report.id}>
                <button
                  type="button"
                  onClick={() => {
                    setModalReport(report);
                    setSendToEmails((report.status === "pending_approval" || report.status === "draft") && clientEmails.length > 0 ? [...clientEmails] : [""]);
                  }}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-amber-100/80"
                >
                  <span className="font-medium text-amber-900">
                    {periodTypeLabel(report.period_type)} · {formatReportDate(report.period_start)} – {formatReportDate(report.period_end)}
                    {isLegacyReport(report.report_config) ? (
                      <span className="ml-2 font-normal text-amber-700">· Outdated</span>
                    ) : null}
                  </span>
                  <span className="text-amber-700">{report.status === "rejected" ? "Rejected" : "Pending approval"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Report history: dropdown of sent reports only; click opens modal */}
      <div className="mt-8">
        <button
          type="button"
          onClick={() => setHistoryOpen((open) => !open)}
          className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50/50 px-4 py-3 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          aria-expanded={historyOpen}
        >
          <span>Report history</span>
          <span className="text-neutral-600">
            {sentReports.length === 0
              ? "No sent reports"
              : `${sentReports.length} sent`}
          </span>
          <svg
            className={`h-5 w-5 shrink-0 text-neutral-600 transition-transform ${historyOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {historyOpen && (
          <div className="mt-2 rounded-lg border border-neutral-200 bg-white py-1">
            {sentReports.length === 0 ? (
              <p className="px-4 py-3 text-sm text-neutral-600">No reports have been sent to report recipients yet.</p>
            ) : (
              <ul className="max-h-60 overflow-y-auto">
                {sentReports.map((report) => (
                  <li key={report.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setModalReport(report);
                        setHistoryOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-neutral-50"
                    >
                      <span className="font-medium text-neutral-900">
                        {periodTypeLabel(report.period_type)} · {formatReportDate(report.period_start)} – {formatReportDate(report.period_end)}
                        {isLegacyReport(report.report_config) ? (
                          <span className="ml-2 font-normal text-amber-700">· Outdated</span>
                        ) : null}
                      </span>
                      <span className="text-neutral-600">View</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
}

/** Central time options: 6:00 AM through 10:00 PM, hourly (value is HH:MM 24h) */
const CENTRAL_TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const opts: { value: string; label: string }[] = [];
  for (let h = 6; h <= 22; h++) {
    const label = h === 12 ? "12:00 PM" : h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
    opts.push({ value: `${h.toString().padStart(2, "0")}:00`, label });
  }
  return opts;
})();

/** 1st–22nd business day of month (weekdays only) */
const BUSINESS_DAY_OPTIONS = Array.from({ length: 22 }, (_, i) => {
  const n = i + 1;
  const label = n === 1 ? "1st business day" : n === 2 ? "2nd business day" : n === 3 ? "3rd business day" : `${n}th business day`;
  return { value: n, label };
});

function AutomationScheduleFields({
  periodType,
  onPeriodTypeChange,
  dayOfWeek,
  setDayOfWeek,
  dayOfMonth,
  setDayOfMonth,
  timeCentral,
  setTimeCentral,
  namePrefix,
}: {
  periodType: ReportPeriodType;
  onPeriodTypeChange: (next: ReportPeriodType) => void;
  dayOfWeek: number;
  setDayOfWeek: (n: number) => void;
  dayOfMonth: number;
  setDayOfMonth: (n: number) => void;
  timeCentral: string;
  setTimeCentral: (v: string) => void;
  namePrefix: string;
}) {
  return (
    <>
      <PeriodTypeFields name={`${namePrefix}-periodType`} periodType={periodType} onChange={onPeriodTypeChange} />
      {periodType === "month" ? (
        <div>
          <label className="text-sm text-neutral-900">Business day of month</label>
          <select
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Number(e.target.value) || 1)}
            className="mt-1 block w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            {BUSINESS_DAY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-500">e.g. 1st = first weekday of the month (no weekends)</p>
        </div>
      ) : (
        <div>
          <label className="text-sm text-neutral-900">Day of week</label>
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
            className="mt-1 block w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            {DAYS.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
          {periodType === "biweek" && (
            <p className="mt-1 text-xs text-neutral-500">Sends every other week on this day.</p>
          )}
        </div>
      )}
      <div>
        <label className="text-sm text-neutral-900">Time (Central)</label>
        <select
          value={timeCentral}
          onChange={(e) => setTimeCentral(e.target.value)}
          className="mt-1 block w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          {CENTRAL_TIME_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </>
  );
}

function AddAutomationForm({
  onSave,
  onCancel,
  loading,
}: {
  onSave: (
    title: string,
    requiresApproval: boolean,
    reportConfig: ReportConfig,
    periodType: ReportPeriodType,
    dayOfWeek: number | null,
    dayOfMonth: number | null,
    timeCentral: string
  ) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [title, setTitle] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [reportConfig, setReportConfig] = useState<ReportConfig>(defaultReportConfig);
  const [periodType, setPeriodType] = useState<ReportPeriodType>("week");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [timeCentral, setTimeCentral] = useState("09:00");
  const forceApproval = reportConfig.components.additionalInfo;

  return (
    <div className="mt-3 rounded-lg border border-neutral-200 bg-white p-4">
      <h4 className="text-sm font-medium text-neutral-700">New automation</h4>
      <p className="mt-1 text-xs text-neutral-600">
        The report is generated from the last completed week, two weeks, or month using the components you select.
      </p>
      <div className="mt-3 space-y-3">
        <ReportConfigFields
          config={reportConfig}
          onChange={setReportConfig}
          showNarrativeFields
          additionalInfoHint="Additional information requires approval so you can add notes before send."
        />
        <div>
          <label htmlFor="automation-title" className="block text-sm text-neutral-600">Title</label>
          <input
            id="automation-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Weekly client report"
            className="mt-1 block w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <span className="block text-sm text-neutral-600">This automation requires my approval before being sent to client</span>
          <div className="mt-1 flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="requiresApproval" checked={forceApproval || requiresApproval} onChange={() => setRequiresApproval(true)} />
              Yes
            </label>
            <label className={`flex items-center gap-2 text-sm ${forceApproval ? "opacity-50" : ""}`}>
              <input
                type="radio"
                name="requiresApproval"
                checked={!forceApproval && !requiresApproval}
                disabled={forceApproval}
                onChange={() => setRequiresApproval(false)}
              />
              No (send automatically)
            </label>
          </div>
        </div>
        <AutomationScheduleFields
          namePrefix="add"
          periodType={periodType}
          onPeriodTypeChange={setPeriodType}
          dayOfWeek={dayOfWeek}
          setDayOfWeek={setDayOfWeek}
          dayOfMonth={dayOfMonth}
          setDayOfMonth={setDayOfMonth}
          timeCentral={timeCentral}
          setTimeCentral={setTimeCentral}
        />
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() =>
            onSave(
              title,
              forceApproval || requiresApproval,
              reportConfig,
              periodType,
              periodType === "month" ? null : dayOfWeek,
              periodType === "month" ? dayOfMonth : null,
              timeCentral
            )
          }
          disabled={loading}
          className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {loading ? "Adding…" : "Add automation"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function EditAutomationForm({
  automation,
  onSave,
  onCancel,
  loading,
}: {
  automation: Automation;
  onSave: (
    title: string,
    requiresApproval: boolean,
    reportConfig: ReportConfig,
    periodType: ReportPeriodType,
    dayOfWeek: number | null,
    dayOfMonth: number | null,
    timeCentral: string
  ) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [title, setTitle] = useState(automation.title?.trim() ?? "");
  const [requiresApproval, setRequiresApproval] = useState(automation.requires_approval !== false);
  const [reportConfig, setReportConfig] = useState<ReportConfig>(
    normalizeReportConfig(automation.report_config, automation.report_format)
  );
  const [periodType, setPeriodType] = useState<ReportPeriodType>(normalizePeriodType(automation.period_type));
  const [dayOfWeek, setDayOfWeek] = useState(automation.day_of_week ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(Math.min(22, Math.max(1, automation.day_of_month ?? 1)));
  const [timeCentral, setTimeCentral] = useState(automation.time_utc?.slice(0, 5) || "09:00");
  const forceApproval = reportConfig.components.additionalInfo;

  return (
    <div className="p-4 text-neutral-900">
      <h4 className="text-sm font-medium text-neutral-900">Edit automation</h4>
      <p className="mt-1 text-xs text-neutral-900">
        The report is generated from the last completed week, two weeks, or month using the components you select.
      </p>
      <div className="mt-3 space-y-3">
        <ReportConfigFields
          config={reportConfig}
          onChange={setReportConfig}
          showNarrativeFields
          additionalInfoHint="Additional information requires approval so you can add notes before send."
        />
        <div>
          <label htmlFor="edit-automation-title" className="block text-sm font-medium text-neutral-900">Title</label>
          <input
            id="edit-automation-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Weekly client report"
            className="mt-1 block w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          />
        </div>
        <div>
          <span className="block text-sm text-neutral-900">This automation requires my approval before being sent to client</span>
          <div className="mt-1 flex gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-900">
              <input type="radio" name="edit-requiresApproval" checked={forceApproval || requiresApproval} onChange={() => setRequiresApproval(true)} />
              Yes
            </label>
            <label className={`flex cursor-pointer items-center gap-2 text-sm text-neutral-900 ${forceApproval ? "opacity-50" : ""}`}>
              <input
                type="radio"
                name="edit-requiresApproval"
                checked={!forceApproval && !requiresApproval}
                disabled={forceApproval}
                onChange={() => setRequiresApproval(false)}
              />
              No (send automatically)
            </label>
          </div>
        </div>
        <AutomationScheduleFields
          namePrefix="edit"
          periodType={periodType}
          onPeriodTypeChange={setPeriodType}
          dayOfWeek={dayOfWeek}
          setDayOfWeek={setDayOfWeek}
          dayOfMonth={dayOfMonth}
          setDayOfMonth={setDayOfMonth}
          timeCentral={timeCentral}
          setTimeCentral={setTimeCentral}
        />
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() =>
            onSave(
              title,
              forceApproval || requiresApproval,
              reportConfig,
              periodType,
              periodType === "month" ? null : dayOfWeek,
              periodType === "month" ? dayOfMonth : null,
              timeCentral
            )
          }
          disabled={loading}
          className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
