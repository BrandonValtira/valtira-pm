import { harvestProjectCodeFromField } from "./config";
import { resolveOrgJiraAccess, type JiraOAuthAccess } from "@/lib/jira-auth";
import { SyncError } from "./types";
import { jiraCommentToText } from "./webhook";

export type JiraIssueForSync = {
  id: string;
  key: string;
  summary: string;
  harvestProjectCode: string | null;
  harvestTaskName: string | null;
};

export type JiraUserForSync = {
  accountId: string;
  emailAddress: string | null;
  displayName: string | null;
};

export type JiraWorklogForSync = {
  id: string;
  issueId: string;
  accountId: string | null;
  timeSpentSeconds: number;
  started: string;
  commentText: string;
};

let lastSiteUrl: string | null = null;
let cachedFields: { projectFieldId: string | null; taskFieldId: string | null } | null = null;

async function jiraAccess(): Promise<JiraOAuthAccess> {
  const access = await resolveOrgJiraAccess();
  if (!access) {
    throw new Error("Jira is not connected. Connect Jira in Settings.");
  }
  lastSiteUrl = access.siteUrl;
  return access;
}

async function jiraFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { cloudId, accessToken } = await jiraAccess();
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const url = `https://api.atlassian.com/ex/jira/${cloudId}${suffix}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 429 || res.status >= 500) {
    const text = await res.text();
    throw new SyncError(`Jira API ${res.status}: ${text || res.statusText}`, true);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new SyncError(`Jira API ${res.status}: ${text || res.statusText}`, false);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function customFieldValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    const rec = value as { value?: unknown; name?: unknown; key?: unknown };
    const inner = rec.value ?? rec.name ?? rec.key;
    return typeof inner === "string" && inner.trim() ? inner.trim() : null;
  }
  return null;
}

function normalizeFieldName(name: string): string {
  return name.trim().toLowerCase().replace(/[_-]+/g, " ");
}

async function resolveCustomFields(): Promise<{ projectFieldId: string | null; taskFieldId: string | null }> {
  if (cachedFields) return cachedFields;
  const envProject = process.env.JIRA_HARVEST_PROJECT_FIELD_ID?.trim() || null;
  const envTask = process.env.JIRA_HARVEST_TASK_FIELD_ID?.trim() || null;
  if (envProject) {
    cachedFields = { projectFieldId: envProject, taskFieldId: envTask };
    return cachedFields;
  }
  const fields = await jiraFetch<Array<{ id?: string; name?: string }>>("/rest/api/3/field");
  let projectFieldId: string | null = null;
  let taskFieldId: string | null = envTask;
  for (const field of fields ?? []) {
    const id = field.id?.trim();
    const name = normalizeFieldName(field.name ?? "");
    if (!id || !name) continue;
    if (!projectFieldId && (name === "harvest billing project" || name === "harvest project")) {
      projectFieldId = id;
    }
    if (!taskFieldId && (name === "harvest billing task" || name === "harvest task")) {
      taskFieldId = id;
    }
  }
  cachedFields = { projectFieldId, taskFieldId };
  return cachedFields;
}

export async function getHarvestBillingFields(): Promise<{ projectFieldId: string; taskFieldId: string | null }> {
  const fields = await resolveCustomFields();
  if (!fields.projectFieldId) {
    throw new Error(
      'Create a Jira custom field named "Harvest Billing Project" and set it on issues that should sync to Harvest.'
    );
  }
  return { projectFieldId: fields.projectFieldId, taskFieldId: fields.taskFieldId };
}

function issueFromSearch(issue: { id: string; key: string; fields?: Record<string, unknown> }, projectFieldId: string, taskFieldId: string | null): JiraIssueForSync {
  const fieldBag = issue.fields ?? {};
  return {
    id: String(issue.id),
    key: issue.key,
    summary: typeof fieldBag.summary === "string" ? fieldBag.summary : "",
    harvestProjectCode: harvestProjectCodeFromField(customFieldValue(fieldBag[projectFieldId])),
    harvestTaskName: taskFieldId ? customFieldValue(fieldBag[taskFieldId]) : null,
  };
}

export async function searchIssuesWithHarvestBillingProject(limit = 50): Promise<JiraIssueForSync[]> {
  const { projectFieldId, taskFieldId } = await getHarvestBillingFields();
  const fieldList = ["summary", projectFieldId, ...(taskFieldId ? [taskFieldId] : [])];
  const numericId = projectFieldId.match(/^customfield_(\d+)$/)?.[1];
  const jql = numericId
    ? `cf[${numericId}] is not EMPTY ORDER BY updated DESC`
    : `"Harvest Billing Project" is not EMPTY ORDER BY updated DESC`;
  const found: JiraIssueForSync[] = [];
  let nextPageToken: string | undefined;
  while (found.length < limit) {
    const params = new URLSearchParams({
      jql,
      maxResults: String(Math.min(50, limit - found.length)),
      fields: fieldList.join(","),
    });
    if (nextPageToken) params.set("nextPageToken", nextPageToken);
    const data = await jiraFetch<{
      issues?: Array<{ id: string; key: string; fields?: Record<string, unknown> }>;
      nextPageToken?: string;
      isLast?: boolean;
    }>(`/rest/api/3/search/jql?${params}`);
    const page = data.issues ?? [];
    for (const issue of page) {
      found.push(issueFromSearch(issue, projectFieldId, taskFieldId));
      if (found.length >= limit) break;
    }
    if (data.isLast || !data.nextPageToken || page.length === 0) break;
    nextPageToken = data.nextPageToken;
  }
  return found;
}

export async function getJiraIssueForSync(issueIdOrKey: string): Promise<JiraIssueForSync> {
  const { projectFieldId, taskFieldId } = await resolveCustomFields();
  const fieldIds = ["summary", ...(projectFieldId ? [projectFieldId] : []), ...(taskFieldId ? [taskFieldId] : [])];
  const issue = await jiraFetch<{
    id: string;
    key: string;
    fields?: Record<string, unknown>;
  }>(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}?fields=${encodeURIComponent(fieldIds.join(","))}`);
  const fieldBag = issue.fields ?? {};
  const fieldCode = projectFieldId ? customFieldValue(fieldBag[projectFieldId]) : null;
  return {
    id: String(issue.id),
    key: issue.key,
    summary: typeof fieldBag.summary === "string" ? fieldBag.summary : "",
    harvestProjectCode: harvestProjectCodeFromField(fieldCode),
    harvestTaskName: taskFieldId ? customFieldValue(fieldBag[taskFieldId]) : null,
  };
}

