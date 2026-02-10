import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ATLASSIAN_TOKEN_URL = "https://auth.atlassian.com/oauth/token";
const ATLASSIAN_ACCESSIBLE_RESOURCES = "https://api.atlassian.com/oauth/token/accessible-resources";

export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieStore = await cookies();
  const savedState = cookieStore.get("oauth_state_jira")?.value;
  cookieStore.delete("oauth_state_jira");

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=jira_callback_failed", req.url)
    );
  }

  const clientId = process.env.ATLASSIAN_CLIENT_ID;
  const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=jira_not_configured", req.url)
    );
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/auth/callback/jira`;

  const tokenRes = await fetch(ATLASSIAN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return NextResponse.redirect(
      new URL(`/dashboard/settings?error=jira_token&message=${encodeURIComponent(text.slice(0, 100))}`, req.url)
    );
  }
  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  const resourcesRes = await fetch(ATLASSIAN_ACCESSIBLE_RESOURCES, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/json",
    },
  });
  if (!resourcesRes.ok) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=jira_resources", req.url)
    );
  }
  const resources = (await resourcesRes.json()) as { id: string; name: string; url: string }[];
  const first = resources?.[0];
  if (!first) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=jira_no_site", req.url)
    );
  }

  const supabase = createAdminClient();
  await supabase.from("user_integrations").upsert(
    {
      user_id: userId,
      provider: "jira",
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? null,
      expires_at: expiresAt,
      provider_metadata: {
        cloud_id: first.id,
        site_url: first.url,
        site_name: first.name,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );

  return NextResponse.redirect(new URL("/dashboard/settings?jira=connected", req.url));
}
