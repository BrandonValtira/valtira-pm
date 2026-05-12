import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getJiraProjects, getJiraProjectsOAuth } from "@/lib/jira";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data: integration } = await supabase
    .from("user_integrations")
    .select("access_token, provider_metadata")
    .eq("user_id", userId)
    .eq("provider", "jira")
    .single();
  if (!integration?.access_token) {
    return NextResponse.json(
      { error: "Jira not connected. Connect Jira on the dashboard." },
      { status: 400 }
    );
  }
  const meta = integration.provider_metadata as {
    cloud_id?: string;
    site?: string;
    email?: string;
  };
  try {
    if (meta?.cloud_id) {
      const projects = await getJiraProjectsOAuth(meta.cloud_id, integration.access_token);
      return NextResponse.json({ projects });
    }
    if (meta?.site && meta?.email) {
      const projects = await getJiraProjects(
        meta.site,
        meta.email,
        integration.access_token
      );
      return NextResponse.json({ projects });
    }
    return NextResponse.json(
      { error: "Jira not fully connected. Reconnect Jira on the dashboard." },
      { status: 400 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Jira API error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
