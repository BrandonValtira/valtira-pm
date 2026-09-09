import { harvestProjectCodeFromField, isHarvestProjectCodeAllowed } from "./config";
import { isJiraApiNotFoundMessage } from "./sync-rules";
import { resolveOrgJiraAccess, type JiraOAuthAccess } from "@/lib/jira-auth";
import {
  HARVEST_PROJECT_FIELD_LABEL,
  HARVEST_TASK_FIELD_LABEL,
  fieldIdFromNames,
  isHarvestProjectFieldName,
  isHarvestTaskFieldName,
  jqlForHarvestProjectField,
} from "./jira-fields";
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

export type JiraWorklogList = {
  worklogs: JiraWorklogForSync[];
  listedAll: boolean;
};

type JiraFieldMeta = {
  id?: string;
  name?: string;
  untranslatedName?: string;
  clauseNames?: string[];
};

type ResolvedFields = { projectFieldId: string | null; taskFieldId: string | null };

const MISSING_PROJECT_FIELD =
  'Create a Jira custom field named "Harvest Billing Project" and set it on issues that should sync to Harvest.';

let lastSiteUrl: string | null = null;
let cachedFields: ResolvedFields | null = null;

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

function fieldLabels(field: JiraFieldMeta): string[] {
  return [field.name, field.untranslatedName, ...(field.clauseNames ?? [])].filter(
    (value): value is string => Boolean(value && value.trim())
  );
}

function pickFieldId(fields: JiraFieldMeta[], predicate: (name: string) => boolean): string | null {
  for (const field of fields) {
    const id = field.id?.trim();
    if (!id) continue;
    if (fieldLabels(field).some(predicate)) return id;
  }
  return null;
}

function mergeResolved(base: ResolvedFields, extra: ResolvedFields): ResolvedFields {
  return {
    projectFieldId: base.projectFieldId ?? extra.projectFieldId,
    taskFieldId: base.taskFieldId ?? extra.taskFieldId,
  };
}

function rememberFields(fields: ResolvedFields): ResolvedFields {
  if (fields.projectFieldId) cachedFields = fields;
  return fields;
}

async function searchFieldsCatalog(query: string): Promise<JiraFieldMeta[]> {
  const params = new URLSearchParams({ query, maxResults: "100" });
  const data = await jiraFetch<{ values?: JiraFieldMeta[] }>(`/rest/api/3/field/search?${params}`);
  return data.values ?? [];
}

async function resolveCustomFields(): Promise<ResolvedFields> {
  if (cachedFields?.projectFieldId) return cachedFields;
  const envProject = process.env.JIRA_HARVEST_PROJECT_FIELD_ID?.trim() || null;
  const envTask = process.env.JIRA_HARVEST_TASK_FIELD_ID?.trim() || null;
  if (envProject) {
    return rememberFields({ projectFieldId: envProject, taskFieldId: envTask });
  }

  let resolved: ResolvedFields = { projectFieldId: null, taskFieldId: envTask };
  try {
    const searched = [
      ...(await searchFieldsCatalog(HARVEST_PROJECT_FIELD_LABEL)),
      ...(await searchFieldsCatalog("Harvest Project")),
      ...(await searchFieldsCatalog(HARVEST_TASK_FIELD_LABEL)),
    ];
    resolved = mergeResolved(resolved, {
      projectFieldId: pickFieldId(searched, isHarvestProjectFieldName),
      taskFieldId: envTask ?? pickFieldId(searched, isHarvestTaskFieldName),
    });
  } catch {
    // Team-managed / next-gen fields often do not appear in the global catalog.
  }

  if (!resolved.projectFieldId) {
    try {
      const all = await jiraFetch<JiraFieldMeta[] | { values?: JiraFieldMeta[] }>("/rest/api/3/field");
      const list = Array.isArray(all) ? all : (all.values ?? []);
      resolved = mergeResolved(resolved, {
        projectFieldId: pickFieldId(list, isHarvestProjectFieldName),
        taskFieldId: resolved.taskFieldId ?? pickFieldId(list, isHarvestTaskFieldName),
      });
    } catch {
      // Search-by-JQL below still works when the catalog omits the field.
    }
  }

  return rememberFields(resolved);
}

function harvestCodeFromFieldBag(fieldBag: Record<string, unknown>, projectFieldId: string | null): string | null {
  if (projectFieldId) {
    return harvestProjectCodeFromField(customFieldValue(fieldBag[projectFieldId]));
  }
  for (const [key, value] of Object.entries(fieldBag)) {
    if (!key.startsWith("customfield_")) continue;
    const code = harvestProjectCodeFromField(customFieldValue(value));
    if (code && isHarvestProjectCodeAllowed(code)) return code;
  }
  return null;
}

function issueFromFields(
  issue: { id: string; key: string; fields?: Record<string, unknown> },
  projectFieldId: string | null,
  taskFieldId: string | null
): JiraIssueForSync {
  const fieldBag = issue.fields ?? {};
  return {
    id: String(issue.id),
    key: issue.key,
    summary: typeof fieldBag.summary === "string" ? fieldBag.summary : "",
    harvestProjectCode: harvestCodeFromFieldBag(fieldBag, projectFieldId),
    harvestTaskName: taskFieldId ? customFieldValue(fieldBag[taskFieldId]) : null,
  };
}

