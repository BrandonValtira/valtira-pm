import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildBudgetBurnSnapshot,
  resolveContractBoundsFromHarvest,
  harvestBudgetSpentToDate,
  type BudgetBurnSnapshot,
} from "@/lib/budget-burn-chart";
import {
  getHarvestProjectBudgetReport,
  getHarvestProjects,
  getHarvestTimeEntries,
  isHarvestCostBudget,
  isHarvestHourBudget,
  type HarvestProject,
  type HarvestProjectBudgetResult,
} from "@/lib/harvest";
import { getHarvestWeekBounds } from "@/lib/report-week";

export type BudgetTracking = "hours" | "cost" | "none";

export type ResourcePlanningBudgetSummary = {
  totalBudgetHours: number;
  spentToDate: number;
  hasBudget: boolean;
  budgetTracking: BudgetTracking;
};

const EMPTY_BUDGET_SUMMARY: ResourcePlanningBudgetSummary = {
  totalBudgetHours: 0,
  spentToDate: 0,
  hasBudget: false,
  budgetTracking: "none",
};

type HarvestProjectBudgetRow = {
  id: number;
  name: string;
  budget: number | null;
  budget_by: string | null;
  budget_spent: number | null;
  starts_on: string | null;
  ends_on: string | null;
};

function resolveBudgetTracking(
  harvestProjects: Pick<HarvestProjectBudgetRow, "budget" | "budget_by">[]
): BudgetTracking {
  const withBudget = harvestProjects.filter((p) => (p.budget ?? 0) > 0);
  if (withBudget.length === 0) return "none";
  if (withBudget.some((p) => isHarvestCostBudget(p.budget_by))) return "cost";
  if (withBudget.every((p) => isHarvestHourBudget(p.budget_by))) return "hours";
  return "none";
}

function hourBudgetSummary(
  harvestProjects: HarvestProjectBudgetRow[],
  spentToDate: number
): ResourcePlanningBudgetSummary {
  const budgetTracking = resolveBudgetTracking(harvestProjects);
  if (budgetTracking !== "hours") {
    return { ...EMPTY_BUDGET_SUMMARY, budgetTracking, spentToDate };
  }
  const totalBudgetHours = harvestProjects.reduce((sum, p) => sum + (p.budget ?? 0), 0);
  if (totalBudgetHours <= 0) {
    return { ...EMPTY_BUDGET_SUMMARY, spentToDate };
  }
  return {
    totalBudgetHours,
    spentToDate,
    hasBudget: true,
    budgetTracking: "hours",
  };
}

export type ResourcePlanningBudgetDetail = {
  summary: ResourcePlanningBudgetSummary;
  budgetBurn: BudgetBurnSnapshot | null;
};

type ProjectBudgetInput = {
  projectName: string;
  harvestProjectIds: number[];
  harvestProjectNames: string[];
  contractExpiryDate?: string | null;
};

function mapHarvestProjectsForBudget(
  allProjects: HarvestProject[],
  harvestIds: number[],
  budgetReport: HarvestProjectBudgetResult[]
): HarvestProjectBudgetRow[] {
  const projectSet = new Set(harvestIds);
  const budgetByProjectId = new Map(
    budgetReport.filter((r) => projectSet.has(r.project_id)).map((r) => [r.project_id, r])
  );
  const linked = allProjects.filter((p) => projectSet.has(p.id));
  // Prefer active Harvest projects only. Stale inactive IDs often linger in
  // harvest_project_ids after the picker was narrowed to active projects.
  const preferred = linked.some((p) => p.is_active)
    ? linked.filter((p) => p.is_active)
    : linked;
  return preferred.map((p) => {
    const budgetRow = budgetByProjectId.get(p.id);
    return {
      id: p.id,
      name: p.name,
      budget: p.budget ?? budgetRow?.budget ?? null,
      budget_by: p.budget_by ?? budgetRow?.budget_by ?? null,
      budget_spent: budgetRow?.budget_spent ?? null,
      starts_on: p.starts_on ?? null,
      ends_on: p.ends_on ?? null,
    };
  });
}

