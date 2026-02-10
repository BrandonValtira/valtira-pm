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
  const { accessToken, accountId } = body as { accessToken?: string; accountId?: string };
  if (!accessToken?.trim() || !accountId?.trim()) {
    return NextResponse.json(
      { error: "accessToken and accountId required" },
      { status: 400 }
    );
  }
  const supabase = createAdminClient();
  const { error } = await supabase.from("user_integrations").upsert(
    {
      user_id: userId,
      provider: "harvest",
      access_token: accessToken.trim(),
      provider_metadata: { account_id: String(accountId).trim() },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("user_integrations")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "harvest");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
