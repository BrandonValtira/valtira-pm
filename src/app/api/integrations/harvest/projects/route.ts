import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getHarvestProjects,
  getHarvestProjectBudgetReport,
  harvestProjectsFromBudgetReport,
} from "@/lib/harvest";
import { NextResponse } from "next/server";

const HARVEST_TOKEN_URL = "https://id.getharvest.com/api/v2/oauth2/token";

async function ensureValidHarvestToken(
  supabase: ReturnType<typeof createAdminClient>,
  integration: { access_token: string; refresh_token: string | null; expires_at: string | null; id: string }
): Promise<string> {
  const expiresAt = integration.expires_at ? new Date(integration.expires_at).getTime() : 0;
  const bufferMs = 5 * 60 * 1000;
  if (integration.refresh_token && Date.now() >= expiresAt - bufferMs) {
    const res = await fetch(HARVEST_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: integration.refresh_token,
        client_id: process.env.HARVEST_CLIENT_ID!,
        client_secret: process.env.HARVEST_CLIENT_SECRET!,
        grant_type: "refresh_token",
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
      const newExpires = new Date(Date.now() + data.expires_in * 1000).toISOString();
      await supabase
        .from("user_integrations")
        .update({
          access_token: data.access_token,
          refresh_token: data.refresh_token ?? integration.refresh_token,
          expires_at: newExpires,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id);
      return data.access_token;
    }
  }
  return integration.access_token;
}

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
      getHarvestProjects(accountId, accessToken),
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
