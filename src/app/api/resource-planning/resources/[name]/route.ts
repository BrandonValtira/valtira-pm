import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/** Delete all allocations for a resource (remove resource from planning). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await auth();
  if (!(session?.user as { id?: string })?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const name = decodeURIComponent((await params).name);
  if (!name) return NextResponse.json({ error: "Resource name required" }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("resource_planning_allocations")
    .delete()
    .eq("resource_name", name);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
