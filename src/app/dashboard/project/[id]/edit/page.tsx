import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EditProjectForm } from "./edit-project-form";

export default async function ProjectEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) notFound();

  const supabase = createAdminClient();
  const { data: project, error } = await supabase
    .from("projects")
    .select("id, name, harvest_project_ids, client_emails, jira_project_keys")
    .eq("id", id)
    .eq("owner_user_id", userId)
    .single();

  if (error || !project) notFound();

  const harvestIds = (project.harvest_project_ids ?? []) as number[];
  const jiraKeys = (project.jira_project_keys ?? []) as string[];
  const clientEmails = (project.client_emails ?? []) as string[];

  return (
    <div>
      <Link
        href={`/dashboard/project/${id}`}
        className="text-sm text-neutral-500 hover:text-neutral-700"
      >
        ← Back to project
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-neutral-900">Edit project</h1>
      <div className="mt-6">
        <EditProjectForm
          projectId={id}
          projectName={project.name}
          initialHarvestIds={harvestIds}
          initialJiraKeys={jiraKeys}
          initialClientEmails={clientEmails}
        />
      </div>
    </div>
  );
}
