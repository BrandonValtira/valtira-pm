"use client";

import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useState, useEffect, type RefObject } from "react";

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
  harvest_data_snapshot?: {
    timeEntries?: TimeEntry[];
    harvestProjectNames?: string[];
    harvestProjects?: HarvestProjectSnapshot[];
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
  created_at: string;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function firstName(fullName: string): string {
  const part = fullName.trim().split(/\s+/)[0];
  return part ?? fullName;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatMonthRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return s.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
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

function formatSchedule(a: Automation): string {
  const timeStr = formatTimeCentral(a.time_utc) + " CT";
  if (a.period_type === "month") {
    const day = a.day_of_month ?? 1;
    return `Day ${day} of month at ${timeStr}`;
  }
  const day = a.day_of_week ?? 1;
  return `${DAYS[day]}s at ${timeStr}`;
}

/** Single report content block (used in list and in modal) */
function ReportContent({ report }: { report: Report }) {
  const snapshot = report.harvest_data_snapshot;
  const entries = snapshot?.timeEntries ?? [];
  const totalHours = entries.reduce((s, e) => s + e.hours, 0);
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
  const fundsLeft =
    totalCostBudget != null && totalCostBudget > 0
      ? Math.max(0, totalCostBudget - spentFundsEstimate)
      : null;
  const hoursLeft = totalBudgetHours != null ? Math.max(0, totalBudgetHours - totalHours) : null;

  const clientNames = Array.from(new Set(harvestProjects.map((p) => p.client_name).filter(Boolean))) as string[];
  const clientLabel = clientNames.length > 0 ? clientNames.join(", ") : null;
  const projectLabel = projectNames.length > 0 ? projectNames.join(", ") : "Harvest project";
  const periodLabel =
    report.period_type === "month"
      ? `Month: ${formatMonthRange(report.period_start, report.period_end)}`
      : `Week: ${formatDate(report.period_start)} – ${formatDate(report.period_end)}`;

  return (
    <>
      <h3 className="text-base font-semibold text-neutral-900">
        {[clientLabel, projectLabel].filter(Boolean).join(" · ")}
      </h3>
      <p className="mt-1 text-sm text-neutral-800">{periodLabel}</p>
      <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        <h4 className="text-sm font-medium text-neutral-900">Budget</h4>
        <div className="mt-2 grid gap-1 text-sm text-neutral-900 sm:grid-cols-2">
          {totalBudgetHours != null && (
            <>
              {hasHarvestBudgetReport ? (
                <>
                  <span>
                    Hours: {totalBudgetSpent.toFixed(1)} consumed, {totalBudgetRemaining.toFixed(1)} left in budget
                  </span>
                  <span>Total budget: {totalBudgetHours.toFixed(1)} hours</span>
                  <span>Hours this period: {totalHours.toFixed(1)}</span>
                </>
              ) : (
                <>
                  <span>
                    Hours: {hoursLeft != null ? `${hoursLeft.toFixed(1)} left out of ${totalBudgetHours.toFixed(1)} total` : `${totalHours.toFixed(1)} this period`}
                  </span>
                  {hoursLeft != null && <span>Hours this period: {totalHours.toFixed(1)}</span>}
                </>
              )}
            </>
          )}
          {totalCostBudget != null && totalCostBudget > 0 && (
            <>
              <span>Funds: ${totalCostBudget.toLocaleString()} total budget</span>
              <span>Spent this period: ${spentFundsEstimate.toFixed(2)} (est.)</span>
              {fundsLeft != null && <span>Funds left: ${fundsLeft.toFixed(2)}</span>}
            </>
          )}
          {!totalBudgetHours && !totalCostBudget && (
            <span className="text-neutral-800">No budget set in Harvest for this project.</span>
          )}
        </div>
      </div>
      <h4 className="mt-4 text-sm font-medium text-neutral-900">Tasks</h4>
      {entries.length > 0 ? (
        <>
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
          <p className="mt-3 border-t border-neutral-200 pt-2 text-sm font-medium text-neutral-900">
            Total hours consumed: {totalHours.toFixed(1)}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-neutral-800">No time entries in this period.</p>
      )}
    </>
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
  const [generatePeriodModal, setGeneratePeriodModal] = useState<"week" | "month" | null>(null);
  const [generatePeriodValue, setGeneratePeriodValue] = useState<string>("last");
  const [editingAutomationId, setEditingAutomationId] = useState<string | null>(null);

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

  useEffect(() => {
    fetch(`/api/projects/${projectId}/automations`)
      .then((r) => r.json())
      .then((d) => d.automations && setAutomations(d.automations))
      .catch(() => {});
  }, [projectId]);

  async function createAutomation(
    title: string,
    requiresApproval: boolean,
    periodType: "week" | "month",
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
          periodType,
          dayOfWeek: periodType === "week" ? dayOfWeek : undefined,
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

  async function updateAutomation(
    id: string,
    title: string,
    requiresApproval: boolean,
    periodType: "week" | "month",
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
          periodType,
          dayOfWeek: periodType === "week" ? dayOfWeek : undefined,
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

  function getWeekPeriodOptions(): { value: string; label: string }[] {
    const opts = [{ value: "last", label: "Last completed week" }];
    for (let i = 1; i <= 8; i++) {
      const d = new Date();
      d.setDate(d.getDate() - 7 * i);
      const day = d.getDay();
      const diff = day === 0 ? 7 : day;
      const monday = new Date(d);
      monday.setDate(d.getDate() - diff - 6);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const start = monday.toISOString().slice(0, 10);
      const end = sunday.toISOString().slice(0, 10);
      opts.push({ value: `${start}|${end}`, label: `Week of ${formatDate(start)} – ${formatDate(end)}` });
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

  async function generateReport(periodType: "week" | "month", periodValue?: string) {
    const body: { periodType: string; periodStart?: string; periodEnd?: string } = { periodType };
    if (periodValue && periodValue !== "last") {
      const [start, end] = periodValue.split("|");
      if (start && end) {
        body.periodStart = start;
        body.periodEnd = end;
      }
    }
    setError("");
    setLoading(`generate-${periodType}`);
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
      setGeneratePeriodModal(null);
      setGeneratePeriodValue("last");
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  function openGenerateModal(type: "week" | "month") {
    setGeneratePeriodValue("last");
    setGeneratePeriodModal(type);
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
        onClick={() => openGenerateModal("week")}
        disabled={!!loading}
        className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        Generate weekly report
      </button>
      <button
        type="button"
        onClick={() => openGenerateModal("month")}
        disabled={!!loading}
        className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        Generate monthly report
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
      <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
        <div>
          <h2 className="text-lg font-medium text-neutral-900">Automated Reports</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Create one or more report automations (e.g. weekly and monthly). When active, the report is generated on schedule and sent to you to approve; after approval it goes to the project’s report recipients. You can also generate a report anytime and send it to specific people.
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
                    onSave={(title, requiresApproval, periodType, dayOfWeek, dayOfMonth, timeCentral) =>
                      updateAutomation(a.id, title, requiresApproval, periodType, dayOfWeek, dayOfMonth, timeCentral)
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
                      {a.title?.trim() || (a.period_type === "month" ? "Monthly report" : "Weekly report")}
                      {a.requires_approval !== false && <span className="ml-1 text-xs font-normal text-neutral-600">(requires approval)</span>}
                    </span>
                    <span className="text-sm text-neutral-600">{formatSchedule(a)}</span>
                    <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
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
                          className={`toggle-thumb pointer-events-none absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            a.is_active ? "translate-x-5" : "translate-x-0.5"
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

      {/* Modal: choose period for generate report */}
      {generatePeriodModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-neutral-900">
              {generatePeriodModal === "week" ? "Generate weekly report" : "Generate monthly report"}
            </h3>
            <p className="mt-1 text-sm text-neutral-700">
              Default is the last completed {generatePeriodModal}. You can choose a specific period below.
            </p>
            <div className="mt-4">
              <label htmlFor="generate-period" className="block text-sm font-medium text-neutral-900">
                Period
              </label>
              <div className="relative mt-1">
                <select
                  id="generate-period"
                  value={generatePeriodValue}
                  onChange={(e) => setGeneratePeriodValue(e.target.value)}
                  className="block w-full appearance-none rounded-md border border-neutral-300 pl-3 pr-8 py-2 text-sm text-neutral-900 bg-white"
                >
                  {(generatePeriodModal === "week" ? getWeekPeriodOptions() : getMonthPeriodOptions()).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-neutral-500">
                  <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4">
                    <path
                      d="M5.25 7.5L10 12.25L14.75 7.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => generateReport(generatePeriodModal, generatePeriodValue)}
                disabled={!!loading}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {loading === `generate-${generatePeriodModal}` ? "Generating…" : "Generate"}
              </button>
              <button
                type="button"
                onClick={() => { setGeneratePeriodModal(null); setGeneratePeriodValue("last"); }}
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
            {modalReport.status === "pending_approval" && (
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
            {modalReport.status === "rejected" && (
              <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-900">
                  It looks like this report is not ready yet. Follow up with your team on Slack to update their time entries. Once that&apos;s done, come back here and regenerate the report to review and approve for sending.
                </p>
                <button
                  type="button"
                  onClick={() => regenerateReport(modalReport.id)}
                  disabled={!!loading}
                  className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  {loading === `regenerate-${modalReport.id}` ? "Regenerating…" : "Regenerate report"}
                </button>
              </div>
            )}
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
                    {report.period_type === "month" ? "Monthly" : "Weekly"} · {formatDate(report.period_start)} – {formatDate(report.period_end)}
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
                        {report.period_type === "month" ? "Monthly" : "Weekly"} · {formatDate(report.period_start)} – {formatDate(report.period_end)}
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

function AddAutomationForm({
  onSave,
  onCancel,
  loading,
}: {
  onSave: (title: string, requiresApproval: boolean, periodType: "week" | "month", dayOfWeek: number | null, dayOfMonth: number | null, timeCentral: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [title, setTitle] = useState("");
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [periodType, setPeriodType] = useState<"week" | "month">("week");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [timeCentral, setTimeCentral] = useState("09:00");

  return (
    <div className="mt-3 rounded-lg border border-neutral-200 bg-white p-4">
      <h4 className="text-sm font-medium text-neutral-700">New automation</h4>
      <p className="mt-1 text-xs text-neutral-600">
        The report will always be generated from the last completed week or month.
      </p>
      <div className="mt-3 space-y-3">
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
              <input
                type="radio"
                name="requiresApproval"
                checked={requiresApproval === true}
                onChange={() => setRequiresApproval(true)}
              />
              Yes
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="requiresApproval"
                checked={requiresApproval === false}
                onChange={() => setRequiresApproval(false)}
              />
              No (send automatically)
            </label>
          </div>
        </div>
        <div>
          <span className="text-sm text-neutral-600">Type</span>
          <div className="mt-1 flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="periodType"
                checked={periodType === "week"}
                onChange={() => setPeriodType("week")}
              />
              Weekly
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="periodType"
                checked={periodType === "month"}
                onChange={() => setPeriodType("month")}
              />
              Monthly
            </label>
          </div>
        </div>
        {periodType === "week" ? (
          <div>
            <label className="text-sm text-neutral-600">Day of week</label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              className="mt-1 block w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="text-sm text-neutral-600">Day of month (1–28)</label>
            <input
              type="number"
              min={1}
              max={28}
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Number(e.target.value) || 1)}
              className="mt-1 block w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        )}
        <div>
          <label className="text-sm text-neutral-600">Time (Central)</label>
          <select
            value={timeCentral}
            onChange={(e) => setTimeCentral(e.target.value)}
            className="mt-1 block w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            {CENTRAL_TIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onSave(title, requiresApproval, periodType, periodType === "week" ? dayOfWeek : null, periodType === "month" ? dayOfMonth : null, timeCentral)}
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
  onSave: (title: string, requiresApproval: boolean, periodType: "week" | "month", dayOfWeek: number | null, dayOfMonth: number | null, timeCentral: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [title, setTitle] = useState(automation.title?.trim() ?? "");
  const [requiresApproval, setRequiresApproval] = useState(automation.requires_approval !== false);
  const [periodType, setPeriodType] = useState<"week" | "month">(automation.period_type === "month" ? "month" : "week");
  const [dayOfWeek, setDayOfWeek] = useState(automation.day_of_week ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(automation.day_of_month ?? 1);
  const [timeCentral, setTimeCentral] = useState(automation.time_utc?.slice(0, 5) || "09:00");

  return (
    <div className="p-4 text-neutral-900">
      <h4 className="text-sm font-medium text-neutral-900">Edit automation</h4>
      <p className="mt-1 text-xs text-neutral-900">
        The report will always be generated from the last completed week or month.
      </p>
      <div className="mt-3 space-y-3">
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
              <input type="radio" name="edit-requiresApproval" checked={requiresApproval === true} onChange={() => setRequiresApproval(true)} />
              Yes
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-900">
              <input type="radio" name="edit-requiresApproval" checked={requiresApproval === false} onChange={() => setRequiresApproval(false)} />
              No (send automatically)
            </label>
          </div>
        </div>
        <div>
          <span className="text-sm text-neutral-900">Type</span>
          <div className="mt-1 flex gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-900">
              <input type="radio" name="edit-periodType" checked={periodType === "week"} onChange={() => setPeriodType("week")} />
              Weekly
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-900">
              <input type="radio" name="edit-periodType" checked={periodType === "month"} onChange={() => setPeriodType("month")} />
              Monthly
            </label>
          </div>
        </div>
        {periodType === "week" ? (
          <div>
            <label className="text-sm text-neutral-900">Day of week</label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              className="mt-1 block w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
            >
              {DAYS.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="text-sm text-neutral-900">Day of month (1–28)</label>
            <input
              type="number"
              min={1}
              max={28}
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Number(e.target.value) || 1)}
              className="mt-1 block w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
            />
          </div>
        )}
        <div>
          <label className="text-sm text-neutral-900">Time (Central)</label>
          <select
            value={timeCentral}
            onChange={(e) => setTimeCentral(e.target.value)}
            className="mt-1 block w-full max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          >
            {CENTRAL_TIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onSave(title, requiresApproval, periodType, periodType === "week" ? dayOfWeek : null, periodType === "month" ? dayOfMonth : null, timeCentral)}
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
