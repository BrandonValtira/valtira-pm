export function shouldIngestWorklog(
  worklogId: string,
  spentDate: string,
  lookback: string,
  trackedIds: Set<string>
): boolean {
  if (trackedIds.has(String(worklogId))) return true;
  return spentDate >= lookback;
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
