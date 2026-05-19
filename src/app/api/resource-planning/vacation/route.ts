import { auth } from "@/auth";
import {
  resolveCanonicalSuperAdminUserId,
  resolveGoogleAccessTokenForTeam,
} from "@/lib/google-integration-resolve";
import { ensureValidHarvestToken } from "@/lib/harvest-oauth-refresh";
import { getHarvestUsers } from "@/lib/harvest";
import {
  fetchVacationWeeksByResource,
  getVacationCalendarId,
} from "@/lib/vacation-calendar";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

type HarvestIntegrationRow = {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  provider_metadata: unknown;
};

function getHarvestAccountId(meta: unknown): string | undefined {
  const v = (meta as { account_id?: string })?.account_id;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

async function resourceNamesForVacationMatching(
  supabase: ReturnType<typeof createAdminClient>,
  sessionUserId: string,
  minWeek: string
): Promise<string[]> {
  const names = new Set<string>();

  const { data: allocRows } = await supabase
    .from("resource_planning_allocations")
    .select("resource_name")
    .gte("week_start", minWeek);
  for (const row of allocRows ?? []) {
    if (row.resource_name?.trim()) names.add(row.resource_name.trim());
  }

  const superAdminId = await resolveCanonicalSuperAdminUserId(supabase);
  const ordered: string[] = [];
  if (superAdminId) ordered.push(superAdminId);
  if (!ordered.includes(sessionUserId)) ordered.push(sessionUserId);

  for (const uid of ordered) {
    const { data: integration } = await supabase
      .from("user_integrations")
      .select("id, access_token, refresh_token, expires_at, provider_metadata")
      .eq("user_id", uid)
      .eq("provider", "harvest")
      .maybeSingle();
    const row = integration as HarvestIntegrationRow | null;
    const accountId = getHarvestAccountId(row?.provider_metadata);
    if (!row?.access_token || !accountId) continue;
    try {
      const accessToken = await ensureValidHarvestToken(supabase, {
        id: row.id,
        access_token: row.access_token,
        refresh_token: row.refresh_token,
        expires_at: row.expires_at,
      });
      const users = await getHarvestUsers(accountId, accessToken);
      for (const u of users) {
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
        if (name) names.add(name);
      }
      break;
    } catch {
      // Harvest optional for vacation name list
    }
  }

  return Array.from(names);
}

export async function GET(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const calendarId = getVacationCalendarId();
  if (!calendarId) {
    return NextResponse.json({
      configured: false,
      weeksByResource: {},
      message:
        "Vacation calendar is not configured. Set GOOGLE_VACATION_CALENDAR_ID in environment variables.",
    });
  }

  const url = new URL(req.url);
  let weekStart = url.searchParams.get("weekStart")?.slice(0, 10);
  const weekEnd = url.searchParams.get("weekEnd")?.slice(0, 10);
  if (!weekStart || !weekEnd) {
    return NextResponse.json(
      { error: "weekStart and weekEnd query parameters are required" },
      { status: 400 }
    );
  }

  const google = await resolveGoogleAccessTokenForTeam(userId);
  if (!google) {
    return NextResponse.json(
      {
        configured: true,
        connected: false,
        weeksByResource: {},
        message:
          "Google is not connected. A super admin should connect Google in Settings (with Calendar access) to load vacation weeks.",
      },
      { status: 200 }
    );
  }

  const supabase = createAdminClient();
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  const minWeek = d.toISOString().slice(0, 10);
  if (weekStart < minWeek) weekStart = minWeek;

  const resourceNames = await resourceNamesForVacationMatching(supabase, userId, minWeek);

  try {
    const { weeksByResource, calendarNames } = await fetchVacationWeeksByResource(
      google.accessToken,
      calendarId,
      weekStart,
      weekEnd,
      resourceNames
    );
    return NextResponse.json({
      configured: true,
      connected: true,
      weeksByResource,
      calendarNames,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load vacation calendar";
    const calendarApiDisabled =
      message.includes("Google Calendar API has not been used") ||
      message.includes("accessNotConfigured");
    const needsScope =
      !calendarApiDisabled &&
      (message.includes("403") ||
        message.toLowerCase().includes("insufficient") ||
        message.toLowerCase().includes("scope"));
    const userMessage = calendarApiDisabled
      ? "Google Calendar API is disabled in your Google Cloud project. Enable “Google Calendar API” for the OAuth app, wait a minute, then reload."
      : needsScope
        ? "Google Calendar access is missing. Reconnect Google in Settings to grant calendar read access."
        : message;
    return NextResponse.json(
      {
        configured: true,
        connected: true,
        weeksByResource: {},
        error: message,
        calendarApiDisabled,
        needsReconnect: needsScope,
        message: userMessage,
      },
      { status: calendarApiDisabled || needsScope ? 403 : 502 }
    );
  }
}
