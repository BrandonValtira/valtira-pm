import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/** Validate an invite token (no auth). Returns { valid: true } or { valid: false }. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return NextResponse.json({ valid: false });
  }

  const supabase = createAdminClient();
  const { data: invite } = await supabase
    .from("invites")
    .select("id")
    .eq("token", token)
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  return NextResponse.json({ valid: !!invite });
}
