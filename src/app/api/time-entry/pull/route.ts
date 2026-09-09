import { auth } from "@/auth";
import { runReconciliation } from "@/lib/project-anchor/reconciliation";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runReconciliation();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Project Anchor Jira pull error:", error);
    const message = error instanceof Error ? error.message : "Sync from Jira failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
