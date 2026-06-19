import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  RP_SOW_BUCKET,
  rpSowStoragePath,
} from "@/lib/resource-planning-projects";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

async function projectExists(
  supabase: ReturnType<typeof createAdminClient>,
  projectName: string
): Promise<boolean> {
  const [{ data: meta }, { data: alloc }] = await Promise.all([
    supabase.from("resource_planning_projects").select("project_name").eq("project_name", projectName).maybeSingle(),
    supabase
      .from("resource_planning_allocations")
      .select("id")
      .eq("project_name", projectName)
      .limit(1)
      .maybeSingle(),
  ]);
  return Boolean(meta || alloc);
}

/** List SOW PDFs for a resource planning project. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await auth();
  if (!(session?.user as { id?: string })?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const projectName = decodeURIComponent((await params).name);
  if (!projectName) return NextResponse.json({ error: "Project name required" }, { status: 400 });

  const supabase = createAdminClient();
  if (!(await projectExists(supabase, projectName))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("resource_planning_project_files")
    .select("id, file_name, uploaded_at")
    .eq("project_name", projectName)
    .eq("file_type", "sow")
    .order("uploaded_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ files: data ?? [] });
}

/** Upload a SOW PDF. */
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
  if (!(await projectExists(supabase, projectName))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
  }
  const maxBytes = 20 * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "File too large (max 20 MB)" }, { status: 400 });
  }

  const fileId = randomUUID();
  const storagePath = rpSowStoragePath(fileId);
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(RP_SOW_BUCKET)
    .upload(storagePath, buffer, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message || "Upload failed" }, { status: 500 });
  }

  const fileName = file.name || "sow.pdf";
  const { data: row, error: insertError } = await supabase
    .from("resource_planning_project_files")
    .insert({
      project_name: projectName,
      file_name: fileName,
      storage_path: storagePath,
      file_type: "sow",
    })
    .select("id, file_name, uploaded_at")
    .single();

  if (insertError) {
    await supabase.storage.from(RP_SOW_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(row);
}
