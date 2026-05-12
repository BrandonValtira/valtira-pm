import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getJiraAccess } from "@/lib/jira-auth";
import { getJiraDoneLastMonthOAuth, getJiraRecentIssuesOAuth } from "@/lib/jira";
import { NextResponse } from "next/server";

/** GET: Debug why Jira might return no data. Only project owner. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: projectId } = await params;
  const supabase = createAdminClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, jira_project_keys, owner_user_id")
    .eq("id", projectId)
    .eq("owner_user_id", userId)
    .single();
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const jiraKeys = (project.jira_project_keys ?? []) as string[];
  const jiraAccess = await getJiraAccess(userId);

  const out: {
    projectId: string;
    jiraProjectKeys: string[];
    jiraConnected: boolean;
    hasCloudId: boolean;
    recentIssueCount?: number;
    recentError?: string;
    doneLastMonthCount?: number;
    doneError?: string;
    hint?: string;
  } = {
    projectId,
    jiraProjectKeys: jiraKeys,
    jiraConnected: !!jiraAccess,
    hasCloudId: !!(jiraAccess?.cloudId),
  };

  if (jiraKeys.length === 0) {
    out.hint = "Add Jira project keys in Project → Edit (e.g. PROJ, ENG).";
    return NextResponse.json(out);
  }
  if (!jiraAccess) {
    out.hint = "Jira is not connected. Connect Jira in Settings, then try again.";
    return NextResponse.json(out);
  }

  try {
    const recent = await getJiraRecentIssuesOAuth(
      jiraAccess.cloudId,
      jiraAccess.accessToken,
      jiraKeys,
      5
    );
    out.recentIssueCount = recent.length;
  } catch (e) {
    out.recentError = e instanceof Error ? e.message : String(e);
  }

  try {
    const done = await getJiraDoneLastMonthOAuth(
      jiraAccess.cloudId,
      jiraAccess.accessToken,
      jiraKeys,
      10
    );
    out.doneLastMonthCount = done.length;
  } catch (e) {
    out.doneError = e instanceof Error ? e.message : String(e);
  }

  if (out.recentIssueCount === 0 && !out.recentError) {
    out.hint = "Jira returned 0 issues. Check that project keys match your Jira board keys (e.g. PROJ).";
  }
  return NextResponse.json(out);
}
