import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rpProjectDisplayTitle } from "@/lib/resource-planning-projects";
import { ProjectsListClient } from "./projects-client";

export default async function ProjectsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-800">
        Sign in to view projects.
      </div>
    );
  }

  const supabase = createAdminClient();
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  const minWeek = d.toISOString().slice(0, 10);

  const [allocRes, metaRes, sowRes] = await Promise.all([
    supabase
      .from("resource_planning_allocations")
      .select("project_name")
      .gte("week_start", minWeek),
    supabase
      .from("resource_planning_projects")
      .select("project_name, display_title, harvest_project_ids, harvest_project_names"),
    supabase.from("resource_planning_project_files").select("project_name"),
  ]);

  const allocNames = Array.from(
    new Set((allocRes.data ?? []).map((r) => r.project_name).filter(Boolean))
  );

  const meta: Record<
    string,
    {
      display_title: string | null;
      harvest_project_ids: number[];
      harvest_project_names: string[];
      sow_count: number;
    }
  > = {};

  for (const row of metaRes.data ?? []) {
    meta[row.project_name] = {
      display_title: row.display_title ?? null,
      harvest_project_ids: Array.isArray(row.harvest_project_ids) ? row.harvest_project_ids : [],
      harvest_project_names: Array.isArray(row.harvest_project_names) ? row.harvest_project_names : [],
      sow_count: 0,
    };
  }

  for (const row of sowRes.data ?? []) {
    if (!meta[row.project_name]) {
      meta[row.project_name] = {
        display_title: null,
        harvest_project_ids: [],
        harvest_project_names: [],
        sow_count: 0,
      };
    }
    meta[row.project_name].sow_count += 1;
  }

  const allNames = Array.from(new Set([...allocNames, ...Object.keys(meta)])).sort((a, b) =>
    rpProjectDisplayTitle(a, meta[a]).localeCompare(
      rpProjectDisplayTitle(b, meta[b]),
      undefined,
      { sensitivity: "base" }
    )
  );

  const initialProjects = allNames.map((projectName) => ({
    projectName,
    meta: meta[projectName] ?? {
      display_title: null,
      harvest_project_ids: [],
      harvest_project_names: [],
      sow_count: 0,
    },
  }));

  return <ProjectsListClient initialProjects={initialProjects} />;
}
