import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleAccessToken } from "@/lib/google-auth";
import { resolveOrgConnectionUserId } from "@/lib/org-connection";

/** Company Harvest and Jira account. Explicit team-page choice, else env super admin. */
export async function resolveCanonicalSuperAdminUserId(
  supabase: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  return resolveOrgConnectionUserId(supabase);
}

/**
 * One Google login for the shared vacation calendar, used for every viewer.
 * Prefers the original super admin when they still have Google connected,
 * then the company data connection, then any other active user with Google.
 */
export async function resolveGoogleAccessTokenForTeam(): Promise<{ accessToken: string; userId: string } | null> {
  const supabase = createAdminClient();
  const { data: rows } = await supabase
    .from("user_integrations")
    .select("user_id")
    .eq("provider", "google_drive")
    .not("access_token", "is", null);
  const connected = new Set(
    (rows ?? [])
      .map((row) => row.user_id as string | null)
      .filter((id): id is string => Boolean(id))
  );
  if (connected.size === 0) return null;

  const { data: users } = await supabase
    .from("users")
    .select("id, email")
    .in("id", Array.from(connected))
    .eq("status", "active");
  const active = users ?? [];
  if (active.length === 0) return null;

  const ordered: string[] = [];
  const envEmail =
    process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ||
    process.env.AUTH_SUPER_ADMIN_EMAIL?.trim().toLowerCase() ||
    null;
  if (envEmail) {
    const envUser = active.find(
      (user) => typeof user.email === "string" && user.email.trim().toLowerCase() === envEmail
    );
    if (envUser) ordered.push(envUser.id);
  }

  const companyUserId = await resolveOrgConnectionUserId(supabase);
  if (companyUserId && connected.has(companyUserId) && !ordered.includes(companyUserId)) {
    ordered.push(companyUserId);
  }
  for (const user of active) {
    if (!ordered.includes(user.id)) ordered.push(user.id);
  }

  for (const userId of ordered) {
    const accessToken = await getGoogleAccessToken(userId);
    if (accessToken) return { accessToken, userId };
  }
  return null;
}
