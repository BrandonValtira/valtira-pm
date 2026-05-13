import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureValidHarvestToken } from "@/lib/harvest-oauth-refresh";
import { getHarvestUsers } from "@/lib/harvest";
import { NextResponse } from "next/server";

type HarvestIntegrationRow = {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  provider_metadata: unknown;
};

function getAccountId(meta: unknown): string | undefined {
  const v = (meta as { account_id?: string })?.account_id;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Prefer env-matched super admin, else any active super_admin (first row). */
async function resolveCanonicalSuperAdminUserId(
  supabase: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  const envEmail =
    process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ||
    process.env.AUTH_SUPER_ADMIN_EMAIL?.trim().toLowerCase() ||
    null;
  const { data: admins } = await supabase
    .from("users")
    .select("id, email")
    .eq("role", "super_admin")
    .eq("status", "active");
  if (!admins?.length) return null;
  if (envEmail) {
    const match = admins.find(
      (a) => typeof a.email === "string" && a.email.trim().toLowerCase() === envEmail
    );
    if (match) return match.id;
  }
  return admins[0].id;
}

async function fetchHarvestIntegration(
  supabase: ReturnType<typeof createAdminClient>,
  forUserId: string
): Promise<HarvestIntegrationRow | null> {
  const { data } = await supabase
    .from("user_integrations")
    .select("id, access_token, refresh_token, expires_at, provider_metadata")
    .eq("user_id", forUserId)
    .eq("provider", "harvest")
    .maybeSingle();
  return (data as HarvestIntegrationRow | null) ?? null;
}

function isCompleteHarvestIntegration(
  row: HarvestIntegrationRow | null
): row is HarvestIntegrationRow & { access_token: string } {
  if (!row?.access_token) return false;
  return Boolean(getAccountId(row.provider_metadata));
}

/**
 * Team directory: use an active super admin’s Harvest when connected (full org list for all PMs),
 * otherwise fall back to the signed-in user’s Harvest.
 */
async function resolveHarvestIntegrationForDirectory(
  supabase: ReturnType<typeof createAdminClient>,
  sessionUserId: string
): Promise<{ integration: HarvestIntegrationRow & { access_token: string }; accountId: string } | null> {
  const superAdminId = await resolveCanonicalSuperAdminUserId(supabase);
  const ordered: string[] = [];
  if (superAdminId) ordered.push(superAdminId);
  if (!ordered.includes(sessionUserId)) ordered.push(sessionUserId);
  for (const uid of ordered) {
    const row = await fetchHarvestIntegration(supabase, uid);
    if (isCompleteHarvestIntegration(row)) {
      return {
        integration: row,
        accountId: getAccountId(row.provider_metadata)!,
      };
    }
  }
  return null;
}

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const resolved = await resolveHarvestIntegrationForDirectory(supabase, userId);
  if (!resolved) {
    return NextResponse.json(
      {
        error:
          "Harvest is not connected for the team directory. A super admin should connect Harvest in Settings, or connect your own Harvest account.",
      },
      { status: 400 }
    );
  }
  const { integration, accountId } = resolved;
  try {
    const accessToken = await ensureValidHarvestToken(supabase, {
      id: integration.id,
      access_token: integration.access_token,
      refresh_token: integration.refresh_token,
      expires_at: integration.expires_at,
    });
    const users = await getHarvestUsers(accountId, accessToken);
    const list = users.map((u) => ({
      id: u.id,
      name: [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || "Unknown",
    }));
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return NextResponse.json({ users: list });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Harvest API error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
