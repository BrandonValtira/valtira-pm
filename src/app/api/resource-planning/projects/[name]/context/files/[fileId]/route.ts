import { auth } from "@/auth";
import { resourcePlanningProjectExists } from "@/lib/resource-planning-context";
import { RP_SOW_BUCKET } from "@/lib/resource-planning-projects";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/** Delete an additional material or meet recording (not SOWs). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string; fileId: string }> }
) {
  const session = await auth();
  if (!(session?.user as { id?: string })?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const projectName = decodeURIComponent((await params).name);
  const { fileId } = await params;
  if (!projectName) return NextResponse.json({ error: "Project name required" }, { status: 400 });

  const supabase = createAdminClient();
  if (!(await resourcePlanningProjectExists(supabase, projectName))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: row, error: fetchError } = await supabase
    .from("resource_planning_project_files")
    .select("id, storage_path, file_type")
    .eq("id", fileId)
    .eq("project_name", projectName)
    .single();

  if (fetchError || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (row.file_type === "sow") {
    return NextResponse.json({ error: "Remove SOWs from the Statements of work section." }, { status: 400 });
  }

  if (row.file_type === "pdf_note" && row.storage_path) {
    await supabase.storage.from(RP_SOW_BUCKET).remove([row.storage_path]);
  }

  const { error: deleteError } = await supabase
    .from("resource_planning_project_files")
    .delete()
    .eq("id", fileId)
    .eq("project_name", projectName);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
