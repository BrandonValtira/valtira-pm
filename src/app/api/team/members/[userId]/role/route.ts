import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const ROLES = ["pm", "super_admin"] as const;
type TeamRole = (typeof ROLES)[number];

/** Change an active member's role. Super admins only; you cannot change your own role. */
export async function PATCH(
  req: Request,
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
    return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const nextRole = body?.role;
  if (!ROLES.includes(nextRole)) {
    return NextResponse.json({ error: "Role must be Project Manager or Super Admin." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: target, error: fetchError } = await supabase
    .from("users")
    .select("id, status")
    .eq("id", userId)
    .maybeSingle();

  if (fetchError || !target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.status !== "active") {
    return NextResponse.json(
      { error: "Role can be changed after the user is active." },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabase
    .from("users")
    .update({
      role: nextRole as TeamRole,
      updated_at: new Date().toISOString(),
      ...(nextRole === "pm" ? { org_connection: false } : {}),
    })
    .eq("id", userId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, role: nextRole });
}
