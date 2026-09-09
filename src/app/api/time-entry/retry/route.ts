import { auth } from "@/auth";
import { getEntryById } from "@/lib/project-anchor/db";
import { removeDuplicateHarvestEntry, syncEntryById } from "@/lib/project-anchor/sync";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { id?: string; action?: string };
  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Missing entry id" }, { status: 400 });
  }

  const existing = await getEntryById(id);
  if (!existing) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  try {
    if (body.action === "remove_duplicate") {
      const entry = await removeDuplicateHarvestEntry(id);
      return NextResponse.json({ entry });
    }
    const entry = await syncEntryById(id, true);
    return NextResponse.json({ entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Retry failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
