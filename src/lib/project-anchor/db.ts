import { createAdminClient } from "@/lib/supabase/admin";
import type { HarvestLinkSource, ProjectAnchorEntry, ProjectAnchorSyncState, SyncAction, SyncStatus } from "./types";

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function mapEntryRow(row: Record<string, unknown>): ProjectAnchorEntry {
  return {
    id: String(row.id),
    jira_issue_id: String(row.jira_issue_id),
    jira_issue_key: String(row.jira_issue_key),
    jira_issue_summary: (row.jira_issue_summary as string | null) ?? null,
    jira_worklog_id: String(row.jira_worklog_id),
    jira_account_id: String(row.jira_account_id),
    harvest_user_id: num(row.harvest_user_id),
    harvest_project_id: num(row.harvest_project_id),
    harvest_project_code: (row.harvest_project_code as string | null) ?? null,
    harvest_project_name: (row.harvest_project_name as string | null) ?? null,
    harvest_task_id: num(row.harvest_task_id),
    harvest_task_name: (row.harvest_task_name as string | null) ?? null,
    harvest_time_entry_id: num(row.harvest_time_entry_id),
    harvest_link_source: (row.harvest_link_source as HarvestLinkSource | null) ?? null,
    duplicate_harvest_time_entry_id: num(row.duplicate_harvest_time_entry_id),
    hours: Number(row.hours ?? 0),
    spent_date: String(row.spent_date),
    notes: (row.notes as string | null) ?? null,
    action: row.action as SyncAction,
    sync_status: row.sync_status as SyncStatus,
    last_synced_at: (row.last_synced_at as string | null) ?? null,
    last_retry_at: (row.last_retry_at as string | null) ?? null,
    retry_count: Number(row.retry_count ?? 0),
    last_error: (row.last_error as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export type EntryUpsert = {
  jira_issue_id: string;
  jira_issue_key: string;
  jira_issue_summary?: string | null;
  jira_worklog_id: string;
  jira_account_id: string;
  hours: number;
  spent_date: string;
  notes?: string | null;
  action: SyncAction;
  sync_status: SyncStatus;
  harvest_user_id?: number | null;
  harvest_project_id?: number | null;
  harvest_project_code?: string | null;
  harvest_project_name?: string | null;
  harvest_task_id?: number | null;
  harvest_task_name?: string | null;
};

export async function upsertEntryByWorklog(fields: EntryUpsert): Promise<ProjectAnchorEntry> {
  const supabase = createAdminClient();
  const worklogId = String(fields.jira_worklog_id);
  const { data: existing, error: existingError } = await supabase
    .from("project_anchor_entries")
    .select("*")
    .eq("jira_worklog_id", worklogId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  const resurrect = existing?.sync_status === "deleted";
  const payload: Record<string, unknown> = {
    ...fields,
    jira_worklog_id: worklogId,
    jira_issue_id: String(fields.jira_issue_id),
    jira_account_id: String(fields.jira_account_id),
    updated_at: new Date().toISOString(),
    ...(resurrect
      ? {
          harvest_time_entry_id: null,
          harvest_link_source: null,
          duplicate_harvest_time_entry_id: null,
          retry_count: 0,
          last_error: null,
        }
      : {}),
  };

  if (existing) {
    const { data, error } = await supabase
      .from("project_anchor_entries")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapEntryRow(data as Record<string, unknown>);
  }

  const { data, error } = await supabase.from("project_anchor_entries").insert(payload).select("*").single();
  if (error && /duplicate key|unique constraint/i.test(error.message)) {
    const { data: raced, error: racedError } = await supabase
      .from("project_anchor_entries")
      .update(payload)
      .eq("jira_worklog_id", worklogId)
      .select("*")
      .single();
    if (racedError) throw new Error(racedError.message);
    return mapEntryRow(raced as Record<string, unknown>);
  }
  if (error) throw new Error(error.message);
  return mapEntryRow(data as Record<string, unknown>);
}

export async function updateEntry(
  id: string,
  patch: Record<string, unknown>
): Promise<ProjectAnchorEntry> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("project_anchor_entries")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapEntryRow(data as Record<string, unknown>);
}

export async function getEntryByWorklogId(worklogId: string): Promise<ProjectAnchorEntry | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("project_anchor_entries")
    .select("*")
    .eq("jira_worklog_id", worklogId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapEntryRow(data as Record<string, unknown>) : null;
}

export async function getEntryById(id: string): Promise<ProjectAnchorEntry | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("project_anchor_entries").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapEntryRow(data as Record<string, unknown>) : null;
}

export async function listMappedHarvestTimeEntryIds(): Promise<Set<number>> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("project_anchor_entries")
    .select("harvest_time_entry_id")
    .not("harvest_time_entry_id", "is", null);
  if (error) throw new Error(error.message);
  return new Set(
    (data ?? [])
      .map((row) => Number((row as { harvest_time_entry_id: number | null }).harvest_time_entry_id))
      .filter((n) => Number.isFinite(n))
  );
}

export async function listEntries(opts: {
  spentDate?: string;
  issueKey?: string;
  statuses?: SyncStatus[];
  limit?: number;
}): Promise<ProjectAnchorEntry[]> {
  const supabase = createAdminClient();
  let query = supabase.from("project_anchor_entries").select("*");
  if (opts.spentDate) query = query.eq("spent_date", opts.spentDate);
  if (opts.issueKey) query = query.eq("jira_issue_key", opts.issueKey);
  if (opts.statuses?.length) query = query.in("sync_status", opts.statuses);
  query = query.order("updated_at", { ascending: false }).limit(opts.limit ?? 100);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapEntryRow(row as Record<string, unknown>));
}

export async function listRetryableEntries(maxRetries: number): Promise<ProjectAnchorEntry[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("project_anchor_entries")
    .select("*")
    .in("sync_status", ["pending", "failed", "duplicate"])
    .lt("retry_count", maxRetries)
    .order("updated_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapEntryRow(row as Record<string, unknown>));
}

export async function touchSyncState(patch: Partial<Omit<ProjectAnchorSyncState, "id">>): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("project_anchor_sync_state").upsert(
    {
      id: "default",
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
}

export async function getSyncState(): Promise<ProjectAnchorSyncState | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("project_anchor_sync_state").select("*").eq("id", "default").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    last_webhook_at: (row.last_webhook_at as string | null) ?? null,
    last_successful_harvest_at: (row.last_successful_harvest_at as string | null) ?? null,
    last_successful_jira_at: (row.last_successful_jira_at as string | null) ?? null,
    last_reconcile_at: (row.last_reconcile_at as string | null) ?? null,
    last_jira_error: (row.last_jira_error as string | null) ?? null,
    last_harvest_error: (row.last_harvest_error as string | null) ?? null,
    updated_at: String(row.updated_at),
  };
}

export async function countByStatus(): Promise<{ pending: number; failed: number; duplicate: number; synced: number }> {
  const supabase = createAdminClient();
  const statuses = ["pending", "failed", "duplicate", "synced"] as const;
  const counts = { pending: 0, failed: 0, duplicate: 0, synced: 0 };
  await Promise.all(
    statuses.map(async (status) => {
      const { count } = await supabase
        .from("project_anchor_entries")
        .select("id", { count: "exact", head: true })
        .eq("sync_status", status);
      counts[status] = count ?? 0;
    })
  );
  return counts;
}