export async function getJiraUser(accountId: string): Promise<JiraUserForSync> {
  const user = await jiraFetch<{
    accountId: string;
    emailAddress?: string;
    displayName?: string;
  }>(`/rest/api/3/user?accountId=${encodeURIComponent(accountId)}`);
  return {
    accountId: user.accountId,
    emailAddress: user.emailAddress?.trim() || null,
    displayName: user.displayName ?? null,
  };
}

export async function getJiraWorklog(issueIdOrKey: string, worklogId: string): Promise<JiraWorklogForSync> {
  const worklog = await jiraFetch<{
    id: string;
    issueId?: string;
    timeSpentSeconds: number;
    started: string;
    comment?: unknown;
    author?: { accountId?: string };
  }>(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/worklog/${encodeURIComponent(worklogId)}`);
  return {
    id: String(worklog.id),
    issueId: worklog.issueId != null ? String(worklog.issueId) : String(issueIdOrKey),
    accountId: worklog.author?.accountId ?? null,
    timeSpentSeconds: worklog.timeSpentSeconds,
    started: worklog.started,
    commentText: jiraCommentToText(worklog.comment),
  };
}

export async function listIssueWorklogs(issueIdOrKey: string): Promise<JiraWorklogForSync[]> {
  const all: JiraWorklogForSync[] = [];
  let startAt = 0;
  for (;;) {
    const data = await jiraFetch<{
      startAt?: number;
      maxResults?: number;
      total?: number;
      worklogs?: Array<{
        id: string;
        issueId?: string;
        timeSpentSeconds: number;
        started: string;
        comment?: unknown;
        author?: { accountId?: string };
      }>;
    }>(`/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}/worklog?startAt=${startAt}&maxResults=100`);
    const page = data.worklogs ?? [];
    for (const worklog of page) {
      all.push({
        id: String(worklog.id),
        issueId: worklog.issueId != null ? String(worklog.issueId) : String(issueIdOrKey),
        accountId: worklog.author?.accountId ?? null,
        timeSpentSeconds: worklog.timeSpentSeconds,
        started: worklog.started,
        commentText: jiraCommentToText(worklog.comment),
      });
    }
    startAt += page.length;
    if (!page.length || startAt >= (data.total ?? startAt)) break;
  }
  return all;
}

export function jiraBrowseUrl(issueKey: string): string {
  const site = lastSiteUrl || "https://valtirallc.atlassian.net";
  return `${site}/browse/${issueKey}`;
}

export async function pingJira(): Promise<void> {
  await jiraFetch("/rest/api/3/myself");
}
