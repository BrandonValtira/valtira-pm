import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { BudgetAllocationData } from "@/lib/budget-allocation-report";
import { segmentDisplayPercent } from "@/lib/budget-allocation-report";
import { type BudgetBurnSnapshot } from "@/lib/budget-burn-chart";
import { REPORT_FORMAT_BUDGET_ALLOCATION } from "@/lib/report-formats";
import { generateReportEmailHtml } from "@/lib/report-email";
import { formatDateOnly } from "@/lib/report-week";

type TimeEntry = {
  id: number;
  spent_date: string;
  hours: number;
  notes: string | null;
  user: { name: string };
};

type HarvestProjectSnapshot = {
  client_name?: string | null;
  budget?: number | null;
  cost_budget?: number | null;
  budget_spent?: number | null;
  budget_remaining?: number | null;
  hourly_rate?: number | null;
};

type ReportForPdf = {
  period_type: string;
  period_start: string;
  period_end: string;
  report_format?: string | null;
  report_config?: unknown;
  project_name?: string;
  harvest_data_snapshot?: {
    reportFormat?: string;
    timeEntries?: TimeEntry[];
    harvestProjectNames?: string[];
    harvestProjects?: HarvestProjectSnapshot[];
    budgetAllocation?: BudgetAllocationData;
    budgetBurn?: BudgetBurnSnapshot | null;
  } | null;
};

function isBudgetAllocationReport(report: ReportForPdf): boolean {
  if (report.report_format === REPORT_FORMAT_BUDGET_ALLOCATION) return true;
  const snap = report.harvest_data_snapshot;
  return snap?.reportFormat === REPORT_FORMAT_BUDGET_ALLOCATION || !!snap?.budgetAllocation;
}

