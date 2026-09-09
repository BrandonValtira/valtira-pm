import type { BudgetAllocationData } from "@/lib/budget-allocation-report";
import { segmentDisplayPercent } from "@/lib/budget-allocation-report";
import { formatBudgetAmount } from "@/lib/budget-unit";
import { type BudgetBurnSnapshot } from "@/lib/budget-burn-chart";
import {
  budgetReportLabel,
  formatReportTitleLine,
  normalizeReportConfig,
} from "@/lib/report-config";
import {
  buildReportHarvestProjectBlocks,
  formatHoursConsumed,
  type ReportHarvestProjectBlock,
} from "@/lib/report-harvest-blocks";
import { formatDateOnly } from "@/lib/report-week";

export const VALTIRA_LOGO_CID = "valtira-logo";

type HarvestProjectSnapshot = {
  id?: number;
  name?: string;
  client_name?: string | null;
  budget?: number | null;
  cost_budget?: number | null;
  budget_by?: string | null;
  budget_spent?: number | null;
  budget_remaining?: number | null;
  hourly_rate?: number | null;
};

type TimeEntry = {
  hours: number;
  billable_rate?: number | null;
  hourly_rate?: number | null;
  project?: { id?: number; name?: string } | null;
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

function utilizedBody(hours: number): string {
  return `<p style="margin:0;"><strong>${escapeHtml(formatHoursConsumed(hours))}</strong> consumed this period.</p>`;
}

function remainingBody(block: ReportHarvestProjectBlock): string {
  const remaining = block.remaining;
  if (remaining.remaining != null && remaining.total != null) {
    return `<p style="margin:0 0 4px 0;"><strong>${formatBudgetAmount(remaining.remaining, remaining.unit)}</strong> remaining</p>
         <p style="margin:0;color:#6B645C;">of ${formatBudgetAmount(remaining.total, remaining.unit)} total${remaining.hasHarvestBudgetReport ? ` · ${formatBudgetAmount(remaining.spent, remaining.unit)} used to date` : ""}</p>`;
  }
  return `<p style="margin:0;color:#6B645C;">No budget is set in Harvest.</p>`;
}

function consumptionOverviewHtml(block: ReportHarvestProjectBlock): string {
  const burn = block.consumption;
  if (!burn) {
    return `<p style="margin:0;color:#6B645C;">No budget is set in Harvest for this project.</p>`;
  }
  const timeframeCard = (
    title: string,
    amount: number,
    amountUnit: "hours" | "cost",
    budgetLabel: string,
    variance: { label: string; emailColor: string },
    footer?: string
  ) => `
    <td style="padding:14px 16px;background:#ffffff;border:1px solid #E8E2DA;border-radius:8px;vertical-align:top;width:50%;">
      <p style="margin:0 0 6px 0;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#8A8178;">${escapeHtml(title)}</p>
      <p style="margin:0 0 4px 0;"><strong>${formatBudgetAmount(amount, amountUnit)}</strong> utilized · <strong>${budgetLabel}</strong></p>
      <p style="margin:0;color:${variance.emailColor};font-weight:700;">${escapeHtml(variance.label)}</p>
      ${footer ? `<p style="margin:6px 0 0 0;font-size:12px;color:#6B645C;">${footer}</p>` : ""}
    </td>`;

  return `
    <p style="margin:0 0 10px 0;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#8A8178;">Budget consumption</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        ${timeframeCard(
          burn.periodLabel,
          burn.periodActual,
          burn.periodActualUnit,
          `${formatBudgetAmount(burn.periodBudget, burn.unit)} budgeted`,
          burn.periodVariance
        )}
        <td style="width:12px;">&nbsp;</td>
        ${timeframeCard(
          burn.contractDateLabel,
          burn.spentToDate,
          burn.spentToDateUnit,
          `${formatBudgetAmount(burn.totalBudget, burn.unit)} total budget`,
          burn.contractVariance,
          `Expected utilization: ~${formatBudgetAmount(burn.monthlyBudget, burn.unit)}/mo · ~${formatBudgetAmount(burn.weeklyBudget, burn.unit)}/wk`
        )}
      </tr>
    </table>`;
}

function harvestProjectCardsHtml(
  block: ReportHarvestProjectBlock,
  showConsumption: boolean,
  heading: boolean
): string {
  const headingHtml = heading
    ? `<p style="margin:0 0 10px 0;font-size:16px;line-height:1.35;font-weight:700;color:#2A2622;">${escapeHtml(block.name)}</p>`
    : "";
  const cards = showConsumption
    ? `${consumptionOverviewHtml(block)}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:12px;">
        <tr>
          ${cardHtml("Budget remaining", remainingBody(block))}
        </tr>
      </table>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          ${cardHtml("Budget utilized", utilizedBody(block.hours))}
          <td style="width:12px;">&nbsp;</td>
          ${cardHtml("Budget remaining", remainingBody(block))}
        </tr>
      </table>`;
  return `
    <div style="margin:0 0 22px 0;">
      ${headingHtml}
      ${cards}
    </div>`;
}

export function generateReportEmailHtml(
  report: ReportForEmail,
  projectName: string,
  options?: { logoSrc?: string }
): string {
  const config = normalizeReportConfig(report.report_config, report.report_format);
  const snapshot = report.harvest_data_snapshot;
  const entries = snapshot?.timeEntries ?? [];
  const harvestProjects = snapshot?.harvestProjects ?? [];
  const projectNames = snapshot?.harvestProjectNames ?? [];
  const clientNames = Array.from(
    new Set(harvestProjects.map((p) => p.client_name).filter(Boolean))
  ) as string[];
  const blocks = buildReportHarvestProjectBlocks({
    harvestProjects,
    harvestProjectNames: projectNames,
    entries,
    periodType: report.period_type,
    periodEnd: report.period_end,
    budgetBurn: snapshot?.budgetBurn,
  });
  const showProjectHeadings = blocks.length > 1;
  const projectLabel = showProjectHeadings
    ? projectName
    : projectNames.length > 0
      ? projectNames.join(", ")
      : projectName;
  const clientLabel = clientNames.join(", ");
  const titleLine = formatReportTitleLine(clientLabel, projectLabel);
  const reportKind = budgetReportLabel(report.period_type);
  const dateRange = formatReportDateRange(report.period_start, report.period_end);
  const showConsumption = config.components.budgetConsumption;

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
        ${blocks
          .map((block) => {
            const heading =
              showProjectHeadings && block.name
                ? `<p style="margin:0 0 4px 0;font-weight:700;">${escapeHtml(block.name)}</p>`
                : "";
            return `<div style="margin:0 0 12px 0;">
              ${heading}
              <p style="margin:0 0 4px 0;"><strong>Total hours:</strong> ${block.hours.toFixed(1)}</p>
              ${
                block.spentFundsEstimate > 0
                  ? `<p style="margin:0 0 4px 0;"><strong>Period total:</strong> ${money(block.spentFundsEstimate)} (est.)</p>`
                  : ""
              }
              ${
                block.costBudget != null
                  ? `<p style="margin:0;color:#6B645C;">Contract funds budget: ${money(block.costBudget)}</p>`
                  : ""
              }
            </div>`;
          })
          .join("")}
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
            ${blocks.map((block) => harvestProjectCardsHtml(block, showConsumption, showProjectHeadings)).join("")}
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
