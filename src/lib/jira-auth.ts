import { createAdminClient } from "@/lib/supabase/admin";

const ATLASSIAN_TOKEN_URL = "https://auth.atlassian.com/oauth/token";

/** Get valid Jira access token and cloud ID for a user. Refreshes token if needed. */
export async function getJiraAccess(
  userId: string
): Promise<{ cloudId: string; accessToken: string } | null> {
  const supabase = createAdminClient();
  const { data: integration } = await supabase
    .from("user_integrations")
    .select("id, access_token, refresh_token, expires_at, provider_metadata")
    .eq("user_id", userId)
    .eq("provider", "jira")
    .single();
  if (!integration?.access_token) return null;

  const rawMeta = integration.provider_metadata;
  let meta: { cloud_id?: string } | null = null;
  if (typeof rawMeta === "string") {
    try {
      meta = JSON.parse(rawMeta) as { cloud_id?: string };
    } catch {
      meta = null;
    }
  } else if (rawMeta && typeof rawMeta === "object") {
    meta = rawMeta as { cloud_id?: string };
  }
  const cloudId = meta?.cloud_id;
  if (!cloudId) return null;

  const expiresAt = integration.expires_at ? new Date(integration.expires_at).getTime() : 0;
  const bufferMs = 5 * 60 * 1000;
  if (integration.refresh_token && Date.now() >= expiresAt - bufferMs) {
    const clientId = process.env.ATLASSIAN_CLIENT_ID;
    const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET;
    if (clientId && clientSecret) {
      const res = await fetch(ATLASSIAN_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: integration.refresh_token,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in: number;
        };
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
        return { cloudId, accessToken: data.access_token };
      }
    }
  }
  return { cloudId, accessToken: integration.access_token };
}
