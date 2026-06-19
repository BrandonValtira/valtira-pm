import type { HarvestTimeEntry } from "@/lib/harvest";

export type BudgetBurnChartPoint = {
  weekEnd: string;
  /** Null for future weeks — actual line stops at the as-of date. */
  actualCumulative: number | null;
  targetCumulative: number;
};

export type BudgetBurnSnapshot = {
  totalBudgetHours: number;
  contractStart: string;
  contractEnd: string;
  contractWeeks: number;
  weeklyBudgetHours: number;
  monthlyBudgetHours: number;
  points: BudgetBurnChartPoint[];
  periodBudgetHours: number;
  periodActualHours: number;
  cumulativeSpentThroughPeriod: number;
};

type HarvestProjectBudget = {
  budget: number | null;
  budget_spent?: number | null;
  starts_on?: string | null;
  ends_on?: string | null;
  name?: string;
};

export type HarvestProjectContractDates = {
  starts_on?: string | null;
  ends_on?: string | null;
  name?: string;
};

export type BudgetBurnDisplayVariance = {
  label: string;
  emailColor: string;
};

export type BudgetBurnDisplay = {
  periodLabel: string;
  periodActual: number;
  periodBudget: number;
  periodVariance: BudgetBurnDisplayVariance;
  contractDateLabel: string;
  spentToDate: number;
  totalBudget: number;
  contractVariance: BudgetBurnDisplayVariance;
  monthlyBudget: number;
  weeklyBudget: number;
};

export function harvestBudgetSpentToDate(harvestProjects: HarvestProjectBudget[]): number {
  return harvestProjects.reduce((sum, p) => sum + (p.budget_spent ?? 0), 0);
}

export function budgetVarianceDisplay(
  actual: number,
  budget: number
): BudgetBurnDisplayVariance {
  if (budget <= 0) {
    return { label: "—", emailColor: "#525252" };
  }
  const delta = Math.round(((actual - budget) / budget) * 100);
  if (delta > 0) {
    return { label: `+${delta}% above budget`, emailColor: "#b91c1c" };
  }
  if (delta < 0) {
    return { label: `${delta}% below budget`, emailColor: "#15803d" };
  }
  return { label: "On budget", emailColor: "#15803d" };
}

export function buildBudgetBurnDisplay(params: {
  budgetBurn?: BudgetBurnSnapshot | null;
  harvestProjects: HarvestProjectBudget[];
  harvestProjectNames: string[];
  periodType: "week" | "month";
  periodEnd: string;
  periodHours: number;
}): BudgetBurnDisplay | null {
  const {
    budgetBurn: burn,
    harvestProjects,
    harvestProjectNames,
    periodType,
    periodEnd,
    periodHours,
  } = params;

  const fallback = !burn
    ? budgetBurnFromHarvestProjects(harvestProjects, periodType, periodHours)
    : null;
  const totalBudget = burn?.totalBudgetHours ?? fallback?.totalBudgetHours ?? 0;
  if (totalBudget <= 0) return null;

  const periodLabel = periodType === "month" ? "Last month" : "Last week";
  const periodBudget = burn?.periodBudgetHours ?? fallback?.periodBudgetHours ?? 0;
  const periodActual = burn?.periodActualHours ?? periodHours;
  const spentToDate = burn?.cumulativeSpentThroughPeriod ?? harvestBudgetSpentToDate(harvestProjects);

  const contractStart = burn?.contractStart;
  const contractEnd = burn?.contractEnd;
  const resolvedExpiry = resolveContractExpiryDate(null, harvestProjectNames);
  const contractBounds =
    contractStart && contractEnd
      ? { start: contractStart, end: contractEnd }
      : resolvedExpiry
        ? getContractBounds(resolvedExpiry, periodEnd)
        : null;
  const contractDateLabel = contractBounds
    ? formatContractDateRange(contractBounds.start, contractBounds.end)
    : "Contract";
  const contractTargetToDate =
    burn && contractBounds
      ? contractTargetHoursToDate(
          totalBudget,
          contractBounds.start,
          contractBounds.end,
          periodEnd
        )
      : contractBounds
        ? contractTargetHoursToDate(
            totalBudget,
            contractBounds.start,
            contractBounds.end,
            periodEnd
          )
        : 0;

  return {
    periodLabel,
    periodActual,
    periodBudget,
    periodVariance: budgetVarianceDisplay(periodActual, periodBudget),
    contractDateLabel,
    spentToDate,
    totalBudget,
    contractVariance: budgetVarianceDisplay(spentToDate, contractTargetToDate),
    monthlyBudget: burn?.monthlyBudgetHours ?? fallback?.monthlyBudgetHours ?? totalBudget / 12,
    weeklyBudget: burn?.weeklyBudgetHours ?? fallback?.weeklyBudgetHours ?? totalBudget / 52,
  };
}

