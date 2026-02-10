import { createAdminClient } from "@/lib/supabase/admin";

const HARVEST_TOKEN_URL = "https://id.getharvest.com/api/v2/oauth2/token";

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
      return { accountId, accessToken: data.access_token };
    }
  }
  return { accountId, accessToken: integration.access_token };
}
