import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { RP_SOW_BUCKET } from "@/lib/resource-planning-projects";
import { NextResponse } from "next/server";

/** View or delete a SOW PDF. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string; fileId: string }> }
) {
  const session = await auth();
  if (!(session?.user as { id?: string })?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const projectName = decodeURIComponent((await params).name);
  const fileId = (await params).fileId;
  const supabase = createAdminClient();

  const { data: row, error } = await supabase
    .from("resource_planning_project_files")
    .select("id, file_name, storage_path, project_name")
    .eq("id", fileId)
    .eq("project_name", projectName)
    .single();

  if (error || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from(RP_SOW_BUCKET)
    .download(row.storage_path);

  if (downloadError || !blob) {
    return NextResponse.json({ error: downloadError?.message || "Download failed" }, { status: 500 });
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(row.file_name)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string; fileId: string }> }
) {
  const session = await auth();
  if (!(session?.user as { id?: string })?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const projectName = decodeURIComponent((await params).name);
  const fileId = (await params).fileId;
  const supabase = createAdminClient();

  const { data: row, error } = await supabase
    .from("resource_planning_project_files")
    .select("id, storage_path")
    .eq("id", fileId)
    .eq("project_name", projectName)
    .single();

  if (error || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await supabase.storage.from(RP_SOW_BUCKET).remove([row.storage_path]);
  const { error: deleteError } = await supabase
    .from("resource_planning_project_files")
    .delete()
    .eq("id", fileId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
