import { createAdminClient } from "@/lib/supabase/admin";
import { ensureValidHarvestToken } from "@/lib/harvest-oauth-refresh";

/** Get valid Harvest access token and account ID for a user. Refreshes token if needed. */
export async function getHarvestAccess(
  userId: string
): Promise<{ accountId: string; accessToken: string } | null> {
  const supabase = createAdminClient();
  const { data: integration } = await supabase
    .from("user_integrations")
    .select("id, access_token, refresh_token, expires_at, provider_metadata")
    .eq("user_id", userId)
    .eq("provider", "harvest")
    .single();
  if (!integration?.access_token) return null;
  const accountId = (integration.provider_metadata as { account_id?: string })?.account_id;
  if (!accountId) return null;

  const accessToken = await ensureValidHarvestToken(supabase, {
    id: integration.id,
    access_token: integration.access_token,
    refresh_token: integration.refresh_token,
    expires_at: integration.expires_at,
  });
  return { accountId, accessToken };
}
