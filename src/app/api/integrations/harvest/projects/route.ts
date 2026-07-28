import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getHarvestProjects,
  getHarvestProjectBudgetReport,
  harvestProjectsFromBudgetReport,
} from "@/lib/harvest";
import { ensureValidHarvestToken } from "@/lib/harvest-oauth-refresh";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data: integration } = await supabase
    .from("user_integrations")
    .select("id, access_token, refresh_token, expires_at, provider_metadata")
    .eq("user_id", userId)
    .eq("provider", "harvest")
    .single();
  if (!integration?.access_token) {
    return NextResponse.json(
      { error: "Harvest not connected. Sign in with Harvest in Settings." },
      { status: 400 }
    );
  }
  const accountId = (integration.provider_metadata as { account_id?: string })?.account_id;
  if (!accountId) {
    return NextResponse.json(
      { error: "Harvest account ID missing. Reconnect in Settings." },
      { status: 400 }
    );
  }
  try {
    const accessToken = await ensureValidHarvestToken(supabase, integration);
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
