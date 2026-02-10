import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInviteEmail } from "@/lib/invite-email";
import { NextResponse } from "next/server";
import crypto from "crypto";

/** List invites (pending only) – super_admin only */
export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("invites")
    .select("id, email, role, created_at, expires_at, created_by_user_id")
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invites: data ?? [] });
}

/** Create invite and send email – super_admin only */
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  const role = (session?.user as { role?: string })?.role;
  if (role !== "super_admin" || !userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  const role = body.role === "super_admin" ? "super_admin" : "pm";

  const supabase = createAdminClient();

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { data: invite, error: insertError } = await supabase
    .from("invites")
    .insert({
      token,
      email,
      role,
      created_by_user_id: userId,
      expires_at: expiresAt.toISOString(),
    })
    .select("id, email, created_at, expires_at")
    .single();

  if (insertError) {
    if (insertError.code === "23505") return NextResponse.json({ error: "An invite for this email already exists" }, { status: 409 });
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const sendResult = await sendInviteEmail(email, token);
  if (sendResult.error) {
    return NextResponse.json({ error: `Invite created but email failed: ${sendResult.error}` }, { status: 502 });
  }

  return NextResponse.json(invite);
}
