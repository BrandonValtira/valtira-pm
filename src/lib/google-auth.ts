import { createAdminClient } from "@/lib/supabase/admin";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Get valid Google access token for a user (Drive/Gmail). Refreshes token if needed. */
export async function getGoogleAccessToken(
  userId: string
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data: integration } = await supabase
    .from("user_integrations")
    .select("id, access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .eq("provider", "google_drive")
    .single();
  if (!integration?.access_token) return null;

  const expiresAt = integration.expires_at ? new Date(integration.expires_at).getTime() : 0;
  const bufferMs = 5 * 60 * 1000;
  if (integration.refresh_token && Date.now() >= expiresAt - bufferMs) {
    const clientId = process.env.AUTH_GOOGLE_ID;
    const clientSecret = process.env.AUTH_GOOGLE_SECRET;
    if (!clientId || !clientSecret) return integration.access_token;

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
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
      const newExpires = data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null;
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
