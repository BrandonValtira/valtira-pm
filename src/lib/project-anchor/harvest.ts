import { resolveHarvestAccessForDirectory, resolveOrgHarvestAccess } from "@/lib/harvest-directory";
import { IN_REQUEST_RETRIES } from "./config";
import { harvestEntryIssueKey } from "./duplicates";
import { firstLockedHarvestEntry, harvestEntryIsLocked } from "./harvest-lock";
import { SyncError } from "./types";
import type { HarvestTaskAssignment } from "./tasks";

const HARVEST_API = "https://api.harvestapp.com/v2";
const USER_AGENT = "Valtira-PM-Project-Anchor (https://pm.valtira.net)";

let harvestSessionUserId: string | null = null;

async function resolveHarvestCredentials(sessionUserId?: string | null): Promise<{
  accountId: string;
  accessToken: string;
}> {
  const accountId = process.env.HARVEST_ACCOUNT_ID?.trim();
  const accessToken = process.env.HARVEST_ACCESS_TOKEN?.trim();
  if (accountId && accessToken) return { accountId, accessToken };

  const connected = sessionUserId
    ? await resolveHarvestAccessForDirectory(sessionUserId)
    : await resolveOrgHarvestAccess();
  if (connected) return connected;

  throw new Error(
    "Harvest is not connected. Connect Harvest in Settings (super admin), or set HARVEST_ACCOUNT_ID and HARVEST_ACCESS_TOKEN."
  );
}

/** Prefer env tokens, then super-admin Harvest, then this user's Harvest connection. */
export async function withHarvestSessionUser<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  const previous = harvestSessionUserId;
  harvestSessionUserId = userId;
  try {
    return await fn();
  } finally {
    harvestSessionUserId = previous;
  }
}

export type HarvestUserWithEmail = {
  id: number;
  first_name: string;
  last_name: string;
  email?: string;
  is_active: boolean;
  is_contractor?: boolean;
};

export type HarvestProjectWithCode = {
  id: number;
  name: string;
  code: string | null;
  is_active: boolean;
};

export type HarvestTimeEntryWrite = {
  id: number;
  user: { id: number; name: string };
  project: { id: number; name: string; code?: string | null };
  task: { id: number; name: string };
  spent_date: string;
  hours: number;
  notes: string | null;
  is_locked?: boolean;
  locked_reason?: string | null;
  external_reference?: { id: string; permalink?: string } | null;
};

export type HarvestTimeEntryListItem = {
  id: number;
  user: { id: number; name: string };
  project: { id: number; name: string };
  task: { id: number; name: string };
  spent_date: string;
  hours: number;
  notes: string | null;
  is_locked?: boolean;
  locked_reason?: string | null;
  external_reference?: { id: string; permalink?: string } | null;
};

