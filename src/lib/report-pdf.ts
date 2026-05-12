import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
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
  harvest_data_snapshot?: {
    timeEntries?: TimeEntry[];
    harvestProjectNames?: string[];
    harvestProjects?: HarvestProjectSnapshot[];
  } | null;
};

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

/** Same report content as PDF, as HTML for email body (no attachment). */
export function generateReportHtml(report: ReportForPdf): string {
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

  const clientNames = Array.from(new Set(harvestProjects.map((p) => p.client_name).filter(Boolean))) as string[];
  const clientLabel = clientNames.length > 0 ? clientNames.join(", ") : null;
  const projectLabel = projectNames.length > 0 ? projectNames.join(", ") : "Harvest project";
  const titleLine = [clientLabel, projectLabel].filter(Boolean).join(" · ");

  const periodLabel =
    report.period_type === "month"
      ? `Month: ${formatMonthRange(report.period_start, report.period_end)}`
      : `Week: ${formatDateOnly(report.period_start)} – ${formatDateOnly(report.period_end)}`;

  let budgetHtml = "";
  if (totalBudgetHours != null) {
    if (hasBudgetReport) {
      budgetHtml += `<p><strong>Hours:</strong> ${totalBudgetSpent.toFixed(1)} consumed, ${totalBudgetRemaining.toFixed(1)} left in budget</p>`;
      budgetHtml += `<p><strong>Total budget:</strong> ${totalBudgetHours.toFixed(1)} hours</p>`;
    } else {
      const hoursLeft = Math.max(0, totalBudgetHours - totalHours);
      budgetHtml += `<p><strong>Hours:</strong> ${hoursLeft.toFixed(1)} left out of ${totalBudgetHours.toFixed(1)} total</p>`;
    }
    budgetHtml += `<p><strong>Hours this period:</strong> ${totalHours.toFixed(1)}</p>`;
  }
  if (totalCostBudget != null && totalCostBudget > 0) {
    budgetHtml += `<p><strong>Funds:</strong> $${totalCostBudget.toLocaleString()} total budget</p>`;
    budgetHtml += `<p><strong>Spent this period:</strong> $${spentFundsEstimate.toFixed(2)} (est.)</p>`;
  }
  if (!totalBudgetHours && !totalCostBudget) {
    budgetHtml += "<p>No budget set in Harvest for this project.</p>";
  }

  let tasksHtml = "";
  if (entries.length > 0) {
    tasksHtml = `
    <table style="border-collapse:collapse;width:100%;max-width:560px;margin-top:8px;" cellpadding="6" cellspacing="0" border="1">
      <thead>
        <tr style="background:#f0f0f0;">
          <th style="text-align:left;">Date</th>
          <th style="text-align:left;">Notes</th>
          <th style="text-align:right;">Hours</th>
          <th style="text-align:left;">Resource</th>
        </tr>
      </thead>
      <tbody>
        ${entries
          .map(
            (e) =>
              `<tr>
                <td>${e.spent_date}</td>
                <td>${escapeHtml((e.notes || "—").slice(0, 80))}</td>
                <td style="text-align:right;">${e.hours.toFixed(1)}</td>
                <td>${escapeHtml(firstName(e.user.name))}</td>
              </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
  } else {
    tasksHtml = "<p>No time entries in this period.</p>";
  }

  return `
<div style="font-family:sans-serif;font-size:14px;line-height:1.5;color:#111;">
  <p style="font-size:16px;font-weight:600;margin:0 0 4px 0;">${escapeHtml(titleLine)}</p>
  <p style="font-size:12px;color:#666;margin:0 0 16px 0;">${escapeHtml(periodLabel)}</p>
  <p style="font-weight:600;margin:0 0 6px 0;">Budget</p>
  <div style="margin-bottom:16px;">${budgetHtml || ""}</div>
  <p style="font-weight:600;margin:0 0 6px 0;">Tasks</p>
  ${tasksHtml}
  <p style="margin-top:12px;"><strong>Total hours consumed:</strong> ${totalHours.toFixed(1)}</p>
</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
