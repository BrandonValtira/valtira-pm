import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!(session?.user as { id?: string })?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  const minWeek = d.toISOString().slice(0, 10);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("resource_planning_allocations")
    .select("resource_name")
    .gte("week_start", minWeek);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const names = Array.from(new Set((data ?? []).map((r) => r.resource_name))).sort();
  return NextResponse.json({ resources: names });
}
