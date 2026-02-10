import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { TeamInvites } from "./team-invites";

export default async function TeamPage() {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  if (role !== "super_admin") redirect("/dashboard");

  const supabase = createAdminClient();

  const [
    { data: users, error: usersError },
    { data: invites, error: invitesError },
  ] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, name, role, status, accepted_at, created_at")
      .neq("role", "super_admin")
      .order("created_at", { ascending: false }),
    supabase
      .from("invites")
      .select("id, email, role, created_at, expires_at")
      .is("used_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
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

  return (
    <div>
      <h1 className="text-2xl font-semibold text-neutral-900">Team</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Invite PMs by email. Once they accept, they can sign in with Google and connect Harvest & Jira in Settings.
      </p>
      <TeamInvites users={users ?? []} invites={invites ?? []} />
    </div>
  );
}
