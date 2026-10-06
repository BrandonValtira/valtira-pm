import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveOrgConnectionUserId } from "@/lib/org-connection";
import { redirect } from "next/navigation";
import { TeamInvites } from "./team-invites";

export default async function TeamPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "super_admin") redirect("/dashboard");

  const supabase = createAdminClient();

  const [{ data: users, error: usersError }, { data: invites, error: invitesError }, { data: integrations }] =
    await Promise.all([
      supabase
        .from("users")
        .select("id, email, name, role, status, accepted_at, created_at, org_connection")
        .in("status", ["active", "invited"])
        .order("created_at", { ascending: false }),
      supabase
        .from("invites")
        .select("id, email, role, created_at, expires_at")
        .is("used_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }),
      supabase
        .from("user_integrations")
        .select("user_id, provider")
        .in("provider", ["harvest", "google_drive", "jira"])
        .not("access_token", "is", null),
    ]);

  if (usersError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        Failed to load team: {usersError.message}
      </div>
    );
  }

  if (invitesError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        Failed to load invites: {invitesError.message}
      </div>
    );
  }

  const orgConnectionUserId = (await resolveOrgConnectionUserId(supabase)) ?? "";
  const connections: Record<string, { harvest: boolean; google: boolean; jira: boolean }> = {};
  for (const row of integrations ?? []) {
    const userId = row.user_id as string;
    const current = connections[userId] ?? { harvest: false, google: false, jira: false };
    if (row.provider === "harvest") current.harvest = true;
    if (row.provider === "google_drive") current.google = true;
    if (row.provider === "jira") current.jira = true;
    connections[userId] = current;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-neutral-900">Team</h1>
      <p className="mt-1 text-sm text-neutral-700">
        Invite people by email. Once they are active, you can set them as a Project Manager or Super Admin.
      </p>
      <TeamInvites
        users={users ?? []}
        invites={invites ?? []}
        currentUserId={(session?.user as { id?: string })?.id ?? ""}
        orgConnectionUserId={orgConnectionUserId}
        connections={connections}
      />
    </div>
  );
}
