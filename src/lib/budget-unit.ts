import { isHarvestCostBudget, isHarvestHourBudget } from "@/lib/harvest";

export type BudgetUnit = "hours" | "cost";
export type BudgetTracking = "hours" | "cost" | "none";

export type HarvestBudgetFields = {
  budget?: number | null;
  cost_budget?: number | null;
  budget_by?: string | null;
  budget_spent?: number | null;
  budget_remaining?: number | null;
  hourly_rate?: number | null;
};

export type TimeEntryRateFields = {
  hours: number;
  billable_rate?: number | null;
  hourly_rate?: number | null;
};

export function resolveHarvestBudgetTracking(
  projects: Pick<HarvestBudgetFields, "budget" | "cost_budget" | "budget_by">[]
): BudgetTracking {
  const withBudget = projects.filter((p) => (p.budget ?? 0) > 0 || (p.cost_budget ?? 0) > 0);
  if (withBudget.length === 0) return "none";
  if (withBudget.some((p) => isHarvestCostBudget(p.budget_by))) return "cost";
  if (withBudget.every((p) => isHarvestHourBudget(p.budget_by))) return "hours";
  if (withBudget.every((p) => !p.budget_by) && withBudget.some((p) => (p.cost_budget ?? 0) > 0)) {
    return "cost";
  }
  if (withBudget.some((p) => isHarvestHourBudget(p.budget_by) || (p.budget ?? 0) > 0)) {
    return "hours";
  }
  return "none";
}

export function projectBudgetAmount(
  project: Pick<HarvestBudgetFields, "budget" | "cost_budget" | "budget_by">,
  unit: BudgetUnit
): number {
  if (unit === "cost") {
    return project.cost_budget ?? project.budget ?? 0;
  }
  return project.budget ?? 0;
}

export function formatBudgetAmount(value: number, unit: BudgetUnit, currency = "USD"): string {
  if (unit === "cost") {
    return value.toLocaleString("en-US", { style: "currency", currency });
  }
  return `${value.toFixed(1)}h`;
}

export function averageProjectHourlyRate(
  projects: Pick<HarvestBudgetFields, "hourly_rate">[]
): number {
  const rates = projects
    .map((p) => p.hourly_rate)
    .filter((rate): rate is number => rate != null && rate > 0);
  if (rates.length === 0) return 0;
  return rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
}

/** Convert logged hours to fees using entry rates, then project rate. */
export function estimateHoursCost(
  hours: number,
  entries: TimeEntryRateFields[],
  fallbackHourlyRate: number
): number | null {
  const fromEntries = entries.reduce((sum, entry) => {
    const rate = entry.billable_rate ?? entry.hourly_rate ?? 0;
    return sum + entry.hours * rate;
  }, 0);
  if (fromEntries > 0) return fromEntries;
  if (fallbackHourlyRate > 0 && hours > 0) return hours * fallbackHourlyRate;
  return null;
}

export type BudgetRemainingDisplay = {
  unit: BudgetUnit;
  remaining: number | null;
  total: number | null;
  spent: number;
  hasHarvestBudgetReport: boolean;
  hasBudget: boolean;
};

export function buildBudgetRemainingDisplay(
  projects: HarvestBudgetFields[]
): BudgetRemainingDisplay {
  const tracking = resolveHarvestBudgetTracking(projects);
  const unit: BudgetUnit = tracking === "cost" ? "cost" : "hours";
  const total = projects.reduce((sum, project) => sum + projectBudgetAmount(project, unit), 0);
  const spent = projects.reduce((sum, project) => sum + (project.budget_spent ?? 0), 0);
  const remainingFromHarvest = projects.reduce(
    (sum, project) => sum + (project.budget_remaining ?? 0),
    0
  );
  const hasHarvestBudgetReport = projects.some(
    (project) => project.budget_spent != null || project.budget_remaining != null
  );
  const remaining = hasHarvestBudgetReport
    ? remainingFromHarvest
    : total > 0
      ? Math.max(0, total - spent)
      : null;

  return {
    unit,
    remaining,
    total: total > 0 ? total : null,
    spent,
    hasHarvestBudgetReport,
    hasBudget: tracking !== "none" && total > 0,
  };
}