export async function fetchResourcePlanningBudgetDetail(
  harvest: { accountId: string; accessToken: string },
  input: ProjectBudgetInput
): Promise<ResourcePlanningBudgetDetail> {
  if (input.harvestProjectIds.length === 0) {
    return { summary: EMPTY_BUDGET_SUMMARY, budgetBurn: null };
  }

  const { start: periodStart, end: periodEnd } = getHarvestWeekBounds();
  const [allProjects, budgetReport] = await Promise.all([
    getHarvestProjects(harvest.accountId, harvest.accessToken),
    getHarvestProjectBudgetReport(harvest.accountId, harvest.accessToken),
  ]);

  const harvestProjects = mapHarvestProjectsForBudget(
    allProjects,
    input.harvestProjectIds,
    budgetReport
  );
  const harvestIds = harvestProjects.map((p) => p.id);
  if (harvestIds.length === 0) {
    return { summary: EMPTY_BUDGET_SUMMARY, budgetBurn: null };
  }

  const budgetTracking = resolveBudgetTracking(harvestProjects);
  if (budgetTracking !== "hours") {
    return {
      summary: {
        ...EMPTY_BUDGET_SUMMARY,
        budgetTracking,
        spentToDate: harvestBudgetSpentToDate(harvestProjects),
      },
      budgetBurn: null,
    };
  }

  const totalBudgetHours = harvestProjects.reduce((sum, p) => sum + (p.budget ?? 0), 0);
  if (totalBudgetHours <= 0) {
    return {
      summary: {
        ...EMPTY_BUDGET_SUMMARY,
        spentToDate: harvestBudgetSpentToDate(harvestProjects),
      },
      budgetBurn: null,
    };
  }

  const contractExpiry = input.contractExpiryDate ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const { start: contractStart } = resolveContractBoundsFromHarvest(
    harvestProjects,
    contractExpiry,
    input.harvestProjectNames,
    periodEnd
  );

  const contractEntries = await getHarvestTimeEntries(
    harvest.accountId,
    harvest.accessToken,
    contractStart,
    today,
    harvestIds
  );

  const budgetBurn = buildBudgetBurnSnapshot(
    contractEntries,
    harvestProjects,
    "week",
    periodStart,
    periodEnd,
    contractExpiry,
    input.harvestProjectNames,
    today
  );

  return {
    summary: {
      totalBudgetHours,
      spentToDate: budgetBurn?.cumulativeSpentThroughPeriod ?? harvestBudgetSpentToDate(harvestProjects),
      hasBudget: true,
      budgetTracking: "hours",
    },
    budgetBurn,
  };
}

export async function loadResourcePlanningProjectMeta(
  projectName: string
): Promise<ProjectBudgetInput> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("resource_planning_projects")
    .select("project_name, harvest_project_ids, harvest_project_names, contract_expiry_date")
    .eq("project_name", projectName)
    .maybeSingle();
  if (!data) {
    return {
      projectName,
      harvestProjectIds: [],
      harvestProjectNames: [],
      contractExpiryDate: null,
    };
  }
  return {
    projectName,
    harvestProjectIds: Array.isArray(data.harvest_project_ids) ? data.harvest_project_ids : [],
    harvestProjectNames: Array.isArray(data.harvest_project_names) ? data.harvest_project_names : [],
    contractExpiryDate: data.contract_expiry_date ?? null,
  };
}

export async function fetchBudgetSummariesForProjects(
  harvest: { accountId: string; accessToken: string },
  projects: ProjectBudgetInput[]
): Promise<Record<string, ResourcePlanningBudgetSummary>> {
  const result: Record<string, ResourcePlanningBudgetSummary> = {};
  const withHarvest = projects.filter((p) => p.harvestProjectIds.length > 0);
  if (withHarvest.length === 0) {
    for (const p of projects) {
      result[p.projectName] = EMPTY_BUDGET_SUMMARY;
    }
    return result;
  }

  const [allProjects, budgetReport] = await Promise.all([
    getHarvestProjects(harvest.accountId, harvest.accessToken),
    getHarvestProjectBudgetReport(harvest.accountId, harvest.accessToken),
  ]);

  const { end: periodEnd } = getHarvestWeekBounds();

  await Promise.all(
    withHarvest.map(async (input) => {
      try {
        const harvestProjects = mapHarvestProjectsForBudget(
          allProjects,
          input.harvestProjectIds,
          budgetReport
        );
        const harvestIds = harvestProjects.map((p) => p.id);
        if (harvestIds.length === 0) {
          result[input.projectName] = EMPTY_BUDGET_SUMMARY;
          return;
        }
        const budgetTracking = resolveBudgetTracking(harvestProjects);
        if (budgetTracking !== "hours") {
          result[input.projectName] = {
            ...EMPTY_BUDGET_SUMMARY,
            budgetTracking,
            spentToDate: harvestBudgetSpentToDate(harvestProjects),
          };
          return;
        }
        const { start: contractStart } = resolveContractBoundsFromHarvest(
          harvestProjects,
          input.contractExpiryDate ?? null,
          input.harvestProjectNames,
          periodEnd
        );
        const entries = await getHarvestTimeEntries(
          harvest.accountId,
          harvest.accessToken,
          contractStart,
          periodEnd,
          harvestIds
        );
        const spentToDate = entries.reduce((sum, e) => sum + e.hours, 0);
        result[input.projectName] = hourBudgetSummary(harvestProjects, spentToDate);
      } catch {
        result[input.projectName] = EMPTY_BUDGET_SUMMARY;
      }
    })
  );

  for (const p of projects) {
    if (!result[p.projectName]) {
      result[p.projectName] = EMPTY_BUDGET_SUMMARY;
    }
  }
  return result;
}
