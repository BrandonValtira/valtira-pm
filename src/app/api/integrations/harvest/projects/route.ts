import { auth } from "@/auth";
import { resolveHarvestAccessForDirectory } from "@/lib/harvest-directory";
import {
  getHarvestProjects,
  getHarvestProjectBudgetReport,
  harvestProjectsFromBudgetReport,
} from "@/lib/harvest";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const harvest = await resolveHarvestAccessForDirectory(userId);
  if (!harvest) {
    return NextResponse.json(
      { error: "Harvest not connected. A super admin needs to connect Harvest in Accounts." },
      { status: 400 }
    );
  }
  const { accountId, accessToken } = harvest;
  try {
    const [projectsFromApi, budgetResults] = await Promise.all([
      getHarvestProjects(accountId, accessToken, { isActive: true }),
      getHarvestProjectBudgetReport(accountId, accessToken),
    ]);
    const projectsFromBudget = harvestProjectsFromBudgetReport(budgetResults);
    const seenIds = new Set(projectsFromApi.map((p) => p.id));
    const extra = projectsFromBudget.filter(
      (p) => !seenIds.has(p.id) && p.is_active
    );
    const projects = [...projectsFromApi, ...extra];
    const body: { projects: typeof projects; _debug?: Record<string, unknown> } = { projects };
    const debug = new URL(req.url).searchParams.get("debug");
    if (debug === "1") {
      const match = projects.filter(
        (p) => /hallmark|hmk005|affiliates/i.test(p.name) || (p.client?.name && /hallmark/i.test(p.client.name))
      );
      body._debug = {
        fromApi: projectsFromApi.length,
        fromBudget: budgetResults.length,
        merged: projects.length,
        matchingHallmarkOrHmk: match.length,
        matchingNames: match.map((p) => ({ name: p.name, client: p.client?.name })),
      };
    }
    return NextResponse.json(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Harvest API error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
