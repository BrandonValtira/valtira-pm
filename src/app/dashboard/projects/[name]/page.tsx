import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { ProjectDetailClient } from "../projects-client";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-800">
        Sign in to view this project.
      </div>
    );
  }

  const projectName = decodeURIComponent((await params).name);
  const sp = await searchParams;
  const scrollToSows = sp.section === "sows";

  const supabase = createAdminClient();
  const [{ data: meta }, { data: alloc }, { data: integrations }] = await Promise.all([
    supabase
      .from("resource_planning_projects")
      .select("display_title, harvest_project_ids, harvest_project_names, jira_project_keys")
      .eq("project_name", projectName)
      .maybeSingle(),
    supabase
      .from("resource_planning_allocations")
      .select("id")
      .eq("project_name", projectName)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("user_integrations")
      .select("provider")
      .eq("user_id", userId)
      .not("access_token", "is", null),
  ]);

  if (!meta && !alloc) notFound();

  const connectedProviders = new Set((integrations ?? []).map((r) => r.provider as string));

  return (
    <ProjectDetailClient
      projectName={projectName}
      initialMeta={{
        display_title: meta?.display_title ?? null,
        harvest_project_ids: Array.isArray(meta?.harvest_project_ids) ? meta.harvest_project_ids : [],
        harvest_project_names: Array.isArray(meta?.harvest_project_names) ? meta.harvest_project_names : [],
        jira_project_keys: Array.isArray(meta?.jira_project_keys) ? meta.jira_project_keys : [],
      }}
      scrollToSows={scrollToSows}
      driveConnected={connectedProviders.has("google_drive")}
      jiraConnected={connectedProviders.has("jira")}
    />
  );
}
