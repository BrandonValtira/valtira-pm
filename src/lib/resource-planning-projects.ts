export const RP_SOW_BUCKET = "project-files";
export const RP_SOW_STORAGE_PREFIX = "resource-planning-sows";

/** Storage keys must be URL-safe (no brackets, spaces, etc.). Project name lives in DB only. */
export function rpSowStoragePath(fileId: string): string {
  return `${RP_SOW_STORAGE_PREFIX}/${fileId}.pdf`;
}

export type ResourcePlanningProjectMeta = {
  display_title: string | null;
  harvest_project_ids: number[];
  harvest_project_names: string[];
  jira_project_keys?: string[];
  contract_expiry_date?: string | null;
  sow_count?: number;
  /** Set when exactly one SOW exists — used to open the PDF directly. */
  sole_sow_id?: string | null;
};

export function rpProjectDisplayTitle(
  projectName: string,
  meta?: Pick<ResourcePlanningProjectMeta, "display_title"> | null
): string {
  return meta?.display_title?.trim() || projectName;
}

export function rpProjectDetailPath(projectName: string, hash?: string): string {
  const base = `/dashboard/projects/${encodeURIComponent(projectName)}`;
  return hash ? `${base}${hash}` : base;
}

export function rpProjectSowsHash(): string {
  return "#sows";
}

export function rpSowViewApiPath(projectName: string, fileId: string): string {
  return `/api/resource-planning/projects/${encodeURIComponent(projectName)}/sows/${fileId}`;
}

/** One SOW → PDF API; multiple → project detail SOW section. */
export function rpProjectSowLink(
  projectName: string,
  sowCount: number,
  soleSowId?: string | null
): { href: string; openInNewTab: boolean; title: string } {
  if (sowCount === 1 && soleSowId) {
    return {
      href: rpSowViewApiPath(projectName, soleSowId),
      openInNewTab: true,
      title: "Open SOW PDF",
    };
  }
  return {
    href: `${rpProjectDetailPath(projectName)}?section=sows`,
    openInNewTab: false,
    title: sowCount > 1 ? "Choose an SOW on the project page" : "View SOWs on project page",
  };
}

export const DELETE_RP_PROJECT_MESSAGE =
  "This will permanently remove the project from the Projects list and the Resource calendar, including all allocations and uploaded SOWs. This cannot be undone.";

export async function deleteResourcePlanningProject(projectName: string): Promise<Response> {
  return fetch(`/api/resource-planning/projects/${encodeURIComponent(projectName)}`, {
    method: "DELETE",
  });
}

export function confirmDeleteResourcePlanningProject(displayTitle: string): boolean {
  return confirm(
    `Delete "${displayTitle}"?\n\n${DELETE_RP_PROJECT_MESSAGE}`
  );
}
