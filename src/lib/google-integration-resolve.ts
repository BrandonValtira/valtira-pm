import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleAccessToken } from "@/lib/google-auth";
import { resolveOrgConnectionUserId } from "@/lib/org-connection";

/** Company Harvest, PTO, and Jira account. Explicit team-page choice, else env super admin. */
export async function resolveCanonicalSuperAdminUserId(
  supabase: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  return resolveOrgConnectionUserId(supabase);
}

/**
 * Google token for team-wide features (vacation calendar): company login when connected,
 * otherwise the signed-in user’s Google.
 */
export async function resolveGoogleAccessTokenForTeam(
  sessionUserId: string
): Promise<{ accessToken: string; userId: string } | null> {
  const supabase = createAdminClient();
  const superAdminId = await resolveCanonicalSuperAdminUserId(supabase);
  const ordered: string[] = [];
  if (superAdminId) ordered.push(superAdminId);
  if (!ordered.includes(sessionUserId)) ordered.push(sessionUserId);
  for (const uid of ordered) {
    const token = await getGoogleAccessToken(uid);
    if (token) return { accessToken: token, userId: uid };
  }
  return null;
}
