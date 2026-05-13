import type { SupabaseClient } from "@supabase/supabase-js";

export const HARVEST_TOKEN_URL = "https://id.getharvest.com/api/v2/oauth2/token";

export type HarvestTokenIntegrationRow = {
  id: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
};

/** Refresh Harvest OAuth access token when near expiry; updates `user_integrations`. */
export async function ensureValidHarvestToken(
  supabase: SupabaseClient,
  integration: HarvestTokenIntegrationRow
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
