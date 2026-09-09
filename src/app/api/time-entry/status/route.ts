import { auth } from "@/auth";
import { loadTimeEntryDashboard } from "@/lib/project-anchor/dashboard";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const data = await loadTimeEntryDashboard(userId);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Time Sync data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
