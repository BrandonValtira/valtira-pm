import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCanonicalSuperAdminUserId } from "@/lib/google-integration-resolve";

const ATLASSIAN_TOKEN_URL = "https://auth.atlassian.com/oauth/token";

export type JiraOAuthAccess = {
  cloudId: string;
  accessToken: string;
  siteUrl: string | null;
};

function parseJiraMeta(rawMeta: unknown): { cloud_id?: string; site_url?: string } | null {
  if (typeof rawMeta === "string") {
    try {
      return JSON.parse(rawMeta) as { cloud_id?: string; site_url?: string };
    } catch {
      return null;
    }
  }
  if (rawMeta && typeof rawMeta === "object") {
    return rawMeta as { cloud_id?: string; site_url?: string };
  }
  return null;
}

/** Get valid Jira access token and cloud ID for a user. Refreshes token if needed. */
export async function getJiraAccess(userId: string): Promise<JiraOAuthAccess | null> {
  const supabase = createAdminClient();
  const { data: integration } = await supabase
    .from("user_integrations")
    .select("id, access_token, refresh_token, expires_at, provider_metadata")
    .eq("user_id", userId)
    .eq("provider", "jira")
    .maybeSingle();
  if (!integration?.access_token) return null;

  const meta = parseJiraMeta(integration.provider_metadata);
  const cloudId = meta?.cloud_id;
  if (!cloudId) return null;
  const siteUrl = typeof meta?.site_url === "string" && meta.site_url.trim() ? meta.site_url.replace(/\/$/, "") : null;

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
        return { cloudId, accessToken: data.access_token, siteUrl };
      }
    }
  }
  return { cloudId, accessToken: integration.access_token, siteUrl };
}

/** Org Jira connection: super admin first, then any connected Jira user. */
export async function resolveOrgJiraAccess(): Promise<JiraOAuthAccess | null> {
  const supabase = createAdminClient();
  const superAdminId = await resolveCanonicalSuperAdminUserId(supabase);
  const ordered: string[] = [];
  if (superAdminId) ordered.push(superAdminId);
  const { data: rows } = await supabase.from("user_integrations").select("user_id").eq("provider", "jira");
  for (const row of rows ?? []) {
    const uid = (row as { user_id?: string }).user_id;
    if (uid && !ordered.includes(uid)) ordered.push(uid);
  }
  for (const uid of ordered) {
    const access = await getJiraAccess(uid);
    if (access) return access;
  }
  return null;
}
