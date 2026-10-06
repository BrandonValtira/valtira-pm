import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Whose connected accounts supply company Harvest and Jira.
 * An explicit team-page choice wins. Otherwise the env super admin, then any active super admin.
 */
export async function resolveOrgConnectionUserId(
  supabase: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  const { data: admins } = await supabase
    .from("users")
    .select("id, email, org_connection")
    .eq("role", "super_admin")
    .eq("status", "active");
  if (!admins?.length) return null;

  const designated = admins.find((admin) => admin.org_connection === true);
  if (designated) return designated.id;

  const envEmail =
    process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ||
    process.env.AUTH_SUPER_ADMIN_EMAIL?.trim().toLowerCase() ||
    null;
  if (envEmail) {
    const match = admins.find(
      (admin) => typeof admin.email === "string" && admin.email.trim().toLowerCase() === envEmail
    );
    if (match) return match.id;
  }

  return admins[0].id;
}
