import { auth } from "@/auth";
import { upsertDefaultRole } from "@/lib/project-anchor/users";
import { NextResponse } from "next/server";

export async function PUT(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    harvest_user_id?: number;
    harvest_email?: string | null;
    harvest_display_name?: string | null;
    default_harvest_task_name?: string | null;
  };
  if (!body.harvest_user_id) {
    return NextResponse.json({ error: "harvest_user_id is required" }, { status: 400 });
  }
  try {
    const map = await upsertDefaultRole({
      harvest_user_id: Number(body.harvest_user_id),
      harvest_email: body.harvest_email ?? null,
      harvest_display_name: body.harvest_display_name ?? null,
      default_harvest_task_name: body.default_harvest_task_name?.trim() || null,
    });
    return NextResponse.json({ map });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save default role";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
