import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveHarvestAccessForDirectory } from "@/lib/harvest-directory";
import {
  fetchBudgetSummariesForProjects,
  loadResourcePlanningProjectMeta,
} from "@/lib/fetch-resource-planning-budget";
import { NextResponse } from "next/server";

/** Batch budget summaries for resource planning project cards. */
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const names = Array.isArray(body.projectNames)
    ? body.projectNames.map((n: unknown) => String(n)).filter(Boolean)
    : [];
  if (names.length === 0) {
    return NextResponse.json({ summaries: {} });
  }
  if (names.length > 80) {
    return NextResponse.json({ error: "Too many projects (max 80)" }, { status: 400 });
  }

  const harvest = await resolveHarvestAccessForDirectory(userId);
  if (!harvest) {
    return NextResponse.json(
      { error: "Harvest is not connected. Connect Harvest in Settings to see budget data." },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data: metaRows } = await supabase
    .from("resource_planning_projects")
    .select("project_name, harvest_project_ids, harvest_project_names, contract_expiry_date")
    .in("project_name", names);

  const metaByName = new Map(
    (metaRows ?? []).map((row) => [
      row.project_name,
      {
        projectName: row.project_name,
        harvestProjectIds: Array.isArray(row.harvest_project_ids) ? row.harvest_project_ids : [],
        harvestProjectNames: Array.isArray(row.harvest_project_names) ? row.harvest_project_names : [],
        contractExpiryDate: row.contract_expiry_date ?? null,
      },
    ])
  );

  const inputs = names.map(
    (name: string) =>
      metaByName.get(name) ?? {
        projectName: name,
        harvestProjectIds: [],
        harvestProjectNames: [],
        contractExpiryDate: null,
      }
  );

  const summaries = await fetchBudgetSummariesForProjects(harvest, inputs);
  return NextResponse.json({ summaries });
}

/** Single project budget detail (chart data). */
export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const name = searchParams.get("projectName")?.trim();
  if (!name) {
    return NextResponse.json({ error: "projectName query required" }, { status: 400 });
  }

  const harvest = await resolveHarvestAccessForDirectory(userId);
  if (!harvest) {
    return NextResponse.json(
      { error: "Harvest is not connected. Connect Harvest in Settings to see budget data." },
      { status: 400 }
    );
  }

  const input = await loadResourcePlanningProjectMeta(name);
  const { fetchResourcePlanningBudgetDetail } = await import("@/lib/fetch-resource-planning-budget");
  const detail = await fetchResourcePlanningBudgetDetail(harvest, input);
  return NextResponse.json(detail);
}
