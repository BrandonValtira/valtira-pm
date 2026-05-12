"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { useRef, useState } from "react";
import { ProjectContextSection } from "./project-context-section";
import { ReportSection } from "./report-section";

export function ProjectContent({
  projectId,
  projectName,
  harvestIds,
  jiraKeys,
  clientEmails,
  reports,
  automations,
  openReportId,
  driveConnected,
  jiraConnected,
}: {
  projectId: string;
  projectName: string;
  harvestIds: number[];
  jiraKeys: string[];
  clientEmails: string[];
  reports: ComponentProps<typeof ReportSection>["initialReports"];
  automations: ComponentProps<typeof ReportSection>["initialAutomations"];
  openReportId?: string;
  driveConnected?: boolean;
  jiraConnected?: boolean;
}) {
  const router = useRouter();
  const actionsRef = useRef<HTMLDivElement>(null);
  const [slotReady, setSlotReady] = useState(false);
  const [deleteSectionOpen, setDeleteSectionOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function handleDeleteProject() {
    if (!deleteConfirm) return;
    setDeleteError("");
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(data.error || "Failed to delete project");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div>
      <Link
        href="/dashboard"
        className="text-sm text-neutral-700 hover:text-neutral-900"
      >
        ← Back to dashboard
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-neutral-900">
          {projectName}
        </h1>
        <div
          ref={(el) => {
            (actionsRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
            if (el) queueMicrotask(() => setSlotReady(true));
          }}
        />
      </div>
      <p className="mt-1 text-sm text-neutral-700">
        Active automations: {automations.filter((a) => a.is_active).length}
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-medium text-neutral-900">Harvest projects</h2>
            <Link
              href={`/dashboard/project/${projectId}/edit?section=harvest`}
              className="shrink-0 rounded p-1 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
              aria-label="Edit Harvest projects"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </Link>
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            {harvestIds.length ? `IDs: ${harvestIds.join(", ")}` : "None linked"}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-medium text-neutral-900">Jira project keys</h2>
            <Link
              href={`/dashboard/project/${projectId}/edit?section=jira`}
              className="shrink-0 rounded p-1 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
              aria-label="Edit Jira project keys"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </Link>
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            {jiraKeys.length ? jiraKeys.join(", ") : "None"}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-medium text-neutral-900">Report recipients</h2>
            <Link
              href={`/dashboard/project/${projectId}/edit?section=recipients`}
              className="shrink-0 rounded p-1 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900"
              aria-label="Edit report recipients"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </Link>
          </div>
          <p className="mt-1 text-sm text-neutral-600">
            {clientEmails.length ? clientEmails.join(", ") : "None"}
          </p>
        </div>
      </div>
      <ReportSection
        projectId={projectId}
        initialReports={reports}
        initialAutomations={automations}
        clientEmails={clientEmails}
        initialOpenReportId={openReportId}
        actionsContainerRef={actionsRef}
        actionsSlotReady={slotReady}
      />
      <ProjectContextSection projectId={projectId} jiraKeys={jiraKeys} driveConnected={driveConnected} jiraConnected={jiraConnected} />

      <div className="mt-12">
        {!deleteSectionOpen ? (
          <button
            type="button"
            onClick={() => setDeleteSectionOpen(true)}
            className="rounded-lg border border-red-300 bg-transparent px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Delete project
          </button>
        ) : (
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
            <h2 className="text-sm font-medium text-red-900">Delete project</h2>
            <p className="mt-1 text-sm text-red-800">
              Permanently delete this project and all its reports, automations, and history. This cannot be undone.
            </p>
            {deleteError && <p className="mt-2 text-sm text-red-600">{deleteError}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-red-900">
                <input
                  type="checkbox"
                  checked={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.checked)}
                  className="rounded border-red-300 text-red-600 focus:ring-red-500"
                />
                I understand, delete this project
              </label>
              <button
                type="button"
                onClick={handleDeleteProject}
                disabled={!deleteConfirm || deleteLoading}
                className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:hover:bg-white"
              >
                {deleteLoading ? "Deleting…" : "Delete project"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteSectionOpen(false);
                  setDeleteConfirm(false);
                  setDeleteError("");
                }}
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
