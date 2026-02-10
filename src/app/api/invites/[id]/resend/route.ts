import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInviteEmail } from "@/lib/invite-email";
import { NextResponse } from "next/server";
import crypto from "crypto";

/** Resend invite email (new token, new expiry) – super_admin only */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("invites")
    .select("id, email")
    .eq("id", id)
    .is("used_at", null)
    .is("revoked_at", null)
    .single();
  if (!existing) return NextResponse.json({ error: "Invite not found or already used/revoked" }, { status: 404 });

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { error: updateError } = await supabase
    .from("invites")
    .update({
      token,
      expires_at: expiresAt.toISOString(),
    })
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const sendResult = await sendInviteEmail(existing.email, token);
  if (sendResult.error) {
    return NextResponse.json({ error: sendResult.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true, email: existing.email });
}
