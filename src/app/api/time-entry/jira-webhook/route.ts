import { getWebhookSecret } from "@/lib/project-anchor/config";
import { handleWorklogEvent } from "@/lib/project-anchor/sync";
import { SyncError } from "@/lib/project-anchor/types";
import { parseWorklogWebhook, verifyWebhookAuth } from "@/lib/project-anchor/webhook";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const rawBody = await req.text();
  const secret = getWebhookSecret();
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret is not configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const ok = verifyWebhookAuth({
    rawBody,
    signatureHeader: req.headers.get("x-hub-signature"),
    queryToken: url.searchParams.get("token") ?? url.searchParams.get("secret"),
    secret,
  });
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = parseWorklogWebhook(payload);
  if (!event) {
    return NextResponse.json({ ok: true, ignored: true, reason: "not_a_worklog_event" });
  }

  try {
    const result = await handleWorklogEvent(event);
    return NextResponse.json({
      ok: true,
      ignored: result.ignored,
      worklogId: event.worklogId,
      status: result.entry?.sync_status ?? null,
    });
  } catch (error) {
    console.error("Project Anchor webhook error:", error);
    const message = error instanceof Error ? error.message : "Sync failed";
    const retryable = error instanceof SyncError ? error.retryable : true;
    return NextResponse.json({ ok: false, error: message }, { status: retryable ? 502 : 200 });
  }
}
