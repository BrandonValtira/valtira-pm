import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, harvest_project_ids, client_emails, jira_project_keys, auto_schedule, created_at")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ projects: projects ?? [] });
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const {
    name,
    harvestProjectIds,
    clientEmails,
    jiraProjectKeys,
  } = body as {
    name?: string;
    harvestProjectIds?: number[];
    clientEmails?: string[];
    jiraProjectKeys?: string[];
  };
  if (!name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const supabase = createAdminClient();
  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      owner_user_id: userId,
      name: name.trim(),
      harvest_project_ids: Array.isArray(harvestProjectIds) ? harvestProjectIds : [],
      client_emails: Array.isArray(clientEmails) ? clientEmails.filter(Boolean) : [],
      jira_project_keys: Array.isArray(jiraProjectKeys) ? jiraProjectKeys.filter(Boolean) : [],
      updated_at: new Date().toISOString(),
    })
    .select("id, name, harvest_project_ids, client_emails, jira_project_keys, created_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(project);
}
