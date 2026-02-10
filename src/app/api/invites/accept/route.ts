import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/** Mark an invite as used (after user has signed in). Session email must match invite email. */
export async function POST(req: Request) {
  const session = await auth();
  const email = (session?.user?.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ error: "Token is required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: invite, error: fetchError } = await supabase
    .from("invites")
    .select("id, email, used_at")
    .eq("token", token)
    .single();

  if (fetchError || !invite) return NextResponse.json({ error: "Invalid or expired invite" }, { status: 404 });
  if (invite.used_at) return NextResponse.json({ error: "Invite already used" }, { status: 400 });
  if (invite.email.toLowerCase() !== email) {
    return NextResponse.json({ error: "This invite was sent to a different email address" }, { status: 403 });
  }

  const { error: updateError } = await supabase
    .from("invites")
    .update({ used_at: new Date().toISOString() })
    .eq("id", invite.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
