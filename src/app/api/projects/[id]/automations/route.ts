import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

async function getProjectAndCheckOwner(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
  userId: string
) {
  const { data } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_user_id", userId)
    .single();
  return data;
}

/** List automations for this project */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;
  const supabase = createAdminClient();
  const project = await getProjectAndCheckOwner(supabase, projectId, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data: automations, error } = await supabase
    .from("report_automations")
    .select("id, period_type, day_of_week, day_of_month, time_utc, is_active, title, requires_approval, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ automations: automations ?? [] });
}

/** Create an automation */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;
  const supabase = createAdminClient();
  const project = await getProjectAndCheckOwner(supabase, projectId, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const periodType = body.periodType === "month" ? "month" : "week";
  const timeUtc = typeof body.timeUtc === "string" && /^\d{1,2}:\d{2}$/.test(body.timeUtc) ? body.timeUtc : "09:00";
  const dayOfWeek = periodType === "week" && typeof body.dayOfWeek === "number" && body.dayOfWeek >= 0 && body.dayOfWeek <= 6 ? body.dayOfWeek : null;
  const dayOfMonth = periodType === "month" && typeof body.dayOfMonth === "number" && body.dayOfMonth >= 1 && body.dayOfMonth <= 28 ? body.dayOfMonth : 1;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) || null : null;
  const requiresApproval = body.requiresApproval === false ? false : true;
  const { data: automation, error } = await supabase
    .from("report_automations")
    .insert({
      project_id: projectId,
      period_type: periodType,
      day_of_week: periodType === "week" ? dayOfWeek : null,
      day_of_month: periodType === "month" ? dayOfMonth : null,
      time_utc: timeUtc,
      is_active: true,
      title: title,
      requires_approval: requiresApproval,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(automation);
}
