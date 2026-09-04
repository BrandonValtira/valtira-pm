import type { BudgetAllocationData } from "@/lib/budget-allocation-report";
import { segmentDisplayPercent } from "@/lib/budget-allocation-report";
import {
  buildBudgetBurnDisplay,
  type BudgetBurnSnapshot,
} from "@/lib/budget-burn-chart";
import {
  budgetReportLabel,
  formatReportTitleLine,
  normalizeReportConfig,
} from "@/lib/report-config";
import { formatDateOnly } from "@/lib/report-week";

export const VALTIRA_LOGO_CID = "valtira-logo";

type HarvestProjectSnapshot = {
  client_name?: string | null;
  budget?: number | null;
  cost_budget?: number | null;
  budget_spent?: number | null;
  budget_remaining?: number | null;
  hourly_rate?: number | null;
};

type TimeEntry = {
  hours: number;
};

export type ReportForEmail = {
  period_type: string;
  period_start: string;
  period_end: string;
  report_format?: string | null;
  report_config?: unknown;
  harvest_data_snapshot?: {
    reportFormat?: string;
    timeEntries?: TimeEntry[];
    harvestProjectNames?: string[];
    harvestProjects?: HarvestProjectSnapshot[];
    budgetAllocation?: BudgetAllocationData;
    budgetBurn?: BudgetBurnSnapshot | null;
  } | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatReportDateRange(start: string, end: string): string {
  return `${formatDateOnly(String(start).slice(0, 10))} – ${formatDateOnly(String(end).slice(0, 10))}`;
}

export function formatReportPeriodLabel(periodType: string, start: string, end: string): string {
  return `${budgetReportLabel(periodType)} · ${formatReportDateRange(start, end)}`;
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function cardHtml(title: string, body: string): string {
  return `
    <td style="padding:14px 16px;background:#ffffff;border:1px solid #E8E2DA;border-radius:8px;vertical-align:top;width:50%;">
      <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#8A8178;">${escapeHtml(title)}</p>
      <div style="font-size:14px;line-height:1.5;color:#2A2622;">${body}</div>
    </td>`;
}

export function generateReportEmailHtml(
  report: ReportForEmail,
  projectName: string,
  options?: { logoSrc?: string }
): string {
  const config = normalizeReportConfig(report.report_config, report.report_format);
  const snapshot = report.harvest_data_snapshot;
  const entries = snapshot?.timeEntries ?? [];
  const totalHours = entries.reduce((s, e) => s + e.hours, 0);
  const harvestProjects = snapshot?.harvestProjects ?? [];
  const projectNames = snapshot?.harvestProjectNames ?? [];
  const clientNames = Array.from(
    new Set(harvestProjects.map((p) => p.client_name).filter(Boolean))
  ) as string[];
  const projectLabel = projectNames.length > 0 ? projectNames.join(", ") : projectName;
  const clientLabel = clientNames.join(", ");
  const titleLine = formatReportTitleLine(clientLabel, projectLabel);
  const reportKind = budgetReportLabel(report.period_type);
  const dateRange = formatReportDateRange(report.period_start, report.period_end);

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

  const burnPeriodType = report.period_type === "month" ? "month" : "week";
  const burnDisplay = buildBudgetBurnDisplay({
    budgetBurn: snapshot?.budgetBurn,
    harvestProjects: harvestProjects.map((p) => ({
      budget: p.budget ?? null,
      budget_spent: p.budget_spent,
    })),
    harvestProjectNames: projectNames,
    periodType: burnPeriodType,
    periodEnd: report.period_end,
    periodHours: snapshot?.budgetAllocation?.totalHours ?? totalHours,
  });

  const remainingHours = hasBudgetReport
    ? totalBudgetRemaining
    : totalBudgetHours != null
      ? Math.max(0, totalBudgetHours - totalBudgetSpent)
      : null;

  const consumptionBody = burnDisplay
    ? `<p style="margin:0 0 4px 0;"><strong>${burnDisplay.periodActual.toFixed(1)}h</strong> used · <strong>${burnDisplay.periodBudget.toFixed(1)}h</strong> budgeted</p>
       <p style="margin:0;color:${burnDisplay.periodVariance.emailColor};font-weight:700;">${escapeHtml(burnDisplay.periodVariance.label)}</p>`
    : `<p style="margin:0;">${totalHours.toFixed(1)} hours logged this period.</p>`;

  const remainingBody =
    remainingHours != null && totalBudgetHours != null
      ? `<p style="margin:0 0 4px 0;"><strong>${remainingHours.toFixed(1)}h</strong> remaining</p>
         <p style="margin:0;color:#6B645C;">of ${totalBudgetHours.toFixed(1)}h total${hasBudgetReport ? ` · ${totalBudgetSpent.toFixed(1)}h used to date` : ""}</p>`
      : `<p style="margin:0;color:#6B645C;">No hour budget is set in Harvest.</p>`;

  const allocation = snapshot?.budgetAllocation;
  const segments = allocation?.segments ?? [];
  const summaryHtml =
    config.components.projectSummary
      ? `
        <div style="margin:22px 0 0 0;">
          <p style="margin:0 0 10px 0;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#8A8178;">Hours by project</p>
          ${
            segments.length === 0
              ? `<p style="margin:0;color:#6B645C;">No time entries in this period.</p>`
              : segments
                  .map(
                    (seg, index) =>
                      `<p style="margin:0 0 10px 0;"><strong>${escapeHtml(seg.displayName)} (${segmentDisplayPercent(seg, segments, allocation?.totalHours ?? 0, index)}% of hours):</strong> ${escapeHtml(seg.summary)}</p>`
                  )
                  .join("")
          }
          <p style="margin:12px 0 0 0;font-size:12px;line-height:1.5;color:#8A8178;font-style:italic;">Valtira project managers review entered hours regularly and may shift time to the correct project.</p>
        </div>`
      : "";

  const financialHtml = config.components.financialSummary
    ? `
      <div style="margin:22px 0 0 0;">
        <p style="margin:0 0 10px 0;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#8A8178;">Financial summary</p>
        <p style="margin:0 0 4px 0;"><strong>Total hours:</strong> ${totalHours.toFixed(1)}</p>
        ${
          spentFundsEstimate > 0
            ? `<p style="margin:0 0 4px 0;"><strong>Period total:</strong> ${money(spentFundsEstimate)} (est.)</p>`
            : ""
        }
        ${
          totalCostBudget != null && totalCostBudget > 0
            ? `<p style="margin:0;color:#6B645C;">Contract funds budget: ${money(totalCostBudget)}</p>`
            : ""
        }
      </div>`
    : "";

  const additionalHtml =
    config.components.additionalInfo && config.additionalInfoText.trim()
      ? `
        <div style="margin:22px 0 0 0;padding:14px 16px;background:#FBF7F2;border:1px solid #E8E2DA;border-radius:8px;">
          <p style="margin:0 0 8px 0;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#8A8178;">Additional information</p>
          <p style="margin:0;white-space:pre-wrap;">${escapeHtml(config.additionalInfoText.trim())}</p>
        </div>`
      : "";

  const taskNote = config.components.taskDetail
    ? `<p style="margin:22px 0 0 0;font-size:14px;color:#6B645C;">Task details for this period are attached as a spreadsheet.</p>`
    : "";

  const footerHtml = config.components.footer
    ? `<p style="margin:28px 0 0 0;font-size:14px;color:#2A2622;">
        ${escapeHtml(config.footerName || "Valtira")}
        ${config.footerTitle ? `<br /><span style="color:#6B645C;">${escapeHtml(config.footerTitle)}</span>` : ""}
       </p>`
    : "";

  const logoSrc = options?.logoSrc ?? `cid:${VALTIRA_LOGO_CID}`;

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F6F3EE;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;background:#ffffff;border:1px solid #E8E2DA;border-radius:12px;">
        <tr>
          <td style="padding:28px 32px 8px 32px;">
            <img src="${logoSrc}" alt="Valtira" width="140" height="49" style="display:block;border:0;outline:none;text-decoration:none;height:49px;width:140px;" />
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 8px 32px;font-family:Arial,Helvetica,sans-serif;color:#2A2622;">
            <p style="margin:0 0 6px 0;font-size:20px;line-height:1.35;font-weight:700;">${escapeHtml(titleLine)}</p>
            <p style="margin:0 0 4px 0;font-size:16px;line-height:1.4;font-weight:600;">${escapeHtml(reportKind)}</p>
            <p style="margin:0;font-size:14px;color:#6B645C;">${escapeHtml(dateRange)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0 32px;font-family:Arial,Helvetica,sans-serif;color:#2A2622;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                ${cardHtml("Budget consumption", consumptionBody)}
                <td style="width:12px;">&nbsp;</td>
                ${cardHtml("Budget remaining", remainingBody)}
              </tr>
            </table>
            ${summaryHtml}
            ${financialHtml}
            ${additionalHtml}
            ${taskNote}
            ${footerHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px 32px 32px;font-family:Arial,Helvetica,sans-serif;">
            <p style="margin:0;font-size:12px;line-height:1.5;color:#8A8178;">Questions? Reply to this email.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}
