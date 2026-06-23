"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EditRpProjectModal } from "@/components/projects/edit-rp-project-modal";
import { MiniBudgetIndicator } from "@/components/projects/mini-budget-indicator";
import { ProjectBudgetSection } from "@/components/projects/project-budget-section";
import { ProjectContextSection } from "@/components/projects/project-context-section";
import { ProjectSowsSection } from "@/components/projects/project-sows-section";
import type { ResourcePlanningBudgetSummary } from "@/lib/fetch-resource-planning-budget";
import {
  confirmDeleteResourcePlanningProject,
  deleteResourcePlanningProject,
  rpProjectDetailPath,
  rpProjectDisplayTitle,
  type ResourcePlanningProjectMeta,
} from "@/lib/resource-planning-projects";

type ProjectListItem = {
  projectName: string;
  meta: ResourcePlanningProjectMeta & { sow_count?: number };
};

export function ProjectDetailClient({
  projectName,
  initialMeta,
  scrollToSows,
  driveConnected = false,
  jiraConnected = false,
}: {
  projectName: string;
  initialMeta: ResourcePlanningProjectMeta;
  scrollToSows?: boolean;
  driveConnected?: boolean;
  jiraConnected?: boolean;
}) {
  const router = useRouter();
  const [meta, setMeta] = useState(initialMeta);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [contextFilesRefreshKey, setContextFilesRefreshKey] = useState(0);

  const displayTitle = rpProjectDisplayTitle(projectName, meta);

  const refreshMeta = useCallback(async () => {
    const res = await fetch(`/api/resource-planning/projects/${encodeURIComponent(projectName)}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMeta({
        display_title: data.display_title ?? null,
        harvest_project_ids: data.harvest_project_ids ?? [],
        harvest_project_names: data.harvest_project_names ?? [],
        jira_project_keys: data.jira_project_keys ?? [],
      });
    }
  }, [projectName]);

  useEffect(() => {
    if (!scrollToSows) return;
    const el = document.getElementById("project-sows");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [scrollToSows]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  async function handleDelete() {
    if (!confirmDeleteResourcePlanningProject(displayTitle)) return;
    setDeleting(true);
    try {
      const res = await deleteResourcePlanningProject(projectName);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete");
      }
      router.push("/dashboard/projects");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete project");
      setDeleting(false);
    }
  }

  const linkedLabel = (() => {
    const names = meta.harvest_project_names ?? [];
    if (names.length === 0) return "Not linked to Harvest";
    if (names.length === 1) return names[0];
    return `${names.length} Harvest projects linked`;
  })();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/dashboard/projects"
            className="text-sm text-neutral-500 hover:text-neutral-800"
          >
            ← Projects
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-900">{displayTitle}</h1>
          <p className="mt-0.5 text-sm text-neutral-500">{linkedLabel}</p>
        </div>
        <div className="relative shrink-0" data-project-detail-menu>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="rounded border border-neutral-300 bg-white p-2 text-neutral-600 hover:bg-neutral-50"
            aria-label="Project options"
            aria-expanded={menuOpen}
          >
            <span aria-hidden className="text-base leading-none">⋮</span>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-0.5 min-w-[140px] rounded border border-neutral-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  setEditOpen(true);
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Edit project
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  void handleDelete();
                }}
                disabled={deleting}
                className="w-full px-3 py-1.5 text-left text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete project"}
              </button>
            </div>
          )}
        </div>
      </div>

      <ProjectBudgetSection projectName={projectName} />

      <section
        id="project-sows"
        className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm scroll-mt-4"
      >
        <h2 className="text-lg font-medium text-neutral-900">Statements of work</h2>
        <div className="mt-4">
          <ProjectSowsSection
            projectName={projectName}
            onChanged={() => setContextFilesRefreshKey((k) => k + 1)}
          />
        </div>
      </section>

      <ProjectContextSection
        resourcePlanningProjectName={projectName}
        jiraKeys={meta.jira_project_keys ?? []}
        driveConnected={driveConnected}
        jiraConnected={jiraConnected}
        filesRefreshKey={contextFilesRefreshKey}
      />

      {editOpen && (
        <EditRpProjectModal
          key={projectName}
          projectName={projectName}
          initialDisplayTitle={meta.display_title ?? ""}
          harvestProjectIds={meta.harvest_project_ids ?? []}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            void refreshMeta();
          }}
        />
      )}
    </div>
  );
}

export function ProjectsListClient({
  initialProjects,
}: {
  initialProjects: ProjectListItem[];
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [budgetByProject, setBudgetByProject] = useState<
    Record<string, ResourcePlanningBudgetSummary>
  >({});
  const [budgetLoading, setBudgetLoading] = useState(true);
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    const res = await fetch("/api/resource-planning/projects");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const names: string[] = data.projects ?? [];
    const meta = data.projectMeta ?? {};
    const allNames = Array.from(
      new Set([...names, ...Object.keys(meta)])
    ).sort((a, b) =>
      rpProjectDisplayTitle(a, meta[a]).localeCompare(
        rpProjectDisplayTitle(b, meta[b]),
        undefined,
        { sensitivity: "base" }
      )
    );
    setProjects(
      allNames.map((projectName) => ({
        projectName,
        meta: {
          display_title: meta[projectName]?.display_title ?? null,
          harvest_project_ids: meta[projectName]?.harvest_project_ids ?? [],
          harvest_project_names: meta[projectName]?.harvest_project_names ?? [],
          sow_count: meta[projectName]?.sow_count ?? 0,
        },
      }))
    );
  }, []);

  const projectNames = useMemo(() => projects.map((p) => p.projectName), [projects]);

  useEffect(() => {
    if (projectNames.length === 0) {
      setBudgetLoading(false);
      return;
    }
    let cancelled = false;
    setBudgetLoading(true);
    fetch("/api/resource-planning/projects/budget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectNames }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.summaries) setBudgetByProject(data.summaries);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBudgetLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectNames]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? projects.filter(
        (p) =>
          rpProjectDisplayTitle(p.projectName, p.meta).toLowerCase().includes(q) ||
          p.projectName.toLowerCase().includes(q)
      )
    : projects;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Projects</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Same projects as the Resource calendar — allocations, SOWs, and budget in one place.
          </p>
        </div>
        <Link
          href="/dashboard/resource-planning"
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Open Resource calendar
        </Link>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search projects…"
        className="mb-4 w-full max-w-md rounded-lg border border-neutral-300 px-3 py-2 text-sm"
      />

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-600">
          {projects.length === 0
            ? "No projects yet. Add a project from the Resource calendar."
            : "No projects match your search."}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.map(({ projectName, meta }) => {
            const title = rpProjectDisplayTitle(projectName, meta);
            const sowCount = meta.sow_count ?? 0;
            return (
              <li key={projectName}>
                <Link
                  href={rpProjectDetailPath(projectName)}
                  className="flex h-full flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-neutral-900">
                      {title}
                    </h2>
                    <MiniBudgetIndicator
                      summary={budgetByProject[projectName]}
                      loading={
                        budgetLoading &&
                        (meta.harvest_project_ids ?? []).length > 0 &&
                        budgetByProject[projectName] === undefined
                      }
                    />
                  </div>
                  <p className="mt-1 truncate text-xs text-neutral-500">
                    {(meta.harvest_project_names ?? [])[0] ?? "Not linked to Harvest"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {sowCount > 0 && (
                      <span className="rounded bg-neutral-100 px-2 py-0.5 text-neutral-700">
                        {sowCount} SOW{sowCount === 1 ? "" : "s"}
                      </span>
                    )}
                    <span className="text-neutral-400">View details →</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <button type="button" className="sr-only" onClick={() => reload()} aria-hidden>
        reload
      </button>
    </div>
  );
}
