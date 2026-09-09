import { isHarvestProjectCodeAllowed } from "./config";
import {
  createHarvestTimeEntry,
  deleteHarvestTimeEntry,
  findHarvestProjectByCode,
  listHarvestTimeEntries,
  listProjectTaskAssignments,
  toDuplicateCandidate,
  updateHarvestTimeEntry,
} from "./harvest";
import { getJiraIssueForSync, getJiraWorklog, jiraBrowseUrl } from "./jira";
import { pickDuplicateCandidate } from "./duplicates";
import {
  getEntryById,
  getEntryByWorklogId,
  listMappedHarvestTimeEntryIds,
  touchSyncState,
  updateEntry,
  upsertEntryByWorklog,
} from "./db";
import { extractTaskTag, findTaskAssignment, resolveRequestedTaskName } from "./tasks";
import type { ProjectAnchorEntry, SyncAction } from "./types";
import { SyncError } from "./types";
import { resolveUserMap } from "./users";
import type { ParsedWorklogEvent } from "./types";
import { hoursFromSeconds, spentDateFromStarted } from "./webhook";
import { worklogAlreadySynced } from "./sync-rules";

function notesWithIssue(commentText: string, issueKey: string): string {
  const trimmed = commentText.trim();
  if (trimmed.toUpperCase().includes(issueKey.toUpperCase())) return trimmed || issueKey;
  return trimmed ? `${issueKey} ${trimmed}` : issueKey;
}

function payloadUnchanged(
  entry: ProjectAnchorEntry,
  next: { hours: number; spent_date: string; notes: string; harvest_task_id: number | null }
): boolean {
  return (
    entry.sync_status === "synced" &&
    entry.harvest_time_entry_id != null &&
    Number(entry.hours) === next.hours &&
    entry.spent_date === next.spent_date &&
    (entry.notes ?? "") === next.notes &&
    entry.harvest_task_id === next.harvest_task_id &&
    !entry.duplicate_harvest_time_entry_id
  );
}

async function markFailed(entry: ProjectAnchorEntry, error: unknown, incrementRetry: boolean): Promise<ProjectAnchorEntry> {
  const message = error instanceof Error ? error.message : String(error);
  const retryable = error instanceof SyncError ? error.retryable : true;
  await touchSyncState({ last_harvest_error: message });
  return updateEntry(entry.id, {
    sync_status: "failed",
    last_error: message,
    last_retry_at: new Date().toISOString(),
    retry_count: incrementRetry ? entry.retry_count + 1 : entry.retry_count,
    ...(retryable ? {} : { last_error: `${message}` }),
  });
}

