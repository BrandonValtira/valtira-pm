import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
        Your session doesn’t have a user id. Try signing out and back in.
      </div>
    );
  }

  const supabase = createAdminClient();
  const [
    { data: projects, error },
    { data: integrations },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, created_at")
      .eq("owner_user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("user_integrations")
      .select("provider")
      .eq("user_id", userId)
      .not("access_token", "is", null),
  ]);
  const projectIds = (projects ?? []).map((p) => p.id);
  const { data: reportsNeedingReview } = projectIds.length > 0
    ? await supabase
        .from("reports")
        .select("project_id")
        .in("project_id", projectIds)
        .in("status", ["pending_approval", "rejected"])
    : { data: [] };
  const projectIdsNeedingReview = new Set(
    (reportsNeedingReview ?? []).map((r: { project_id: string }) => r.project_id)
  );

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        Failed to load projects: {error.message}
      </div>
    );
  }

  const connectedProviders = new Set((integrations ?? []).map((r) => r.provider));
  const harvestConnected = connectedProviders.has("harvest");
  const jiraConnected = connectedProviders.has("jira");

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <h1 className="text-2xl font-semibold text-neutral-900">My projects</h1>
          <div className="flex items-center gap-3 text-sm">
            {harvestConnected ? (
              <span className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-neutral-600">
                <span className="text-green-600" aria-hidden>✓</span>
                Harvest
              </span>
            ) : (
              <Link
                href="/dashboard/settings"
                className="flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-orange-600 hover:bg-orange-100 hover:text-orange-700"
              >
                <span className="text-neutral-400" aria-hidden>○</span>
                Connect Harvest
              </Link>
            )}
            {jiraConnected ? (
              <span className="flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-neutral-600">
                <span className="text-green-600" aria-hidden>✓</span>
                Jira
              </span>
            ) : (
              <Link
                href="/dashboard/settings"
                className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-blue-600 hover:bg-blue-100 hover:text-blue-700"
              >
                <span className="text-neutral-400" aria-hidden>○</span>
                Connect Jira
              </Link>
            )}
          </div>
        </div>
        <Link
          href="/dashboard/projects/new"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Add project
        </Link>
      </div>

      {!projects?.length ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
          <p className="text-neutral-500">You don’t have any projects yet.</p>
          <Link
            href="/dashboard/projects/new"
            className="mt-4 inline-block text-sm font-medium text-neutral-900 underline hover:no-underline"
          >
            Add your first project
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/dashboard/project/${project.id}`}
                className="block rounded-xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:border-neutral-300 hover:shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-medium text-neutral-900">{project.name}</h2>
                    <p className="mt-1 text-xs text-neutral-500">
                      Added {new Date(project.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {projectIdsNeedingReview.has(project.id) && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                      Needs review
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
