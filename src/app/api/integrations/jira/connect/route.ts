import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const ATLASSIAN_AUTHORIZE = "https://auth.atlassian.com/authorize";
const JIRA_SCOPES = "read:jira-work read:jira-user offline_access";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  const clientId = process.env.ATLASSIAN_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=jira_not_configured", req.url)
    );
  }
  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/auth/callback/jira`;
  const state = crypto.randomUUID() + "-" + crypto.randomUUID().replace(/-/g, "");
  const cookieStore = await cookies();
  cookieStore.set("oauth_state_jira", state, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  });
  const url = new URL(ATLASSIAN_AUTHORIZE);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", JIRA_SCOPES);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("prompt", "consent");
  return NextResponse.redirect(url.toString());
}
