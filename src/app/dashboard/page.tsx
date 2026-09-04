import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { DashboardAccounts } from "@/components/dashboard-accounts";
import { DashboardOnboardingWrapper } from "@/components/dashboard-onboarding-wrapper";
import { DashboardUtilizationWidgets } from "@/components/dashboard-utilization-widgets";
import { OutgoingReportsList } from "@/components/outgoing-reports-list";
import { isOutdatedAutomation } from "@/lib/report-config";

export default async function DashboardPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-800">
        <p className="font-medium">Your session doesn’t have a user id.</p>
        <p className="mt-1 text-sm">Sign out and sign back in to fix it.</p>
        <SignOutButton className="mt-4 inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700" />
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
  const { data: existingAutomations } = projectIds.length > 0
    ? await supabase
        .from("report_automations")
        .select("project_id, report_config")
        .in("project_id", projectIds)
    : { data: [] };
  const projectIdsNeedingReview = new Set(
    (reportsNeedingReview ?? []).map((r: { project_id: string }) => r.project_id)
  );
  const projectIdsNeedingAutomationUpdate = new Set(
    (existingAutomations ?? [])
      .filter((a: { report_config?: unknown }) => isOutdatedAutomation(a.report_config))
      .map((a: { project_id: string }) => a.project_id)
  );

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        Failed to load projects: {error.message}
      </div>
    );
  }

  const connectedProviders = new Set(
    (integrations ?? []).map((r) => r.provider as string).filter(Boolean)
  );
  const harvestConnected = connectedProviders.has("harvest");
  const jiraConnected = connectedProviders.has("jira");
  const driveConnected = connectedProviders.has("google_drive");

  return (
    <DashboardOnboardingWrapper
      integrations={{
        harvest: harvestConnected,
        jira: jiraConnected,
        google_drive: driveConnected,
      }}
    >
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Dashboard</h1>
      </div>

      <section className="mb-8">
        <h2 className="mb-4 text-lg font-medium text-neutral-900">My reports</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects?.map((project) => (
            <li key={project.id}>
              <Link
                href={`/dashboard/project/${project.id}`}
                className="block rounded-xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:border-neutral-300 hover:shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-medium text-neutral-900">{project.name}</h2>
                    <p className="mt-1 text-xs text-neutral-700">
                      Added {new Date(project.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                  {projectIdsNeedingAutomationUpdate.has(project.id) && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                      Needs update
                    </span>
                  )}
                  {projectIdsNeedingReview.has(project.id) && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                      Needs review
                    </span>
                  )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/dashboard/projects/new"
              className="flex min-h-[94px] flex-col items-center justify-center gap-1 rounded-xl border border-neutral-200 bg-neutral-100 p-6 text-neutral-600 transition hover:border-neutral-300 hover:bg-neutral-200 hover:text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
            >
              <span className="text-2xl font-light leading-none">+</span>
              <span className="text-sm font-medium">Add project</span>
            </Link>
          </li>
        </ul>
      </section>

      <section className="mb-8 grid gap-4 lg:grid-cols-3">
        <OutgoingReportsList />
        <DashboardUtilizationWidgets />
      </section>

      <section className="mb-8">
        <DashboardAccounts
          connected={{
            harvest: harvestConnected,
            jira: jiraConnected,
            google_drive: driveConnected,
          }}
        />
      </section>
    </div>
    </DashboardOnboardingWrapper>
  );
}
