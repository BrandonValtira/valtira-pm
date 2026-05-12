import { auth } from "@/auth";
import { getAppBaseUrl } from "@/lib/app-url";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const HARVEST_AUTHORIZE = "https://id.getharvest.com/oauth2/authorize";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  const clientId = process.env.HARVEST_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=harvest_not_configured", req.url)
    );
  }
  const baseUrl = getAppBaseUrl();
  const redirectUri = `${baseUrl}/api/auth/callback/harvest`;
  const state = crypto.randomUUID() + "-" + crypto.randomUUID().replace(/-/g, "");
  const cookieStore = await cookies();
  cookieStore.set("oauth_state_harvest", state, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  });
  const url = new URL(HARVEST_AUTHORIZE);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return NextResponse.redirect(url.toString());
}
