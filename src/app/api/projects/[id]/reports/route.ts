import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getHarvestProjects, getHarvestTimeEntries, getHarvestProjectBudgetReport } from "@/lib/harvest";
import { getHarvestAccess } from "@/lib/harvest-auth";
import { NextResponse } from "next/server";

async function getProjectAndCheckOwner(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
  userId: string
) {
  const { data } = await supabase
    .from("projects")
    .select("id, name, harvest_project_ids")
    .eq("id", projectId)
    .eq("owner_user_id", userId)
    .single();
  return data;
}

function getLastWeekBounds(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 7 : day;
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - diff - 6);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  return {
    start: lastMonday.toISOString().slice(0, 10),
    end: lastSunday.toISOString().slice(0, 10),
  };
}

function getLastMonthBounds(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  return {
    start: first.toISOString().slice(0, 10),
    end: last.toISOString().slice(0, 10),
  };
}

/** List reports for this project */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;
  const supabase = createAdminClient();
  const project = await getProjectAndCheckOwner(supabase, projectId, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: reports, error } = await supabase
    .from("reports")
    .select("id, period_type, period_start, period_end, status, created_at, approved_at")
    .eq("project_id", projectId)
    .order("period_end", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reports: reports ?? [] });
}

/** Create a new report (draft): fetch Harvest time entries and save snapshot */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;
  const supabase = createAdminClient();
  const project = await getProjectAndCheckOwner(supabase, projectId, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const harvestIds = (project.harvest_project_ids ?? []) as number[];
  if (harvestIds.length === 0) {
    return NextResponse.json(
      { error: "Project has no Harvest projects linked. Edit project to add them." },
      { status: 400 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const periodType = body.periodType === "month" ? "month" : "week";
  let periodStart: string;
  let periodEnd: string;
  if (typeof body.periodStart === "string" && typeof body.periodEnd === "string") {
    periodStart = body.periodStart.slice(0, 10);
    periodEnd = body.periodEnd.slice(0, 10);
  } else if (periodType === "month") {
    const b = getLastMonthBounds();
    periodStart = b.start;
    periodEnd = b.end;
  } else {
    const b = getLastWeekBounds();
    periodStart = b.start;
    periodEnd = b.end;
  }
  const harvest = await getHarvestAccess(userId);
  if (!harvest) {
    return NextResponse.json(
      { error: "Harvest not connected. Connect in Settings." },
      { status: 400 }
    );
  }
  try {
    const [timeEntries, allProjects, budgetReport] = await Promise.all([
      getHarvestTimeEntries(
        harvest.accountId,
        harvest.accessToken,
        periodStart,
        periodEnd,
        harvestIds
      ),
      getHarvestProjects(harvest.accountId, harvest.accessToken),
      getHarvestProjectBudgetReport(harvest.accountId, harvest.accessToken),
    ]);
    const projectSet = new Set(harvestIds);
    const budgetByProjectId = new Map(
      budgetReport.filter((r) => projectSet.has(r.project_id)).map((r) => [r.project_id, r])
    );
    const harvestProjectsForReport = allProjects
      .filter((p) => projectSet.has(p.id))
      .map((p) => {
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
    const harvestDataSnapshot = {
      fetchedAt: new Date().toISOString(),
      harvestProjectNames: harvestProjectsForReport.map((p) => p.name),
      harvestProjects: harvestProjectsForReport,
      timeEntries: timeEntries.map((e) => ({
        id: e.id,
        project: e.project,
        task: e.task,
        user: e.user,
        spent_date: e.spent_date,
        hours: e.hours,
        notes: e.notes,
        external_reference: e.external_reference
          ? { id: e.external_reference.id, permalink: e.external_reference.permalink }
          : null,
      })),
    };
    const { data: report, error } = await supabase
      .from("reports")
      .insert({
        project_id: projectId,
        period_type: periodType,
        period_start: periodStart,
        period_end: periodEnd,
        status: "draft",
        harvest_data_snapshot: harvestDataSnapshot,
        updated_at: new Date().toISOString(),
      })
      .select("id, period_type, period_start, period_end, status, created_at, harvest_data_snapshot")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(report);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Harvest API error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
