import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { generateProjectSummary } from "@/lib/gemini/summary";

async function getProjectAndCheckOwner(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
  userId: string
) {
  const { data } = await supabase
    .from("projects")
    .select("id, name, harvest_project_ids, jira_project_keys")
    .eq("id", projectId)
    .eq("owner_user_id", userId)
    .single();
  return data;
}

/** Generate project summary (mood, budget, next steps) from context. No persistence. */
export async function POST(
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
  const project = await getProjectAndCheckOwner(supabase, projectId, userId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { summary, jiraReturnedNothing } = await generateProjectSummary(supabase, projectId, project, userId);
    return NextResponse.json({ summary, jiraReturnedNothing });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate summary";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
