import { createAdminClient } from "@/lib/supabase/admin";
import { ensureValidHarvestToken } from "@/lib/harvest-oauth-refresh";

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

/** Team Harvest connection: super admin first, then signed-in user. */
export async function resolveHarvestAccessForDirectory(
  sessionUserId: string
): Promise<{ accountId: string; accessToken: string } | null> {
  const supabase = createAdminClient();
  const superAdminId = await resolveCanonicalSuperAdminUserId(supabase);
  const ordered: string[] = [];
  if (superAdminId) ordered.push(superAdminId);
  if (!ordered.includes(sessionUserId)) ordered.push(sessionUserId);

  for (const uid of ordered) {
    const row = await fetchHarvestIntegration(supabase, uid);
    if (!row?.access_token) continue;
    const accountId = getAccountId(row.provider_metadata);
    if (!accountId) continue;
    const accessToken = await ensureValidHarvestToken(supabase, {
      id: row.id,
      access_token: row.access_token,
      refresh_token: row.refresh_token,
      expires_at: row.expires_at,
    });
    return { accountId, accessToken };
  }
  return null;
}
