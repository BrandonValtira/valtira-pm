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
  type HarvestProject,
  type HarvestProjectBudgetResult,
} from "@/lib/harvest";
import { getHarvestWeekBounds } from "@/lib/report-week";

export type ResourcePlanningBudgetSummary = {
  totalBudgetHours: number;
  spentToDate: number;
  hasBudget: boolean;
};

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
): {
  id: number;
  name: string;
  budget: number | null;
  budget_spent: number | null;
  starts_on: string | null;
  ends_on: string | null;
}[] {
  const projectSet = new Set(harvestIds);
  const budgetByProjectId = new Map(
    budgetReport.filter((r) => projectSet.has(r.project_id)).map((r) => [r.project_id, r])
  );
  return allProjects
    .filter((p) => projectSet.has(p.id))
    .map((p) => {
      const budgetRow = budgetByProjectId.get(p.id);
      return {
        id: p.id,
        name: p.name,
        budget: p.budget ?? budgetRow?.budget ?? null,
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
  const harvestIds = input.harvestProjectIds;
  if (harvestIds.length === 0) {
    return { summary: { totalBudgetHours: 0, spentToDate: 0, hasBudget: false }, budgetBurn: null };
  }

  const { start: periodStart, end: periodEnd } = getHarvestWeekBounds();
  const [allProjects, budgetReport] = await Promise.all([
    getHarvestProjects(harvest.accountId, harvest.accessToken),
    getHarvestProjectBudgetReport(harvest.accountId, harvest.accessToken),
  ]);

  const harvestProjects = mapHarvestProjectsForBudget(allProjects, harvestIds, budgetReport);
  const totalBudgetHours = harvestProjects.reduce((sum, p) => sum + (p.budget ?? 0), 0);
  if (totalBudgetHours <= 0) {
    return {
      summary: { totalBudgetHours: 0, spentToDate: harvestBudgetSpentToDate(harvestProjects), hasBudget: false },
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
      result[p.projectName] = { totalBudgetHours: 0, spentToDate: 0, hasBudget: false };
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
        const totalBudgetHours = harvestProjects.reduce((sum, p) => sum + (p.budget ?? 0), 0);
        if (totalBudgetHours <= 0) {
          result[input.projectName] = {
            totalBudgetHours: 0,
            spentToDate: harvestBudgetSpentToDate(harvestProjects),
            hasBudget: false,
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
          input.harvestProjectIds
        );
        const spentToDate = entries.reduce((sum, e) => sum + e.hours, 0);
        result[input.projectName] = {
          totalBudgetHours,
          spentToDate,
          hasBudget: true,
        };
      } catch {
        result[input.projectName] = { totalBudgetHours: 0, spentToDate: 0, hasBudget: false };
      }
    })
  );

  for (const p of projects) {
    if (!result[p.projectName]) {
      result[p.projectName] = { totalBudgetHours: 0, spentToDate: 0, hasBudget: false };
    }
  }
  return result;
}
