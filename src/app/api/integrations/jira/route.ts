import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const {
    siteUrl,
    email,
    apiToken,
  } = body as { siteUrl?: string; email?: string; apiToken?: string };
  if (!siteUrl?.trim() || !email?.trim() || !apiToken?.trim()) {
    return NextResponse.json(
      { error: "siteUrl, email, and apiToken required" },
      { status: 400 }
    );
  }
  const site = siteUrl.trim().replace(/\/$/, "");
  const supabase = createAdminClient();
  const { error } = await supabase.from("user_integrations").upsert(
    {
      user_id: userId,
      provider: "jira",
      access_token: apiToken.trim(),
      provider_metadata: { site, email: email.trim() },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