/** Table-based HTML for Gmail and other email clients (inline styles only). */
export function generateBudgetBurnEmailHtml(display: BudgetBurnDisplay): string {
  const cardCell = (
    title: string,
    burned: number,
    budgetLine: string,
    variance: BudgetBurnDisplayVariance,
    footer?: string
  ) => `
    <td style="padding:10px 12px;background-color:#ffffff;border:1px solid #e5e5e5;vertical-align:top;font-family:Arial,Helvetica,sans-serif;">
      <p style="margin:0 0 8px 0;font-size:11px;font-weight:bold;color:#737373;text-transform:uppercase;letter-spacing:0.03em;">${title}</p>
      <p style="margin:0 0 6px 0;font-size:14px;line-height:1.4;color:#111111;">
        <strong>${burned.toFixed(1)}h</strong> burned &middot; ${budgetLine}
      </p>
      <p style="margin:0;font-size:12px;line-height:1.4;color:${variance.emailColor};font-weight:bold;">${variance.label}</p>
      ${footer ? `<p style="margin:6px 0 0 0;font-size:12px;line-height:1.4;color:#525252;">${footer}</p>` : ""}
    </td>`;

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:16px 0;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td style="padding:12px;background-color:#f5f5f5;border:1px solid #e5e5e5;">
      <p style="margin:0 0 12px 0;font-size:14px;font-weight:bold;color:#111111;">Budget consumption</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          ${cardCell(
            display.periodLabel,
            display.periodActual,
            `<strong>${display.periodBudget.toFixed(1)}h</strong> budgeted`,
            display.periodVariance
          )}
        </tr>
        <tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          ${cardCell(
            display.contractDateLabel,
            display.spentToDate,
            `<strong>${display.totalBudget.toFixed(1)}h</strong> total budget`,
            display.contractVariance,
            `Expected burn: ~${display.monthlyBudget.toFixed(1)}h/mo &middot; ~${display.weeklyBudget.toFixed(1)}h/wk`
          )}
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function parseYmd(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Sunday of the Harvest week (Sun–Sat) containing dateStr. */
export function weekStartSunday(dateStr: string): string {
  const date = parseYmd(dateStr);
  const day = date.getDay();
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - day);
  return formatYmd(sunday);
}

/** Saturday ending the Harvest week containing dateStr. */
export function weekEndSaturday(dateStr: string): string {
  const sunday = parseYmd(weekStartSunday(dateStr));
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return formatYmd(saturday);
}

const MONTH_PARSE: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

/** e.g. "HSoA Support (May 2026-Apr 2027)" → { start: 2026-05-01, end: 2027-04-30 } */
export function parseContractRangeFromLabel(text: string): { start: string; end: string } | null {
  const match = text.match(
    /([A-Za-z]{3,9})\s+(\d{4})\s*[-–]\s*([A-Za-z]{3,9})\s+(\d{4})/
  );
  if (!match) return null;
  const startMonth = MONTH_PARSE[match[1].toLowerCase()];
  const startYear = Number(match[2]);
  const endMonth = MONTH_PARSE[match[3].toLowerCase()];
  const endYear = Number(match[4]);
  if (!startMonth || !endMonth || !startYear || !endYear) return null;
  return {
    start: formatYmd(new Date(startYear, startMonth - 1, 1)),
    end: formatYmd(new Date(endYear, endMonth, 0)),
  };
}

/** e.g. "HSoA Support (May 2026-Apr 2027)" → 2027-04-30 */
export function parseContractEndFromLabel(text: string): string | null {
  const match = text.match(
    /[A-Za-z]{3,9}\s+\d{4}\s*[-–]\s*([A-Za-z]{3,9})\s+(\d{4})/
  );
  if (!match) return null;
  const month = MONTH_PARSE[match[1].toLowerCase()];
  const year = Number(match[2]);
  if (!month || !year) return null;
  const lastDay = new Date(year, month, 0);
  return formatYmd(lastDay);
}

export function resolveContractExpiryDate(
  contractExpiryDate: string | null | undefined,
  harvestProjectNames: string[]
): string | null {
  if (contractExpiryDate?.slice(0, 10)) return contractExpiryDate.slice(0, 10);
  for (const name of harvestProjectNames) {
    const parsed = parseContractEndFromLabel(name);
    if (parsed) return parsed;
  }
  return null;
}

/** 12-month contract window ending on contract expiry (or report period end). */
export function getContractBounds(
  contractExpiryDate: string | null | undefined,
  anchorEnd: string
): { start: string; end: string } {
  const end = (contractExpiryDate?.slice(0, 10) || anchorEnd.slice(0, 10)) as string;
  const endDate = parseYmd(end);
  const startDate = new Date(endDate);
  startDate.setFullYear(startDate.getFullYear() - 1);
  startDate.setDate(startDate.getDate() + 1);
  return { start: formatYmd(startDate), end };
}

function minYmd(dates: string[]): string {
  return dates.reduce((a, b) => (parseYmd(a) <= parseYmd(b) ? a : b));
}

function maxYmd(dates: string[]): string {
  return dates.reduce((a, b) => (parseYmd(a) >= parseYmd(b) ? a : b));
}

/** Contract window from Harvest starts_on/ends_on (union across linked projects), with name/DB fallbacks. */
export function resolveContractBoundsFromHarvest(
  projects: HarvestProjectContractDates[],
  contractExpiryDate: string | null | undefined,
  harvestProjectNames: string[],
  anchorEnd: string
): { start: string; end: string } {
  const starts: string[] = [];
  const ends: string[] = [];

  for (const p of projects) {
    if (p.starts_on?.slice(0, 10)) starts.push(p.starts_on.slice(0, 10));
    if (p.ends_on?.slice(0, 10)) ends.push(p.ends_on.slice(0, 10));
    if (p.name) {
      const range = parseContractRangeFromLabel(p.name);
      if (range) {
        starts.push(range.start);
        ends.push(range.end);
      } else {
        const endOnly = parseContractEndFromLabel(p.name);
        if (endOnly) ends.push(endOnly);
      }
    }
  }

  for (const name of harvestProjectNames) {
    const range = parseContractRangeFromLabel(name);
    if (range) {
      starts.push(range.start);
      ends.push(range.end);
    } else {
      const endOnly = parseContractEndFromLabel(name);
      if (endOnly) ends.push(endOnly);
    }
  }

  if (contractExpiryDate?.slice(0, 10)) {
    ends.push(contractExpiryDate.slice(0, 10));
  }

  const end =
    ends.length > 0 ? maxYmd(ends) : (contractExpiryDate?.slice(0, 10) || anchorEnd.slice(0, 10));

  let start: string;
  if (starts.length > 0) {
    start = minYmd(starts);
  } else {
    start = getContractBounds(end, end).start;
  }

  if (parseYmd(start) > parseYmd(end)) {
    start = getContractBounds(end, end).start;
  }

  return { start, end };
}

const LONG_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** e.g. 2026-05-01 & 2027-04-30 → "May 2026 – April 2027" */
export function formatContractDateRange(contractStart: string, contractEnd: string): string {
  const [sy, sm] = contractStart.slice(0, 10).split("-").map(Number);
  const [ey, em] = contractEnd.slice(0, 10).split("-").map(Number);
  if (sm < 1 || sm > 12 || em < 1 || em > 12) {
    return `${contractStart.slice(0, 10)} – ${contractEnd.slice(0, 10)}`;
  }
  return `${LONG_MONTH_NAMES[sm - 1]} ${sy} – ${LONG_MONTH_NAMES[em - 1]} ${ey}`;
}

/** Expected cumulative hours consumed by throughDate on a linear contract pace. */
export function contractTargetHoursToDate(
  totalBudgetHours: number,
  contractStart: string,
  contractEnd: string,
  throughDate: string
): number {
  const start = parseYmd(contractStart).getTime();
  const end = parseYmd(contractEnd).getTime();
  const through = parseYmd(throughDate.slice(0, 10)).getTime();
  if (end <= start) return totalBudgetHours;
  const fraction = Math.min(1, Math.max(0, (through - start) / (end - start)));
  return totalBudgetHours * fraction;
}

function enumerateWeekEnds(contractStart: string, throughDate: string): string[] {
  const ends: string[] = [];
  let cursor = weekEndSaturday(contractStart);
  const last = weekEndSaturday(throughDate);
  while (parseYmd(cursor) <= parseYmd(last)) {
    ends.push(cursor);
    const d = parseYmd(cursor);
    d.setDate(d.getDate() + 7);
    cursor = formatYmd(d);
  }
  return ends.length > 0 ? ends : [last];
}

export function buildBudgetBurnSnapshot(
  entries: Pick<HarvestTimeEntry, "spent_date" | "hours">[],
  harvestProjects: HarvestProjectBudget[],
  periodType: "week" | "month",
  periodStart: string,
  periodEnd: string,
  contractExpiryDate?: string | null,
  harvestProjectNames: string[] = [],
  /** Last date for actual burn on the chart (default: report period end). Use today for live dashboards. */
  chartAsOfDate?: string
): BudgetBurnSnapshot | null {
  const totalBudgetHours = harvestProjects.reduce((sum, p) => sum + (p.budget ?? 0), 0);
  if (totalBudgetHours <= 0) return null;

  const { start: contractStart, end: contractEnd } = resolveContractBoundsFromHarvest(
    harvestProjects,
    contractExpiryDate,
    harvestProjectNames,
    periodEnd
  );

  const asOfDate = (chartAsOfDate ?? periodEnd).slice(0, 10);
  const actualThrough =
    parseYmd(asOfDate) <= parseYmd(contractEnd) ? asOfDate : contractEnd;

  const contractWeeks = Math.max(
    1,
    enumerateWeekEnds(contractStart, contractEnd).length
  );
  const weeklyBudgetHours = totalBudgetHours / contractWeeks;
  const monthlyBudgetHours = totalBudgetHours / 12;

  const hoursByWeekEnd = new Map<string, number>();
  for (const entry of entries) {
    const day = entry.spent_date.slice(0, 10);
    if (day < contractStart || day > actualThrough) continue;
    const we = weekEndSaturday(day);
    hoursByWeekEnd.set(we, (hoursByWeekEnd.get(we) ?? 0) + entry.hours);
  }

  const fullWeekEnds = enumerateWeekEnds(contractStart, contractEnd);
  const actualWeekEnds = new Set(enumerateWeekEnds(contractStart, actualThrough));

  let cumulative = 0;
  const points: BudgetBurnChartPoint[] = fullWeekEnds.map((weekEnd, index) => {
    if (actualWeekEnds.has(weekEnd)) {
      cumulative += hoursByWeekEnd.get(weekEnd) ?? 0;
    }
    return {
      weekEnd,
      actualCumulative: actualWeekEnds.has(weekEnd) ? cumulative : null,
      targetCumulative: weeklyBudgetHours * (index + 1),
    };
  });

  const periodActualHours = entries
    .filter((e) => {
      const d = e.spent_date.slice(0, 10);
      return d >= periodStart.slice(0, 10) && d <= periodEnd.slice(0, 10);
    })
    .reduce((sum, e) => sum + e.hours, 0);

  const periodBudgetHours =
    periodType === "month" ? monthlyBudgetHours : weeklyBudgetHours;

  const lastActualPoint = [...points].reverse().find((p) => p.actualCumulative != null);
  const cumulativeSpentThroughPeriod =
    lastActualPoint?.actualCumulative ??
    entries
      .filter((e) => {
        const d = e.spent_date.slice(0, 10);
        return d >= contractStart && d <= actualThrough;
      })
      .reduce((sum, e) => sum + e.hours, 0);

  return {
    totalBudgetHours,
    contractStart,
    contractEnd,
    contractWeeks,
    weeklyBudgetHours,
    monthlyBudgetHours,
    points,
    periodBudgetHours,
    periodActualHours,
    cumulativeSpentThroughPeriod,
  };
}

/** Fallback for snapshots saved before budgetBurn was added. */
export function budgetBurnFromHarvestProjects(
  harvestProjects: HarvestProjectBudget[],
  periodType: "week" | "month",
  periodActualHours: number
): Pick<
  BudgetBurnSnapshot,
  "totalBudgetHours" | "weeklyBudgetHours" | "monthlyBudgetHours" | "periodBudgetHours" | "periodActualHours"
> | null {
  const totalBudgetHours = harvestProjects.reduce((sum, p) => sum + (p.budget ?? 0), 0);
  if (totalBudgetHours <= 0) return null;
  const weeklyBudgetHours = totalBudgetHours / 52;
  const monthlyBudgetHours = totalBudgetHours / 12;
  return {
    totalBudgetHours,
    weeklyBudgetHours,
    monthlyBudgetHours,
    periodBudgetHours: periodType === "month" ? monthlyBudgetHours : weeklyBudgetHours,
    periodActualHours,
  };
}
