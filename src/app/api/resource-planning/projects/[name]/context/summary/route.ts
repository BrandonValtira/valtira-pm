import { auth } from "@/auth";
import { generateResourcePlanningProjectSummary } from "@/lib/gemini/summary";
import { resourcePlanningProjectExists } from "@/lib/resource-planning-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const projectName = decodeURIComponent((await params).name);
  if (!projectName) return NextResponse.json({ error: "Project name required" }, { status: 400 });

  const supabase = createAdminClient();
  if (!(await resourcePlanningProjectExists(supabase, projectName))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: project } = await supabase
    .from("resource_planning_projects")
    .select("project_name, display_title, harvest_project_ids, jira_project_keys")
    .eq("project_name", projectName)
    .maybeSingle();

  const row = project ?? {
    project_name: projectName,
    display_title: null,
    harvest_project_ids: [],
    jira_project_keys: [],
  };

  try {
    const { summary, jiraReturnedNothing } = await generateResourcePlanningProjectSummary(
      supabase,
      projectName,
      row,
      userId
    );
    return NextResponse.json({ summary, jiraReturnedNothing });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
