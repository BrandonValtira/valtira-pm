import { createAdminClient } from "@/lib/supabase/admin";
import { getHarvestProjects, getHarvestTimeEntries, getHarvestProjectBudgetReport, type HarvestProject, type HarvestProjectBudgetResult, type HarvestTimeEntry } from "@/lib/harvest";
import { getHarvestAccess } from "@/lib/harvest-auth";
import { getHarvestWeekBounds } from "@/lib/report-week";

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
};

async function buildHarvestSnapshot(
  ownerUserId: string,
  projectId: string,
  periodType: "week" | "month",
  start: string,
  end: string
): Promise<unknown> {
  const supabase = createAdminClient();
  const { data: project } = await supabase.from("projects").select("harvest_project_ids").eq("id", projectId).single();
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
  return {
    fetchedAt: new Date().toISOString(),
    harvestProjectNames: harvestProjectsForReport.map((p: { name: string }) => p.name),
    harvestProjects: harvestProjectsForReport,
    timeEntries: timeEntries.map((e: HarvestTimeEntry) => ({
      id: e.id,
      project: e.project,
      task: e.task,
      user: e.user,
      spent_date: e.spent_date,
      hours: e.hours,
      notes: e.notes,
      external_reference: e.external_reference ? (e.external_reference as { id: string; permalink?: string }) : null,
    })),
  };
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
): Promise<{ id: string; period_type: string; period_start: string; period_end: string; status: string; created_at: string; harvest_data_snapshot: unknown }> {
  const supabase = createAdminClient();
  const { data: project } = await supabase.from("projects").select("id, harvest_project_ids").eq("id", projectId).single();
  if (!project) throw new Error("Project not found");
  const harvestIds = (project.harvest_project_ids ?? []) as number[];
  if (harvestIds.length === 0) throw new Error("Project has no Harvest projects linked");
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
  const harvestDataSnapshot = await buildHarvestSnapshot(ownerUserId, projectId, periodType, start, end);
  const status = options.status ?? "draft";
  const insert: Record<string, unknown> = {
    project_id: projectId,
    period_type: periodType,
    period_start: start,
    period_end: end,
    status,
    harvest_data_snapshot: harvestDataSnapshot,
    updated_at: new Date().toISOString(),
  };
  if (options.approvalRequestedAt) insert.approval_requested_at = options.approvalRequestedAt;
  const { data: report, error } = await supabase.from("reports").insert(insert).select("id, period_type, period_start, period_end, status, created_at, harvest_data_snapshot").single();
  if (error) throw new Error(error.message);
  return report as { id: string; period_type: string; period_start: string; period_end: string; status: string; created_at: string; harvest_data_snapshot: unknown };
}

/**
 * Create a report with status pending_approval and a placeholder snapshot (e.g. when Harvest fails).
 * Approval flow and email still run; user can open the report and regenerate once Harvest is connected.
 */
export async function createPlaceholderReport(
  projectId: string,
  ownerUserId: string,
  periodType: "week" | "month",
  errorMessage: string
): Promise<{ id: string; period_type: string; period_start: string; period_end: string; status: string; created_at: string }> {
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
    approval_requested_at: now,
    harvest_data_snapshot: {
      _placeholder: true,
      _error: errorMessage,
      fetchedAt: now,
    },
    updated_at: now,
  };
  const { data: report, error } = await supabase
    .from("reports")
    .insert(insert)
    .select("id, period_type, period_start, period_end, status, created_at")
    .single();
  if (error) throw new Error(error.message);
  return report as { id: string; period_type: string; period_start: string; period_end: string; status: string; created_at: string };
}

/** Re-fetch Harvest data and update an existing report (e.g. after reject). Sets status=draft, cleared rejected_at. */
export async function regenerateReportSnapshot(reportId: string, ownerUserId: string): Promise<{ id: string; period_type: string; period_start: string; period_end: string; status: string; harvest_data_snapshot: unknown }> {
  const supabase = createAdminClient();
  const { data: report } = await supabase.from("reports").select("id, project_id, period_type, period_start, period_end").eq("id", reportId).single();
  if (!report) throw new Error("Report not found");
  const snapshot = await buildHarvestSnapshot(
    ownerUserId,
    report.project_id,
    report.period_type as "week" | "month",
    report.period_start,
    report.period_end
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
    .select("id, period_type, period_start, period_end, status, harvest_data_snapshot")
    .single();
  if (error) throw new Error(error.message);
  return updated as { id: string; period_type: string; period_start: string; period_end: string; status: string; harvest_data_snapshot: unknown };
}
