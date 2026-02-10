import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

async function getProjectAndCheckOwner(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, harvest_project_ids, client_emails, jira_project_keys, auto_schedule, day_of_week, time_utc, contract_expiry_date")
    .eq("id", projectId)
    .eq("owner_user_id", userId)
    .single();
  if (error || !data) return null;
  return data;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const supabase = createAdminClient();
  const project = await getProjectAndCheckOwner(supabase, id, userId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const supabase = createAdminClient();
  const existing = await getProjectAndCheckOwner(supabase, id, userId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json();
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (Array.isArray(body.harvestProjectIds)) updates.harvest_project_ids = body.harvestProjectIds;
  if (Array.isArray(body.clientEmails)) updates.client_emails = body.clientEmails.filter(Boolean);
  if (Array.isArray(body.jiraProjectKeys)) updates.jira_project_keys = body.jiraProjectKeys.filter(Boolean);
  if (["off", "weekly", "monthly"].includes(body.auto_schedule)) updates.auto_schedule = body.auto_schedule;
  if (typeof body.day_of_week === "number") updates.day_of_week = body.day_of_week;
  if (typeof body.time_utc === "string") updates.time_utc = body.time_utc;
  if (body.contract_expiry_date !== undefined) updates.contract_expiry_date = body.contract_expiry_date || null;

  const { data, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const supabase = createAdminClient();
  const existing = await getProjectAndCheckOwner(supabase, id, userId);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
