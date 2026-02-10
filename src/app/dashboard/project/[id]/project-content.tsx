"use client";

import Link from "next/link";
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
}) {
  const actionsRef = useRef<HTMLDivElement>(null);
  const [slotReady, setSlotReady] = useState(false);

  return (
    <div>
      <Link
        href="/dashboard"
        className="text-sm text-neutral-700 hover:text-neutral-900"
      >
        ← Back to projects
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
      <ProjectContextSection projectId={projectId} jiraKeys={jiraKeys} driveConnected={driveConnected} />
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
    </div>
  );
}
