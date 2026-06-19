import { auth } from "@/auth";
import {
  mapRpFileToContextFile,
  resourcePlanningProjectExists,
  type RpProjectFileRow,
} from "@/lib/resource-planning-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/** List context files (SOWs appear as additional materials automatically). */
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
  if (!(await resourcePlanningProjectExists(supabase, projectName))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("resource_planning_project_files")
    .select("id, file_name, storage_path, file_type, uploaded_at, metadata")
    .eq("project_name", projectName)
    .order("uploaded_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const files = (data ?? []).map((row) => mapRpFileToContextFile(row as RpProjectFileRow));
  return NextResponse.json({ files });
}
