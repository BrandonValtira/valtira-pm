import { auth } from "@/auth";
import {
  resourcePlanningProjectExists,
  rpContextMaterialStoragePath,
} from "@/lib/resource-planning-context";
import { RP_SOW_BUCKET } from "@/lib/resource-planning-projects";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

/** Upload a PDF to additional materials (not SOW — use Statements of work section). */
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
  const storagePath = rpContextMaterialStoragePath(fileId);
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(RP_SOW_BUCKET)
    .upload(storagePath, buffer, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message || "Upload failed" }, { status: 500 });
  }

  const fileName = file.name || "document.pdf";
  const { data: row, error: insertError } = await supabase
    .from("resource_planning_project_files")
    .insert({
      project_name: projectName,
      file_name: fileName,
      storage_path: storagePath,
      file_type: "pdf_note",
    })
    .select("id, file_name, storage_path, file_type, uploaded_at")
    .single();

  if (insertError) {
    await supabase.storage.from(RP_SOW_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(row);
}
