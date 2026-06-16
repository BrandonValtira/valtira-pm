import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

async function checkAutomationOwner(
  supabase: ReturnType<typeof createAdminClient>,
  automationId: string,
  userId: string
): Promise<boolean> {
  const { data: automation } = await supabase
    .from("report_automations")
    .select("id, project_id")
    .eq("id", automationId)
    .single();
  if (!automation) return false;
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", automation.project_id)
    .eq("owner_user_id", userId)
    .single();
  return !!project;
}

/** Update automation (e.g. toggle is_active, or schedule) */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const supabase = createAdminClient();
  const allowed = await checkAutomationOwner(supabase, id, userId);
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if (typeof body.title === "string") updates.title = body.title.trim().slice(0, 200) || null;
  if (typeof body.requiresApproval === "boolean") updates.requires_approval = body.requiresApproval;
  if (body.periodType === "month" || body.periodType === "week") updates.period_type = body.periodType;
  if (typeof body.timeUtc === "string" && /^\d{1,2}:\d{2}$/.test(body.timeUtc)) updates.time_utc = body.timeUtc;
  if (typeof body.dayOfWeek === "number" && body.dayOfWeek >= 0 && body.dayOfWeek <= 6) updates.day_of_week = body.dayOfWeek;
  if (body.reportFormat === "budget_allocation" || body.reportFormat === "standard") {
    updates.report_format = body.reportFormat;
  }
  const { data, error } = await supabase
    .from("report_automations")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** Delete automation */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const supabase = createAdminClient();
  const allowed = await checkAutomationOwner(supabase, id, userId);
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { error } = await supabase.from("report_automations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
