import { auth } from "@/auth";
import { runReconciliation } from "@/lib/project-anchor/reconciliation";
import { NextResponse } from "next/server";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

function cronSecretMatches(req: Request, secret: string): boolean {
  const trimmed = secret.trim();
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${trimmed}`) return true;
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer?.trim() === trimmed) return true;
  if (req.headers.get("x-cron-secret")?.trim() === trimmed) return true;
  return false;
}

async function isAuthorized(req: Request): Promise<boolean> {
  if (req.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && cronSecretMatches(req, secret)) return true;
  const session = await auth();
  return Boolean((session?.user as { id?: string })?.id);
}

export async function GET(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runReconciliation();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Project Anchor reconcile error:", error);
    const message = error instanceof Error ? error.message : "Reconcile failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