function headers(accountId: string, accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Harvest-Account-Id": accountId,
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function harvestRequest<T>(path: string, init?: RequestInit, attempt = 0): Promise<T> {
  const { accountId, accessToken } = await resolveHarvestCredentials(harvestSessionUserId);
  const url = path.startsWith("http") ? path : `${HARVEST_API}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        ...headers(accountId, accessToken),
        ...init?.headers,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    if (attempt < IN_REQUEST_RETRIES) {
      await sleep(500 * (attempt + 1));
      return harvestRequest<T>(path, init, attempt + 1);
    }
    throw new SyncError(`Harvest network error: ${message}`, true);
  }

  if (res.status === 429 || res.status >= 500) {
    const retryAfterRaw = res.headers.get("retry-after");
    const retryAfterSec = retryAfterRaw ? Number(retryAfterRaw) : NaN;
    const waitMs = Number.isFinite(retryAfterSec) ? Math.min(retryAfterSec * 1000, 8000) : 1000 * (attempt + 1);
    if (attempt < IN_REQUEST_RETRIES) {
      await sleep(waitMs);
      return harvestRequest<T>(path, init, attempt + 1);
    }
    const text = await res.text();
    throw new SyncError(`Harvest API ${res.status}: ${text || res.statusText}`, true);
  }

  if (res.status === 404 && init?.method === "DELETE") {
    return undefined as T;
  }

  if (!res.ok) {
    const text = await res.text();
    const retryable = res.status >= 500;
    throw new SyncError(`Harvest API ${res.status}: ${text || res.statusText}`, retryable);
  }

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) return undefined as T;
  return (await res.json()) as T;
}

export async function listHarvestUsersWithEmail(): Promise<HarvestUserWithEmail[]> {
  const all: HarvestUserWithEmail[] = [];
  let page = 1;
  let nextPage: number | null = 1;
  while (nextPage) {
    const data = await harvestRequest<{
      users: HarvestUserWithEmail[];
      next_page: number | null;
      links?: { next?: string | null };
    }>(`/users?per_page=2000&page=${page}&is_active=true`);
    all.push(...(data.users ?? []));
    nextPage = data.next_page ?? null;
    page = nextPage ?? page + 1;
    if (!data.users?.length) break;
  }
  return all.filter((u) => u.is_active !== false);
}

export async function listHarvestProjects(): Promise<HarvestProjectWithCode[]> {
  const all: HarvestProjectWithCode[] = [];
  let page = 1;
  let nextPage: number | null = 1;
  while (nextPage) {
    const data = await harvestRequest<{
      projects: HarvestProjectWithCode[];
      next_page: number | null;
    }>(`/projects?per_page=2000&page=${page}&is_active=true`);
    all.push(...(data.projects ?? []));
    nextPage = data.next_page ?? null;
    page = nextPage ?? page + 1;
    if (!data.projects?.length) break;
  }
  return all;
}

export async function findHarvestProjectByCode(code: string): Promise<HarvestProjectWithCode | null> {
  const wanted = code.trim().toUpperCase();
  const projects = await listHarvestProjects();
  return (
    projects.find((p) => (p.code ?? "").trim().toUpperCase() === wanted) ??
    projects.find((p) => p.name.trim().toUpperCase() === wanted) ??
    (Number.isFinite(Number(wanted)) ? projects.find((p) => p.id === Number(wanted)) ?? null : null)
  );
}

export async function listProjectTaskAssignments(projectId: number): Promise<HarvestTaskAssignment[]> {
  const data = await harvestRequest<{ task_assignments: HarvestTaskAssignment[] }>(
    `/projects/${projectId}/task_assignments?is_active=true&per_page=2000`
  );
  return data.task_assignments ?? [];
}

export async function listHarvestTimeEntries(params: {
  userId?: number;
  from: string;
  to: string;
  projectId?: number;
}): Promise<HarvestTimeEntryListItem[]> {
  const all: HarvestTimeEntryListItem[] = [];
  let page = 1;
  for (;;) {
    const search = new URLSearchParams({
      from: params.from,
      to: params.to,
      per_page: "100",
      page: String(page),
    });
    if (params.userId) search.set("user_id", String(params.userId));
    if (params.projectId) search.set("project_id", String(params.projectId));
    const data = await harvestRequest<{
      time_entries: HarvestTimeEntryListItem[];
      next_page: number | null;
    }>(`/time_entries?${search}`);
    all.push(...(data.time_entries ?? []));
    if (!data.next_page || !data.time_entries?.length) break;
    page = data.next_page;
  }
  return all;
}

function isHarvestNotFound(error: unknown): boolean {
  return error instanceof SyncError && /Harvest API 404/.test(error.message);
}

export async function getHarvestTimeEntry(timeEntryId: number): Promise<HarvestTimeEntryListItem | null> {
  try {
    return await harvestRequest<HarvestTimeEntryListItem>(`/time_entries/${timeEntryId}`);
  } catch (error) {
    if (isHarvestNotFound(error)) return null;
    throw error;
  }
}

export async function getHarvestUser(userId: number): Promise<HarvestUserWithEmail | null> {
  try {
    return await harvestRequest<HarvestUserWithEmail>(`/users/${userId}`);
  } catch (error) {
    if (isHarvestNotFound(error)) return null;
    throw error;
  }
}

export async function findLockedHarvestEntryOnDate(
  userId: number,
  spentDate: string
): Promise<HarvestTimeEntryListItem | null> {
  const entries = await listHarvestTimeEntries({ userId, from: spentDate, to: spentDate });
  return firstLockedHarvestEntry(entries);
}

export function harvestExternalReference(issueKey: string, permalink: string) {
  return {
    id: issueKey,
    permalink,
    service: "jira",
  };
}

export async function createHarvestTimeEntry(input: {
  userId: number;
  projectId: number;
  taskId: number;
  spentDate: string;
  hours: number;
  notes: string | null;
  issueKey: string;
  jiraBrowseUrl: string;
}): Promise<HarvestTimeEntryWrite> {
  return harvestRequest<HarvestTimeEntryWrite>("/time_entries", {
    method: "POST",
    body: JSON.stringify({
      user_id: input.userId,
      project_id: input.projectId,
      task_id: input.taskId,
      spent_date: input.spentDate,
      hours: input.hours,
      notes: input.notes,
      external_reference: harvestExternalReference(input.issueKey, input.jiraBrowseUrl),
    }),
  });
}

export async function updateHarvestTimeEntry(
  timeEntryId: number,
  input: {
    projectId: number;
    taskId: number;
    spentDate: string;
    hours: number;
    notes: string | null;
    issueKey: string;
    jiraBrowseUrl: string;
  }
): Promise<HarvestTimeEntryWrite> {
  return harvestRequest<HarvestTimeEntryWrite>(`/time_entries/${timeEntryId}`, {
    method: "PATCH",
    body: JSON.stringify({
      project_id: input.projectId,
      task_id: input.taskId,
      spent_date: input.spentDate,
      hours: input.hours,
      notes: input.notes,
      external_reference: harvestExternalReference(input.issueKey, input.jiraBrowseUrl),
    }),
  });
}

export async function deleteHarvestTimeEntry(timeEntryId: number): Promise<void> {
  await harvestRequest(`/time_entries/${timeEntryId}`, { method: "DELETE" });
}

export async function deleteUnmappedHarvestEntriesForIssue(input: {
  issueKey: string;
  projectId: number;
  from: string;
  to: string;
  keepHarvestIds: Set<number>;
  userIds?: number[];
}): Promise<number> {
  const entries =
    input.userIds?.length
      ? (
          await Promise.all(
            input.userIds.map((userId) =>
              listHarvestTimeEntries({
                userId,
                from: input.from,
                to: input.to,
                projectId: input.projectId,
              })
            )
          )
        ).flat()
      : await listHarvestTimeEntries({
          from: input.from,
          to: input.to,
          projectId: input.projectId,
        });
  const issueKey = input.issueKey.toUpperCase();
  let removed = 0;
  for (const entry of entries) {
    if (input.keepHarvestIds.has(entry.id)) continue;
    if (harvestEntryIssueKey(entry) !== issueKey) continue;
    if (harvestEntryIsLocked(entry)) continue;
    await deleteHarvestTimeEntry(entry.id);
    removed += 1;
  }
  return removed;
}

export async function pingHarvest(): Promise<void> {
  await harvestRequest("/company");
}

export function toDuplicateCandidate(entry: HarvestTimeEntryListItem): {
  id: number;
  user_id: number;
  spent_date: string;
  hours: number;
  project_id: number;
  notes: string | null;
  external_reference?: { id: string; permalink?: string } | null;
} {
  return {
    id: entry.id,
    user_id: entry.user.id,
    spent_date: entry.spent_date,
    hours: entry.hours,
    project_id: entry.project.id,
    notes: entry.notes,
    external_reference: entry.external_reference,
  };
}
