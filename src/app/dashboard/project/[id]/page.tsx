import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { ProjectContent } from "./project-content";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ openReport?: string }>;
}) {
  const { id } = await params;
  const { openReport } = await searchParams;
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) notFound();

  const supabase = createAdminClient();
  const [
    { data: project, error },
    { data: reports },
    { data: automations },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, harvest_project_ids, client_emails, jira_project_keys, auto_schedule, created_at")
      .eq("id", id)
      .eq("owner_user_id", userId)
      .single(),
    supabase
      .from("reports")
      .select("id, period_type, period_start, period_end, status, created_at, approved_at, harvest_data_snapshot, report_format, report_config")
      .eq("project_id", id)
      .order("period_end", { ascending: false }),
    supabase
      .from("report_automations")
      .select("id, period_type, day_of_week, day_of_month, time_utc, is_active, title, requires_approval, report_format, report_config, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (error || !project) notFound();

  const harvestIds = (project.harvest_project_ids ?? []) as number[];
  const jiraKeys = (project.jira_project_keys ?? []) as string[];
  const clientEmails = (project.client_emails ?? []) as string[];

  return (
    <ProjectContent
      projectId={id}
      projectName={project.name}
      harvestIds={harvestIds}
      jiraKeys={jiraKeys}
      clientEmails={clientEmails}
      reports={reports ?? []}
      automations={automations ?? []}
      openReportId={openReport ?? undefined}
    />
  );
}
