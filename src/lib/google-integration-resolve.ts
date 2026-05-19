import { createAdminClient } from "@/lib/supabase/admin";
import { getGoogleAccessToken } from "@/lib/google-auth";

/** Prefer env-matched super admin, else any active super_admin. */
export async function resolveCanonicalSuperAdminUserId(
  supabase: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  const envEmail =
    process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ||
    process.env.AUTH_SUPER_ADMIN_EMAIL?.trim().toLowerCase() ||
    null;
  const { data: admins } = await supabase
    .from("users")
    .select("id, email")
    .eq("role", "super_admin")
    .eq("status", "active");
  if (!admins?.length) return null;
  if (envEmail) {
    const match = admins.find(
      (a) => typeof a.email === "string" && a.email.trim().toLowerCase() === envEmail
    );
    if (match) return match.id;
  }
  return admins[0].id;
}

/**
 * Google token for team-wide features (vacation calendar): super admin’s Google when connected,
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
