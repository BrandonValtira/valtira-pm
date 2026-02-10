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

/** Add a Meet recording (Google Doc from Drive) to project context. */
export async function POST(
  req: Request,
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
    .from("project_files")
    .insert({
      project_id: projectId,
      file_name: fileName,
      storage_path: driveFileId,
      file_type: "meet_recording",
      metadata: {},
    })
    .select("id, file_name, storage_path, file_type, uploaded_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(row);
}