async function applyHarvestWrite(entry: ProjectAnchorEntry): Promise<ProjectAnchorEntry> {
  if (entry.action === "deleted") {
    if (entry.harvest_time_entry_id) {
      await deleteHarvestTimeEntry(entry.harvest_time_entry_id);
    }
    await touchSyncState({ last_successful_harvest_at: new Date().toISOString(), last_harvest_error: null });
    return updateEntry(entry.id, {
      sync_status: "deleted",
      last_synced_at: new Date().toISOString(),
      last_error: null,
      last_retry_at: new Date().toISOString(),
    });
  }

  const code = entry.harvest_project_code;
  if (!isHarvestProjectCodeAllowed(code)) {
    throw new SyncError(
      `Harvest project code "${code ?? ""}" is not in HARVEST_ALLOWED_PROJECT_CODES.`,
      false
    );
  }

  const project = await findHarvestProjectByCode(code!);
  if (!project) {
    throw new SyncError(`Harvest project not found for code ${code}.`, false);
  }

  const userMap = await resolveUserMap(entry.jira_account_id);
  const assignments = await listProjectTaskAssignments(project.id);
  const requested = resolveRequestedTaskName({
    commentTag: extractTaskTag(entry.notes),
    issueTaskField: entry.harvest_task_name,
    userDefaultTask: userMap.default_harvest_task_name,
  });
  if (!requested) {
    throw new SyncError(
      "No Harvest task resolved. Add a [TaskName] tag on the worklog, set Harvest Billing Task on the issue, or set a default task on the user mapping.",
      false
    );
  }
  const assignment = findTaskAssignment(assignments, requested);
  if (!assignment) {
    throw new SyncError(
      `Harvest task "${requested}" is not assigned on project ${project.code ?? project.name}.`,
      false
    );
  }

  const browse = jiraBrowseUrl(entry.jira_issue_key);
  const nextPayload = {
    hours: Number(entry.hours),
    spent_date: entry.spent_date,
    notes: notesWithIssue(entry.notes ?? "", entry.jira_issue_key),
    harvest_task_id: assignment.task.id,
  };

  if (payloadUnchanged({ ...entry, harvest_task_id: assignment.task.id }, nextPayload)) {
    return entry;
  }

  const mappedIds = await listMappedHarvestTimeEntryIds();
  if (entry.harvest_time_entry_id) mappedIds.delete(entry.harvest_time_entry_id);

  let timeEntryId = entry.harvest_time_entry_id;
  let linkSource = entry.harvest_link_source;
  let duplicateId = entry.duplicate_harvest_time_entry_id;

  const existingHarvest = await listHarvestTimeEntries({
    userId: userMap.harvest_user_id!,
    from: entry.spent_date,
    to: entry.spent_date,
    projectId: project.id,
  });
  const duplicate = pickDuplicateCandidate(
    existingHarvest.map(toDuplicateCandidate),
    {
      harvestUserId: userMap.harvest_user_id!,
      spentDate: entry.spent_date,
      hours: Number(entry.hours),
      projectId: project.id,
      issueKey: entry.jira_issue_key,
    },
    mappedIds
  );

  if (!timeEntryId && duplicate) {
    timeEntryId = duplicate.id;
    linkSource = "adopted";
  } else if (timeEntryId && duplicate && duplicate.id !== timeEntryId) {
    duplicateId = duplicate.id;
  }

  const harvestWrite = {
    userId: userMap.harvest_user_id!,
    projectId: project.id,
    taskId: assignment.task.id,
    spentDate: entry.spent_date,
    hours: Number(entry.hours),
    notes: nextPayload.notes,
    issueKey: entry.jira_issue_key,
    jiraBrowseUrl: browse,
  };

  if (timeEntryId) {
    try {
      await updateHarvestTimeEntry(timeEntryId, harvestWrite);
      linkSource = linkSource ?? "created";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/Harvest API 404/.test(message)) throw error;
      timeEntryId = null;
    }
  }

  if (!timeEntryId && duplicate) {
    timeEntryId = duplicate.id;
    linkSource = "adopted";
    await updateHarvestTimeEntry(timeEntryId, harvestWrite);
  } else if (!timeEntryId) {
    const created = await createHarvestTimeEntry(harvestWrite);
    timeEntryId = created.id;
    linkSource = "created";
  }

  await touchSyncState({ last_successful_harvest_at: new Date().toISOString(), last_harvest_error: null });

  const saved = {
    harvest_user_id: userMap.harvest_user_id,
    harvest_project_id: project.id,
    harvest_project_code: project.code ?? code,
    harvest_project_name: project.name,
    harvest_task_id: assignment.task.id,
    harvest_task_name: assignment.task.name,
    harvest_time_entry_id: timeEntryId,
    harvest_link_source: linkSource,
    duplicate_harvest_time_entry_id: duplicateId,
    notes: nextPayload.notes,
    sync_status: duplicateId ? "duplicate" : "synced",
    last_synced_at: new Date().toISOString(),
    last_error: duplicateId
      ? `Possible double billing: Harvest entry ${timeEntryId} (ours) and ${duplicateId} (extra, often the Harvest Jira plugin). Remove the extra entry.`
      : null,
    last_retry_at: new Date().toISOString(),
  };

  try {
    return await updateEntry(entry.id, saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (linkSource === "adopted" && /duplicate|unique/i.test(message)) {
      const created = await createHarvestTimeEntry({
        userId: userMap.harvest_user_id!,
        projectId: project.id,
        taskId: assignment.task.id,
        spentDate: entry.spent_date,
        hours: Number(entry.hours),
        notes: nextPayload.notes,
        issueKey: entry.jira_issue_key,
        jiraBrowseUrl: browse,
      });
      return updateEntry(entry.id, {
        ...saved,
        harvest_time_entry_id: created.id,
        harvest_link_source: "created",
      });
    }
    throw error;
  }
}

