export function shouldIngestWorklog(
  worklogId: string,
  spentDate: string,
  lookback: string,
  trackedIds: Set<string>
): boolean {
  if (trackedIds.has(String(worklogId))) return true;
  return spentDate >= lookback;
}

/** Jira list/webhook payloads can be stale. A missing or zero-second worklog is a delete. */
export function liveWorklogWriteDecision(live: { timeSpentSeconds: number } | null): "write" | "delete" {
  if (!live || !Number.isFinite(live.timeSpentSeconds) || live.timeSpentSeconds <= 0) return "delete";
  return "write";
}

export function isJiraApiNotFoundMessage(message: string): boolean {
  return /\bJira API 404\b/.test(message);
}

export function worklogAlreadySynced(
  existing: { sync_status: string; hours: number; spent_date: string; notes: string | null },
  next: { hours: number; spentDate: string; notes: string }
): boolean {
  if (existing.sync_status !== "synced" && existing.sync_status !== "duplicate") return false;
  return (
    Number(existing.hours) === next.hours &&
    existing.spent_date === next.spentDate &&
    (existing.notes ?? "") === next.notes
  );
}
