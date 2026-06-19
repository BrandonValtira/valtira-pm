import { auth } from "@/auth";
import { resolveHarvestAccessForDirectory } from "@/lib/harvest-directory";
import {
  fetchResourcePlanningBudgetDetail,
  loadResourcePlanningProjectMeta,
} from "@/lib/fetch-resource-planning-budget";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const name = decodeURIComponent((await params).name);
  if (!name) return NextResponse.json({ error: "Project name required" }, { status: 400 });

  const harvest = await resolveHarvestAccessForDirectory(userId);
  if (!harvest) {
    return NextResponse.json(
      { error: "Harvest is not connected. Connect Harvest in Settings to see budget data." },
      { status: 400 }
    );
  }

  const input = await loadResourcePlanningProjectMeta(name);
  const detail = await fetchResourcePlanningBudgetDetail(harvest, input);
  return NextResponse.json(detail);
}
