import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildBudgetAllocationData,
  mapHarvestEntriesForBudgetAllocation,
  type BudgetAllocationData,
  type BudgetAllocationTimeEntry,
} from "@/lib/budget-allocation-report";
import { buildBudgetBurnSnapshot, getContractBounds, type BudgetBurnSnapshot } from "@/lib/budget-burn-chart";
import { getHarvestProjects, getHarvestTimeEntries, getHarvestProjectBudgetReport, type HarvestProject, type HarvestProjectBudgetResult, type HarvestTimeEntry } from "@/lib/harvest";
import { getHarvestAccess } from "@/lib/harvest-auth";
import {
  normalizeReportFormat,
  REPORT_FORMAT_BUDGET_ALLOCATION,
  type ReportFormat,
} from "@/lib/report-formats";
import { getHarvestWeekBounds, formatDateOnly } from "@/lib/report-week";

function getLastMonthBounds(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) };
}

export type CreateReportOptions = {
  status?: "draft" | "pending_approval";
  approvalRequestedAt?: string | null;
  reportFormat?: ReportFormat;
};

type HarvestSnapshotBase = {
  fetchedAt: string;
  reportFormat?: ReportFormat;
  harvestProjectNames: string[];
  harvestProjects: {
    id: number;
    name: string;
    client_name: string | null;
    budget: number | null;
    cost_budget: number | null;
    hourly_rate: number | null;
    budget_by: string | null;
    budget_spent: number | null;
    budget_remaining: number | null;
  }[];
  timeEntries: BudgetAllocationTimeEntry[];
  budgetAllocation?: BudgetAllocationData;
  budgetBurn?: BudgetBurnSnapshot | null;
};

async function buildHarvestSnapshot(
  ownerUserId: string,
  projectId: string,
  start: string,
  end: string,
  reportFormat: ReportFormat,
  periodType: "week" | "month"
): Promise<HarvestSnapshotBase> {
  const supabase = createAdminClient();
  const { data: project } = await supabase
    .from("projects")
    .select("harvest_project_ids, contract_expiry_date")
    .eq("id", projectId)
    .single();
  if (!project) throw new Error("Project not found");
  const harvestIds = (project.harvest_project_ids ?? []) as number[];
  if (harvestIds.length === 0) throw new Error("Project has no Harvest projects linked");
  const harvest = await getHarvestAccess(ownerUserId);
  if (!harvest) throw new Error("Harvest not connected for project owner");
  const [timeEntries, allProjects, budgetReport] = await Promise.all([
    getHarvestTimeEntries(harvest.accountId, harvest.accessToken, start, end, harvestIds),
    getHarvestProjects(harvest.accountId, harvest.accessToken),
    getHarvestProjectBudgetReport(harvest.accountId, harvest.accessToken),
  ]);
  const projectSet = new Set(harvestIds);
  const budgetByProjectId = new Map<number, HarvestProjectBudgetResult>(
    budgetReport.filter((r) => projectSet.has(r.project_id)).map((r) => [r.project_id, r])
  );
  const harvestProjectsForReport = allProjects
    .filter((p: HarvestProject) => projectSet.has(p.id))
    .map((p: HarvestProject) => {
      const budgetRow = budgetByProjectId.get(p.id);
      return {
        id: p.id,
        name: p.name,
        client_name: p.client?.name ?? null,
        budget: p.budget ?? budgetRow?.budget ?? null,
        cost_budget: p.cost_budget ?? null,
        hourly_rate: p.hourly_rate ?? null,
        budget_by: p.budget_by ?? null,
        budget_spent: budgetRow?.budget_spent ?? null,
        budget_remaining: budgetRow?.budget_remaining ?? null,
      };
    });

  const mappedEntries = mapHarvestEntriesForBudgetAllocation(timeEntries);
  const snapshot: HarvestSnapshotBase = {
    fetchedAt: new Date().toISOString(),
    reportFormat,
    harvestProjectNames: harvestProjectsForReport.map((p) => p.name),
    harvestProjects: harvestProjectsForReport,
    timeEntries: timeEntries.map((e: HarvestTimeEntry) => ({
      id: e.id,
      project: e.project,
      task: e.task,
      user: e.user,
      spent_date: e.spent_date,
      hours: e.hours,
      notes: e.notes,
      external_reference: e.external_reference
        ? (e.external_reference as { id: string; permalink?: string })
        : null,
    })),
  };

  if (reportFormat === REPORT_FORMAT_BUDGET_ALLOCATION) {
    const periodLabel = `${formatDateOnly(start)} – ${formatDateOnly(end)}`;
    snapshot.budgetAllocation = await buildBudgetAllocationData(mappedEntries, periodLabel);
    snapshot.timeEntries = mappedEntries;

    const contractExpiry = project.contract_expiry_date as string | null | undefined;
    const { start: contractStart } = getContractBounds(contractExpiry, end);
    const contractEntries = await getHarvestTimeEntries(
      harvest.accountId,
      harvest.accessToken,
      contractStart,
      end,
      harvestIds
    );
    snapshot.budgetBurn = buildBudgetBurnSnapshot(
      contractEntries,
      harvestProjectsForReport,
      periodType,
      start,
      end,
      contractExpiry,
      harvestProjectsForReport.map((p) => p.name)
    );
  }

  return snapshot;
}

