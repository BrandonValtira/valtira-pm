import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/** Point company Harvest and Jira at an active super admin. */
export async function PATCH(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  const adminId = (session?.user as { id?: string })?.id;
  if (role !== "super_admin" || !adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!userId) {
    return NextResponse.json({ error: "Choose a super admin." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: target, error: fetchError } = await supabase
    .from("users")
    .select("id, role, status")
    .eq("id", userId)
    .maybeSingle();

  if (fetchError || !target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.role !== "super_admin" || target.status !== "active") {
    return NextResponse.json(
      { error: "Company logins can only be assigned to an active super admin." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { error: clearError } = await supabase
    .from("users")
    .update({ org_connection: false, updated_at: now })
    .eq("org_connection", true);
  if (clearError) {
    return NextResponse.json({ error: clearError.message }, { status: 500 });
  }

  const { error: setError } = await supabase
    .from("users")
    .update({ org_connection: true, updated_at: now })
    .eq("id", userId)
    .eq("role", "super_admin")
    .eq("status", "active");
  if (setError) {
    return NextResponse.json({ error: setError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId });
}
