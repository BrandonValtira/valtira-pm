import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

const BUCKET = "project-files";

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

/** Delete a project context file (removes from DB and storage if applicable) */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: projectId, fileId } = await params;
  const supabase = createAdminClient();
  const project = await getProjectAndCheckOwner(supabase, projectId, userId);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: row, error: fetchError } = await supabase
    .from("project_files")
    .select("id, storage_path, file_type")
    .eq("id", fileId)
    .eq("project_id", projectId)
    .single();

  if (fetchError || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Remove from storage if it's a PDF (we store in our bucket); meet_recordings use storage_path as drive id
  if (row.file_type === "pdf_note" && row.storage_path) {
    await supabase.storage.from(BUCKET).remove([row.storage_path]);
  }

  const { error: deleteError } = await supabase
    .from("project_files")
    .delete()
    .eq("id", fileId)
    .eq("project_id", projectId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