/**
 * Create a report for a project: fetch Harvest data and insert. Caller must ensure project exists and owner has Harvest connected.
 */
export async function createReport(
  projectId: string,
  ownerUserId: string,
  periodType: "week" | "month",
  periodStart?: string,
  periodEnd?: string,
  options: CreateReportOptions = {}
): Promise<{ id: string; period_type: string; period_start: string; period_end: string; status: string; created_at: string; harvest_data_snapshot: unknown; report_format: ReportFormat }> {
  const supabase = createAdminClient();
  const { data: project } = await supabase.from("projects").select("id, harvest_project_ids").eq("id", projectId).single();
  if (!project) throw new Error("Project not found");
  const harvestIds = (project.harvest_project_ids ?? []) as number[];
  if (harvestIds.length === 0) throw new Error("Project has no Harvest projects linked");
  const reportFormat = normalizeReportFormat(options.reportFormat);
  let start: string;
  let end: string;
  if (periodStart && periodEnd) {
    start = periodStart.slice(0, 10);
    end = periodEnd.slice(0, 10);
  } else if (periodType === "month") {
    const b = getLastMonthBounds();
    start = b.start;
    end = b.end;
  } else {
    const b = getHarvestWeekBounds();
    start = b.start;
    end = b.end;
  }
  const harvestDataSnapshot = await buildHarvestSnapshot(
    ownerUserId,
    projectId,
    start,
    end,
    reportFormat,
    periodType
  );
  const status = options.status ?? "draft";
  const insert: Record<string, unknown> = {
    project_id: projectId,
    period_type: periodType,
    period_start: start,
    period_end: end,
    status,
    report_format: reportFormat,
    harvest_data_snapshot: harvestDataSnapshot,
    updated_at: new Date().toISOString(),
  };
  if (options.approvalRequestedAt) insert.approval_requested_at = options.approvalRequestedAt;
  const { data: report, error } = await supabase
    .from("reports")
    .insert(insert)
    .select("id, period_type, period_start, period_end, status, created_at, harvest_data_snapshot, report_format")
    .single();
  if (error) throw new Error(error.message);
  return report as {
    id: string;
    period_type: string;
    period_start: string;
    period_end: string;
    status: string;
    created_at: string;
    harvest_data_snapshot: unknown;
    report_format: ReportFormat;
  };
}

/**
 * Create a report with status pending_approval and a placeholder snapshot (e.g. when Harvest fails).
 */
export async function createPlaceholderReport(
  projectId: string,
  ownerUserId: string,
  periodType: "week" | "month",
  errorMessage: string,
  reportFormat: ReportFormat = "standard"
): Promise<{ id: string; period_type: string; period_start: string; period_end: string; status: string; created_at: string; report_format: ReportFormat }> {
  const supabase = createAdminClient();
  const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).single();
  if (!project) throw new Error("Project not found");
  const { start, end } = periodType === "month" ? getLastMonthBounds() : getHarvestWeekBounds();
  const now = new Date().toISOString();
  const insert = {
    project_id: projectId,
    period_type: periodType,
    period_start: start,
    period_end: end,
    status: "pending_approval",
    report_format: reportFormat,
    approval_requested_at: now,
    harvest_data_snapshot: {
      _placeholder: true,
      _error: errorMessage,
      fetchedAt: now,
      reportFormat,
    },
    updated_at: now,
  };
  const { data: report, error } = await supabase
    .from("reports")
    .insert(insert)
    .select("id, period_type, period_start, period_end, status, created_at, report_format")
    .single();
  if (error) throw new Error(error.message);
  return report as {
    id: string;
    period_type: string;
    period_start: string;
    period_end: string;
    status: string;
    created_at: string;
    report_format: ReportFormat;
  };
}

/** Re-fetch Harvest data and update an existing report (e.g. after reject). Sets status=draft, cleared rejected_at. */
export async function regenerateReportSnapshot(
  reportId: string,
  ownerUserId: string
): Promise<{ id: string; period_type: string; period_start: string; period_end: string; status: string; harvest_data_snapshot: unknown; report_format: ReportFormat }> {
  const supabase = createAdminClient();
  const { data: report } = await supabase
    .from("reports")
    .select("id, project_id, period_type, period_start, period_end, report_format")
    .eq("id", reportId)
    .single();
  if (!report) throw new Error("Report not found");
  const reportFormat = normalizeReportFormat(report.report_format);
  const snapshot = await buildHarvestSnapshot(
    ownerUserId,
    report.project_id,
    report.period_start,
    report.period_end,
    reportFormat,
    report.period_type as "week" | "month"
  );
  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("reports")
    .update({
      harvest_data_snapshot: snapshot,
      status: "draft",
      rejected_at: null,
      updated_at: now,
    })
    .eq("id", reportId)
    .select("id, period_type, period_start, period_end, status, harvest_data_snapshot, report_format")
    .single();
  if (error) throw new Error(error.message);
  return updated as {
    id: string;
    period_type: string;
    period_start: string;
    period_end: string;
    status: string;
    harvest_data_snapshot: unknown;
    report_format: ReportFormat;
  };
}
