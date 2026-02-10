import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

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
  const savedState = cookieStore.get("oauth_state_drive")?.value;
  cookieStore.delete("oauth_state_drive");

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=drive_callback_failed", req.url)
    );
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=drive_not_configured", req.url)
    );
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/auth/callback/drive`;

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
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
      new URL(`/dashboard/settings?error=drive_token&message=${encodeURIComponent(text.slice(0, 80))}`, req.url)
    );
  }
  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;

  const supabase = createAdminClient();
  await supabase.from("user_integrations").upsert(
    {
      user_id: userId,
      provider: "google_drive",
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token ?? null,
      expires_at: expiresAt,
      provider_metadata: {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );

  return NextResponse.redirect(new URL("/dashboard/settings?drive=connected", req.url));
}
