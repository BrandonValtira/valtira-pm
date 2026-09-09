import { MAX_AUTO_RETRIES } from "./config";
import { listRetryableEntries, listMappedHarvestTimeEntryIds, touchSyncState, updateEntry } from "./db";
import { pickDuplicateCandidate } from "./duplicates";
import { listHarvestTimeEntries, toDuplicateCandidate } from "./harvest";
import { pollManagedJiraWorklogs } from "./poll";
import { syncEntryById } from "./sync";
import type { ProjectAnchorEntry } from "./types";

const PERMANENT_HINTS = [
  "not in HARVEST_ALLOWED_PROJECT_CODES",
  "No Harvest user mapped",
  "No Harvest task resolved",
  "is not assigned on project",
  "Harvest project not found",
];

function isPermanentError(message: string | null): boolean {
  if (!message) return false;
  return PERMANENT_HINTS.some((hint) => message.includes(hint));
}

async function scanDuplicates(entry: ProjectAnchorEntry): Promise<ProjectAnchorEntry> {
  if (!entry.harvest_user_id || !entry.harvest_project_id || !entry.harvest_time_entry_id) return entry;
  const mapped = await listMappedHarvestTimeEntryIds();
  mapped.delete(entry.harvest_time_entry_id);
  const existing = await listHarvestTimeEntries({
    userId: entry.harvest_user_id,
    from: entry.spent_date,
    to: entry.spent_date,
    projectId: entry.harvest_project_id,
  });
  const exclude = new Set(mapped);
  exclude.add(entry.harvest_time_entry_id);
  const extra = pickDuplicateCandidate(
    existing.map(toDuplicateCandidate),
    {
      harvestUserId: entry.harvest_user_id,
      spentDate: entry.spent_date,
      hours: Number(entry.hours),
      projectId: entry.harvest_project_id,
      issueKey: entry.jira_issue_key,
    },
    exclude
  );
  if (!extra) return entry;
  return updateEntry(entry.id, {
    duplicate_harvest_time_entry_id: extra.id,
    sync_status: "duplicate",
    last_error: `Possible double billing: Harvest entry ${entry.harvest_time_entry_id} (ours) and ${extra.id} (extra, often the Harvest Jira plugin). Remove the extra entry.`,
  });
}

export async function runReconciliation(): Promise<{
  pulled: number;
  ignored: number;
  retried: number;
  duplicates: number;
  errors: number;
}> {
  const poll = await pollManagedJiraWorklogs();
  const retryable = await listRetryableEntries(MAX_AUTO_RETRIES);
  let retried = 0;
  let errors = poll.errors;
  let duplicates = 0;

  for (const entry of retryable) {
    if (entry.sync_status === "failed" && isPermanentError(entry.last_error)) {
      continue;
    }
    if (entry.sync_status === "duplicate") {
      const scanned = await scanDuplicates(entry);
      if (scanned.sync_status === "duplicate") duplicates += 1;
      continue;
    }
    retried += 1;
    const result = await syncEntryById(entry.id, true);
    if (result.sync_status === "failed") errors += 1;
    if (result.sync_status === "duplicate") duplicates += 1;
  }

  await touchSyncState({ last_reconcile_at: new Date().toISOString() });
  return { pulled: poll.pulled, ignored: poll.ignored, retried, duplicates, errors };
}
