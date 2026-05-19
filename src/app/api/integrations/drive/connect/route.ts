import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  const clientId = process.env.AUTH_GOOGLE_ID;
  if (!clientId) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=drive_not_configured", req.url)
    );
  }
  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/auth/callback/drive`;
  const state = crypto.randomUUID() + "-" + crypto.randomUUID().replace(/-/g, "");
  const cookieStore = await cookies();
  cookieStore.set("oauth_state_drive", state, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  });
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    ["openid", "email", "profile", DRIVE_SCOPE, GMAIL_SEND_SCOPE, CALENDAR_READONLY_SCOPE].join(" ")
  );
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return NextResponse.redirect(url.toString());
}