export async function syncEntryById(id: string, incrementRetry = false): Promise<ProjectAnchorEntry> {
  const entry = await getEntryById(id);
  if (!entry) throw new Error("Time entry not found");
  try {
    return await applyHarvestWrite(entry);
  } catch (error) {
    return markFailed(entry, error, incrementRetry);
  }
}

export async function handleWorklogEvent(event: ParsedWorklogEvent): Promise<{
  ignored: boolean;
  entry: ProjectAnchorEntry | null;
}> {
  await touchSyncState({ last_webhook_at: new Date().toISOString() });

  if (event.webhookEvent === "worklog_deleted") {
    const existing = await getEntryByWorklogId(event.worklogId);
    if (!existing) return { ignored: true, entry: null };
    const pendingDelete = await updateEntry(existing.id, {
      action: "deleted",
      sync_status: "pending",
      last_error: null,
    });
    const result = await syncEntryById(pendingDelete.id);
    return { ignored: false, entry: result };
  }

  const issueId = event.issueId;
  if (!issueId) {
    throw new SyncError("Webhook worklog is missing issue id.", false);
  }

  let issue;
  try {
    issue = await getJiraIssueForSync(issueId);
    await touchSyncState({ last_successful_jira_at: new Date().toISOString(), last_jira_error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await touchSyncState({ last_jira_error: message });
    throw error;
  }

  const projectCode = issue.harvestProjectCode;
  if (!projectCode || !isHarvestProjectCodeAllowed(projectCode)) {
    return { ignored: true, entry: null };
  }

  let accountId = event.accountId;
  let timeSpentSeconds = event.timeSpentSeconds;
  let started = event.started;
  let commentText = event.commentText;

  if (accountId == null || timeSpentSeconds == null || !started) {
    const full = await getJiraWorklog(issue.key, event.worklogId);
    accountId = accountId ?? full.accountId;
    timeSpentSeconds = timeSpentSeconds ?? full.timeSpentSeconds;
    started = started ?? full.started;
    commentText = commentText || full.commentText;
  }

  if (!accountId) {
    throw new SyncError("Worklog is missing author accountId.", false);
  }

  const hours = hoursFromSeconds(timeSpentSeconds);
  const spentDate = spentDateFromStarted(started);
  const notes = notesWithIssue(commentText || issue.key, issue.key);
  const existing = await getEntryByWorklogId(event.worklogId);
  if (existing && worklogAlreadySynced(existing, { hours, spentDate, notes })) {
    return { ignored: false, entry: existing };
  }

  const action: SyncAction = existing || event.webhookEvent === "worklog_updated" ? "updated" : "created";

  const entry = await upsertEntryByWorklog({
    jira_issue_id: issue.id,
    jira_issue_key: issue.key,
    jira_issue_summary: issue.summary,
    jira_worklog_id: String(event.worklogId),
    jira_account_id: accountId,
    hours,
    spent_date: spentDate,
    notes,
    action,
    sync_status: "pending",
    harvest_project_code: projectCode,
    harvest_task_name: issue.harvestTaskName,
  });

  const result = await syncEntryById(entry.id);
  return { ignored: false, entry: result };
}

export async function removeDuplicateHarvestEntry(entryId: string): Promise<ProjectAnchorEntry> {
  const entry = await getEntryById(entryId);
  if (!entry) throw new Error("Time entry not found");
  if (!entry.duplicate_harvest_time_entry_id) {
    throw new Error("No extra Harvest entry recorded on this row.");
  }
  if (entry.duplicate_harvest_time_entry_id === entry.harvest_time_entry_id) {
    throw new Error("Refusing to delete the mapped Harvest entry.");
  }
  await deleteHarvestTimeEntry(entry.duplicate_harvest_time_entry_id);
  await touchSyncState({ last_successful_harvest_at: new Date().toISOString() });
  return updateEntry(entry.id, {
    duplicate_harvest_time_entry_id: null,
    sync_status: entry.harvest_time_entry_id ? "synced" : entry.sync_status,
    last_error: null,
    last_synced_at: new Date().toISOString(),
  });
}
