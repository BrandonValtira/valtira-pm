import {
  buildBudgetBurnDisplay,
  type BudgetBurnDisplay,
  type BudgetBurnSnapshot,
} from "@/lib/budget-burn-chart";
import {
  buildBudgetRemainingDisplay,
  estimateHoursCost,
  type BudgetRemainingDisplay,
} from "@/lib/budget-unit";

export type ReportBlockTimeEntry = {
  hours: number;
  billable_rate?: number | null;
  hourly_rate?: number | null;
  project?: { id?: number; name?: string } | null;
};

export type ReportBlockHarvestProject = {
  id?: number;
  name?: string;
  client_name?: string | null;
  budget?: number | null;
  cost_budget?: number | null;
  budget_by?: string | null;
  budget_spent?: number | null;
  budget_remaining?: number | null;
  hourly_rate?: number | null;
  starts_on?: string | null;
  ends_on?: string | null;
};

export type ReportHarvestProjectBlock = {
  key: string;
  name: string;
  hours: number;
  entries: ReportBlockTimeEntry[];
  harvestProject: ReportBlockHarvestProject | null;
  remaining: BudgetRemainingDisplay;
  consumption: BudgetBurnDisplay | null;
  costBudget: number | null;
  spentFundsEstimate: number;
};

function entryMatchesProject(entry: ReportBlockTimeEntry, project: ReportBlockHarvestProject): boolean {
  if (project.id != null && entry.project?.id != null) return entry.project.id === project.id;
  const projectName = project.name?.trim();
  const entryName = entry.project?.name?.trim();
  if (projectName && entryName) return projectName === entryName;
  return false;
}

function resolveProjects(
  harvestProjects: ReportBlockHarvestProject[],
  harvestProjectNames: string[]
): ReportBlockHarvestProject[] {
  if (harvestProjects.length > 0) return harvestProjects;
  return harvestProjectNames
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

function buildBlock(
  key: string,
  name: string,
  harvestProject: ReportBlockHarvestProject | null,
  entries: ReportBlockTimeEntry[],
  periodType: string,
  periodEnd: string,
  budgetBurn?: BudgetBurnSnapshot | null
): ReportHarvestProjectBlock {
  const hours = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const projects = harvestProject ? [harvestProject] : [];
  const remaining = buildBudgetRemainingDisplay(projects);
  const names = harvestProject?.name ? [harvestProject.name] : [];
  const consumption =
    harvestProject || budgetBurn
      ? buildBudgetBurnDisplay({
          budgetBurn: budgetBurn ?? null,
          harvestProjects: projects,
          harvestProjectNames: names,
          periodType: periodType === "month" ? "month" : "week",
          periodEnd,
          periodHours: hours,
          periodEntries: entries,
        })
      : null;
  const rate = harvestProject?.hourly_rate ?? 0;
  const spentFundsEstimate = estimateHoursCost(hours, entries, rate) ?? 0;
  const costBudget = harvestProject?.cost_budget && harvestProject.cost_budget > 0 ? harvestProject.cost_budget : null;

  return {
    key,
    name,
    hours,
    entries,
    harvestProject,
    remaining,
    consumption,
    costBudget,
    spentFundsEstimate,
  };
}

export function formatHoursConsumed(hours: number): string {
  return `${hours.toFixed(1)} hours`;
}

/** One block per linked Harvest project so reports never combine their numbers. */
export function buildReportHarvestProjectBlocks(params: {
  harvestProjects: ReportBlockHarvestProject[];
  harvestProjectNames: string[];
  entries: ReportBlockTimeEntry[];
  periodType: string;
  periodEnd: string;
  budgetBurn?: BudgetBurnSnapshot | null;
}): ReportHarvestProjectBlock[] {
  const projects = resolveProjects(params.harvestProjects, params.harvestProjectNames);
  const sharedBurn = projects.length <= 1 ? params.budgetBurn ?? null : null;
  if (projects.length === 0) {
    return [
      buildBlock("all", "", null, params.entries, params.periodType, params.periodEnd, sharedBurn),
    ];
  }

  const assigned = new Set<ReportBlockTimeEntry>();
  const blocks = projects.map((project, index) => {
    const matched = params.entries.filter((entry) => entryMatchesProject(entry, project));
    for (const entry of matched) assigned.add(entry);
    return buildBlock(
      project.id != null ? `harvest-${project.id}` : `harvest-${index}`,
      project.name?.trim() || `Harvest project ${index + 1}`,
      project,
      matched,
      params.periodType,
      params.periodEnd,
      sharedBurn
    );
  });

  if (projects.length === 1) {
    const leftover = params.entries.filter((entry) => !assigned.has(entry));
    if (leftover.length > 0) {
      blocks[0] = buildBlock(
        blocks[0].key,
        blocks[0].name,
        projects[0],
        [...blocks[0].entries, ...leftover],
        params.periodType,
        params.periodEnd,
        sharedBurn
      );
    }
  }

  return blocks;
}
