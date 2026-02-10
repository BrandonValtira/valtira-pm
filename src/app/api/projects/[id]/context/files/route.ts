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

/** List project context files (PDFs, meet recordings, transcripts) */
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
  const project = await getProjectAndCheckOwner(supabase, projectId, userId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: files, error } = await supabase
    .from("project_files")
    .select("id, file_name, storage_path, file_type, uploaded_at, metadata")
    .eq("project_id", projectId)
    .order("uploaded_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ files: files ?? [] });
}
