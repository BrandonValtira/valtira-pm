import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const HARVEST_TOKEN_URL = "https://id.getharvest.com/api/v2/oauth2/token";
const HARVEST_ACCOUNTS_URL = "https://id.getharvest.com/api/v2/accounts";

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
  const savedState = cookieStore.get("oauth_state_harvest")?.value;
  cookieStore.delete("oauth_state_harvest");

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=harvest_callback_failed", req.url)
    );
  }

  const clientId = process.env.HARVEST_CLIENT_ID;
  const clientSecret = process.env.HARVEST_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=harvest_not_configured", req.url)
    );
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/auth/callback/harvest`;

  const tokenRes = await fetch(HARVEST_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return NextResponse.redirect(
      new URL(`/dashboard/settings?error=harvest_token&message=${encodeURIComponent(text.slice(0, 100))}`, req.url)
    );
  }
  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  const accountsRes = await fetch(HARVEST_ACCOUNTS_URL, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "User-Agent": "Valtira-PM (valtira.net)",
    },
  });
  let accountId: string | null = null;
  if (accountsRes.ok) {
    const accountsData = (await accountsRes.json()) as {
      accounts?: { id: number; product: string }[];
    };
    const harvestAccount = accountsData.accounts?.find((a) => a.product === "harvest");
    if (harvestAccount) accountId = String(harvestAccount.id);
  }
  if (!accountId && tokenData.scope) {
    const m = tokenData.scope.match(/harvest:(\d+)/);
    if (m) accountId = m[1];
  }
  if (!accountId) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=harvest_no_account", req.url)
    );
  }

  const supabase = createAdminClient();
  await supabase.from("user_integrations").upsert(
    {
      user_id: userId,
      provider: "harvest",
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? null,
      expires_at: expiresAt,
      provider_metadata: { account_id: accountId },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );

  return NextResponse.redirect(new URL("/dashboard/settings?harvest=connected", req.url));
}
