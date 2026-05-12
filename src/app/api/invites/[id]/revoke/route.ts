import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/** Revoke an invite – super_admin only */
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("used_at", null)
    .select("id, email")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Invite not found or already used" }, { status: 404 });

  const email = (data.email ?? "").trim().toLowerCase();
  if (email) {
    await supabase
      .from("users")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("email", email)
      .neq("role", "super_admin");
  }

  return NextResponse.json({ ok: true, invite: data });
}