function fieldsQuery(projectFieldId: string | null, taskFieldId: string | null): string {
  if (!projectFieldId) return "*all";
  const ids = ["summary", projectFieldId, taskFieldId].filter((value): value is string => Boolean(value));
  return ids.join(",");
}

type JqlSearchPage = {
  issues?: Array<{ id: string; key: string; fields?: Record<string, unknown> }>;
  names?: Record<string, string>;
  nextPageToken?: string;
  isLast?: boolean;
};

async function searchJqlPage(jql: string, fields: string, nextPageToken: string | undefined, maxResults: number): Promise<JqlSearchPage> {
  return jiraFetch<JqlSearchPage>("/rest/api/3/search/jql", {
    method: "POST",
    body: JSON.stringify({
      jql,
      maxResults,
      fields: fields.split(",").map((field) => field.trim()).filter(Boolean),
      expand: "names",
      ...(nextPageToken ? { nextPageToken } : {}),
    }),
  });
}

export async function searchIssuesWithHarvestBillingProject(limit = 50): Promise<JiraIssueForSync[]> {
  let resolved = await resolveCustomFields();
  const clauses = jqlForHarvestProjectField(resolved.projectFieldId);
  let lastError: Error | null = null;

  for (const jql of clauses) {
    try {
      const found: JiraIssueForSync[] = [];
      let nextPageToken: string | undefined;
      const fields = fieldsQuery(resolved.projectFieldId, resolved.taskFieldId);
      while (found.length < limit) {
        const data = await searchJqlPage(jql, fields, nextPageToken, Math.min(50, limit - found.length));
        resolved = rememberFields(
          mergeResolved(resolved, {
            projectFieldId: fieldIdFromNames(data.names, isHarvestProjectFieldName),
            taskFieldId: fieldIdFromNames(data.names, isHarvestTaskFieldName),
          })
        );
        const page = data.issues ?? [];
        for (const issue of page) {
          found.push(issueFromFields(issue, resolved.projectFieldId, resolved.taskFieldId));
          if (found.length >= limit) break;
        }
        if (data.isLast || !data.nextPageToken || page.length === 0) break;
        nextPageToken = data.nextPageToken;
      }
      return found;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error(MISSING_PROJECT_FIELD);
}

export async function getJiraIssueForSync(issueIdOrKey: string): Promise<JiraIssueForSync> {
  let resolved = await resolveCustomFields();
  const fields = fieldsQuery(resolved.projectFieldId, resolved.taskFieldId);
  const issue = await jiraFetch<{
    id: string;
    key: string;
    fields?: Record<string, unknown>;
    names?: Record<string, string>;
  }>(
    `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}?fields=${encodeURIComponent(fields)}&expand=names`
  );
  resolved = rememberFields(
    mergeResolved(resolved, {
      projectFieldId: fieldIdFromNames(issue.names, isHarvestProjectFieldName),
      taskFieldId: fieldIdFromNames(issue.names, isHarvestTaskFieldName),
    })
  );
  return issueFromFields(issue, resolved.projectFieldId, resolved.taskFieldId);
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

function mapWorklog(
  worklog: {
    id: string;
    issueId?: string;
    timeSpentSeconds: number;
    started: string;
    comment?: unknown;
    author?: { accountId?: string };
  },
  issueIdOrKey: string
): JiraWorklogForSync {
  return {
    id: String(worklog.id),
    issueId: worklog.issueId != null ? String(worklog.issueId) : String(issueIdOrKey),
    accountId: worklog.author?.accountId ?? null,
    timeSpentSeconds: worklog.timeSpentSeconds,
    started: worklog.started,
    commentText: jiraCommentToText(worklog.comment),
  };
}

export function isJiraNotFoundError(error: unknown): boolean {
  return error instanceof SyncError && isJiraApiNotFoundMessage(error.message);
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
  return mapWorklog(worklog, issueIdOrKey);
}

export async function getJiraWorklogIfExists(
  issueIdOrKey: string,
  worklogId: string
): Promise<JiraWorklogForSync | null> {
  try {
    return await getJiraWorklog(issueIdOrKey, worklogId);
  } catch (error) {
    if (isJiraNotFoundError(error)) return null;
    throw error;
  }
}

export async function listIssueWorklogs(issueIdOrKey: string): Promise<JiraWorklogList> {
  const all: JiraWorklogForSync[] = [];
  let startAt = 0;
  for (let pageNum = 0; pageNum < 50; pageNum += 1) {
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
    const total = typeof data.total === "number" ? data.total : null;
    for (const worklog of page) all.push(mapWorklog(worklog, issueIdOrKey));
    startAt += page.length;
    if (total != null && startAt >= total) {
      return { worklogs: all, listedAll: true };
    }
    if (page.length === 0) {
      return { worklogs: all, listedAll: total === 0 || (total == null && all.length === 0) };
    }
    if (page.length < 100 && total == null) {
      return { worklogs: all, listedAll: true };
    }
  }
  return { worklogs: all, listedAll: false };
}

export function jiraBrowseUrl(issueKey: string): string {
  const site = lastSiteUrl || "https://valtirallc.atlassian.net";
  return `${site}/browse/${issueKey}`;
}

export async function pingJira(): Promise<void> {
  await jiraFetch("/rest/api/3/myself");
}
