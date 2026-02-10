import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

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
  harvest_data_snapshot?: {
    timeEntries?: TimeEntry[];
    harvestProjectNames?: string[];
    harvestProjects?: HarvestProjectSnapshot[];
  } | null;
};

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatMonthRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return s.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function firstName(fullName: string): string {
  const part = fullName.trim().split(/\s+/)[0];
  return part ?? fullName;
}

/**
 * Generate a PDF buffer for the given report (for email attachment).
 */
export function generateReportPdf(report: ReportForPdf): ArrayBuffer {
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
      : `Week: ${formatDate(report.period_start)} – ${formatDate(report.period_end)}`;
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