function formatMonthRange(start: string, end: string): string {
  const [sy, sm] = start.slice(0, 10).split("-").map(Number);
  const [ey, em] = end.slice(0, 10).split("-").map(Number);
  if (sy === ey && sm === em) {
    return new Date(sy, sm - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return `${formatDateOnly(start)} – ${formatDateOnly(end)}`;
}

function firstName(fullName: string): string {
  const part = fullName.trim().split(/\s+/)[0];
  return part ?? fullName;
}

/**
 * Generate a PDF buffer for the given report (for email attachment).
 */
export function generateReportPdf(report: ReportForPdf): ArrayBuffer {
  if (isBudgetAllocationReport(report)) {
    return generateBudgetAllocationPdf(report);
  }
  return generateStandardReportPdf(report);
}

function generateStandardReportPdf(report: ReportForPdf): ArrayBuffer {
  const doc = new jsPDF({ format: "a4", unit: "pt" });
  const snapshot = report.harvest_data_snapshot;
  const entries = snapshot?.timeEntries ?? [];
  const totalHours = entries.reduce((s, e) => s + e.hours, 0);
  const projectNames = snapshot?.harvestProjectNames ?? [];
  const harvestProjects = snapshot?.harvestProjects ?? [];
  const totalBudgetHours = harvestProjects.reduce((s, p) => s + (p.budget ?? 0), 0) || null;
  const totalBudgetSpent = harvestProjects.reduce((s, p) => s + (p.budget_spent ?? 0), 0);
  const totalBudgetRemaining = harvestProjects.reduce((s, p) => s + (p.budget_remaining ?? 0), 0);
  const hasBudgetReport = harvestProjects.some((p) => p.budget_spent != null || p.budget_remaining != null);
  const totalCostBudget = harvestProjects.reduce((s, p) => s + (p.cost_budget ?? 0), 0) || null;
  const avgRate =
    harvestProjects.length > 0
      ? harvestProjects.reduce((s, p) => s + (p.hourly_rate ?? 0), 0) / harvestProjects.length
      : 0;
  const spentFundsEstimate = avgRate * totalHours;

  let y = 20;
  const margin = 40;

  const clientNames = Array.from(new Set(harvestProjects.map((p) => p.client_name).filter(Boolean))) as string[];
  const clientLabel = clientNames.length > 0 ? clientNames.join(", ") : null;
  const projectLabel = projectNames.length > 0 ? projectNames.join(", ") : "Harvest project";
  const titleLine = [clientLabel, projectLabel].filter(Boolean).join(" · ");

  doc.setFontSize(16);
  doc.text(titleLine, margin, y);
  y += 20;

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  const periodLabel =
    report.period_type === "month"
      ? `Month: ${formatMonthRange(report.period_start, report.period_end)}`
      : `Week: ${formatDateOnly(report.period_start)} – ${formatDateOnly(report.period_end)}`;
  doc.text(periodLabel, margin, y);
  y += 24;
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(11);
  doc.text("Budget", margin, y);
  y += 14;
  doc.setFontSize(10);
  if (totalBudgetHours != null) {
    if (hasBudgetReport) {
      doc.text(`Hours: ${totalBudgetSpent.toFixed(1)} consumed, ${totalBudgetRemaining.toFixed(1)} left in budget`, margin, y);
      y += 14;
      doc.text(`Total budget: ${totalBudgetHours.toFixed(1)} hours`, margin, y);
      y += 14;
    } else {
      const hoursLeft = Math.max(0, totalBudgetHours - totalHours);
      doc.text(`Hours: ${hoursLeft.toFixed(1)} left out of ${totalBudgetHours.toFixed(1)} total`, margin, y);
      y += 14;
    }
    doc.text(`Hours this period: ${totalHours.toFixed(1)}`, margin, y);
    y += 14;
  }
  if (totalCostBudget != null && totalCostBudget > 0) {
    doc.text(`Funds: $${totalCostBudget.toLocaleString()} total budget`, margin, y);
    y += 14;
    doc.text(`Spent this period: $${spentFundsEstimate.toFixed(2)} (est.)`, margin, y);
    y += 14;
  }
  if (!totalBudgetHours && !totalCostBudget) {
    doc.text("No budget set in Harvest for this project.", margin, y);
    y += 14;
  }
  y += 8;

  doc.setFontSize(11);
  doc.text("Tasks", margin, y);
  y += 14;

  if (entries.length > 0) {
    const tableData = entries.map((e) => [
      e.spent_date,
      (e.notes || "—").slice(0, 50),
      e.hours.toFixed(1),
      firstName(e.user.name),
    ]);
    autoTable(doc, {
      startY: y,
      head: [["Date", "Notes", "Hours", "Resource"]],
      body: tableData,
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: { fontSize: 9 },
      headStyles: { fillColor: [240, 240, 240] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  } else {
    doc.setFontSize(10);
    doc.text("No time entries in this period.", margin, y);
    y += 14;
  }

  doc.setFontSize(10);
  doc.text(`Total hours consumed: ${totalHours.toFixed(1)}`, margin, y + 4);

  return doc.output("arraybuffer") as ArrayBuffer;
}

function generateBudgetAllocationPdf(report: ReportForPdf): ArrayBuffer {
  const doc = new jsPDF({ format: "a4", unit: "pt" });
  const margin = 40;
  let y = 20;
  const snapshot = report.harvest_data_snapshot;
  const allocation = snapshot?.budgetAllocation;
  const segments = allocation?.segments ?? [];
  const budgetTotalHours = allocation?.totalHours ?? 0;
  const harvestProjects = snapshot?.harvestProjects ?? [];
  const projectNames = snapshot?.harvestProjectNames ?? [];
  const clientNames = Array.from(new Set(harvestProjects.map((p) => p.client_name).filter(Boolean))) as string[];
  const titleLine = [clientNames.join(", "), projectNames.join(", ")].filter(Boolean).join(" · ");
  const periodLabel =
    report.period_type === "month"
      ? `Month: ${formatMonthRange(report.period_start, report.period_end)}`
      : `Week: ${formatDateOnly(report.period_start)} – ${formatDateOnly(report.period_end)}`;

  doc.setFontSize(16);
  doc.text(titleLine || "Budget Allocation Report", margin, y);
  y += 18;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(periodLabel, margin, y);
  y += 22;
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(11);
  doc.text("Hours by project", margin, y);
  y += 14;
  doc.setFontSize(10);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const pct = segmentDisplayPercent(seg, segments, budgetTotalHours, i);
    const line = `${seg.displayName} (${pct}% of hours): ${seg.summary}`;
    const wrapped = doc.splitTextToSize(line, 520);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 12 + 6;
    if (y > 700) {
      doc.addPage();
      y = 40;
    }
  }
  y += 8;

  for (const seg of segments) {
    if (y > 650) {
      doc.addPage();
      y = 40;
    }
    doc.setFontSize(11);
    doc.text(seg.displayName, margin, y);
    y += 14;
    doc.text("Tasks", margin, y);
    y += 14;
    if (seg.entries.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [["Date", "Notes", "Hours", "Resource"]],
        body: seg.entries.map((e) => [
          e.spent_date,
          (e.notes || "—").slice(0, 50),
          e.hours.toFixed(1),
          firstName(e.user.name),
        ]),
        margin: { left: margin, right: margin },
        theme: "grid",
        styles: { fontSize: 9 },
        headStyles: { fillColor: [240, 240, 240] },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(10);
      doc.text(`${seg.displayName} hours consumed: ${seg.hours.toFixed(1)}`, margin, y);
      y += 20;
    } else {
      doc.setFontSize(10);
      doc.text("No time entries in this period.", margin, y);
      y += 16;
    }
  }

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Total hours consumed: ${budgetTotalHours.toFixed(1)}`, margin, y + 4);
  doc.setFont("helvetica", "normal");
  return doc.output("arraybuffer") as ArrayBuffer;
}

/** Client report HTML. Configurable sections; task tables are emailed as a CSV attachment. */
export function generateReportHtml(report: ReportForPdf, projectName = "Project report"): string {
  return generateReportEmailHtml(report, report.project_name ?? projectName);
}
