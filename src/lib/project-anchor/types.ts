export type SyncAction = "created" | "updated" | "deleted";
export type SyncStatus = "pending" | "synced" | "failed" | "ignored" | "deleted" | "duplicate";
export type HarvestLinkSource = "created" | "adopted";
export type MappedBy = "email_auto" | "manual";

export type ProjectAnchorEntry = {
  id: string;
  jira_issue_id: string;
  jira_issue_key: string;
  jira_issue_summary: string | null;
  jira_worklog_id: string;
  jira_account_id: string;
  harvest_user_id: number | null;
  harvest_project_id: number | null;
  harvest_project_code: string | null;
  harvest_project_name: string | null;
  harvest_task_id: number | null;
  harvest_task_name: string | null;
  harvest_time_entry_id: number | null;
  harvest_link_source: HarvestLinkSource | null;
  duplicate_harvest_time_entry_id: number | null;
  hours: number;
  spent_date: string;
  notes: string | null;
  action: SyncAction;
  sync_status: SyncStatus;
  last_synced_at: string | null;
  last_retry_at: string | null;
  retry_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectAnchorUserMap = {
  id: string;
  jira_account_id: string | null;
  jira_email: string | null;
  jira_display_name: string | null;
  harvest_user_id: number | null;
  harvest_email: string | null;
  harvest_display_name: string | null;
  default_harvest_task_name: string | null;
  mapped_by: MappedBy;
  created_at: string;
  updated_at: string;
};

export type ProjectAnchorSyncState = {
  id: string;
  last_webhook_at: string | null;
  last_successful_harvest_at: string | null;
  last_successful_jira_at: string | null;
  last_reconcile_at: string | null;
  last_jira_error: string | null;
  last_harvest_error: string | null;
  updated_at: string;
};

export type ParsedWorklogEvent = {
  webhookEvent: "worklog_created" | "worklog_updated" | "worklog_deleted";
  worklogId: string;
  issueId: string | null;
  accountId: string | null;
  timeSpentSeconds: number | null;
  started: string | null;
  commentText: string;
};

export class SyncError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "SyncError";
    this.retryable = retryable;
  }
}
