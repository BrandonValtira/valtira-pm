import { auth } from "@/auth";
import { resourcePlanningProjectExists } from "@/lib/resource-planning-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/** Add a Meet recording (Google Doc from Drive) to project context. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await auth();
  if (!(session?.user as { id?: string })?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const projectName = decodeURIComponent((await params).name);
  if (!projectName) return NextResponse.json({ error: "Project name required" }, { status: 400 });

  const supabase = createAdminClient();
  if (!(await resourcePlanningProjectExists(supabase, projectName))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { driveFileId?: string; fileName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const driveFileId = body.driveFileId?.trim();
  const fileName = body.fileName?.trim() || "Meet recording";
  if (!driveFileId) {
    return NextResponse.json({ error: "driveFileId is required" }, { status: 400 });
  }

  const { data: row, error } = await supabase
    .from("resource_planning_project_files")
    .insert({
      project_name: projectName,
      file_name: fileName,
      storage_path: driveFileId,
      file_type: "meet_recording",
      metadata: {},
    })
    .select("id, file_name, storage_path, file_type, uploaded_at, metadata")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(row);
}
