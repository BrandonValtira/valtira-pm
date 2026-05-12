import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/** Revoke a PM team member (super_admin only; cannot revoke self). */
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  const adminId = (session?.user as { id?: string })?.id;
  if (role !== "super_admin" || !adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;
  if (!userId || userId === adminId) {
    return NextResponse.json({ error: "You cannot revoke your own account." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: target, error: fetchError } = await supabase
    .from("users")
    .select("id, role, status")
    .eq("id", userId)
    .single();

  if (fetchError || !target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.role === "super_admin") {
    return NextResponse.json({ error: "Cannot revoke a super admin" }, { status: 403 });
  }
  if (target.status === "revoked") {
    return NextResponse.json({ error: "This account is already revoked" }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("users")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
