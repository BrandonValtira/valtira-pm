import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

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

/** Upload a PDF to project context (Additional materials) */
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

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: "Expected multipart form with a PDF file" }, { status: 400 });
    }
  }
  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
  }
  const maxBytes = 20 * 1024 * 1024; // 20 MB
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "File too large (max 20 MB)" }, { status: 400 });
  }

  const ext = "pdf";
  const storagePath = `${projectId}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message || "Upload failed" },
      { status: 500 }
    );
  }

  const fileName = file.name || "document.pdf";
  const { data: row, error: insertError } = await supabase
    .from("project_files")
    .insert({
      project_id: projectId,
      file_name: fileName,
      storage_path: storagePath,
      file_type: "pdf_note",
    })
    .select("id, file_name, storage_path, file_type, uploaded_at")
    .single();

  if (insertError) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  return NextResponse.json(row);
}
