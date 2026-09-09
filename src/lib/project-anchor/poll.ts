import { CENTRAL_TZ, isHarvestProjectCodeAllowed, worklogLookbackDate } from "./config";
import { listEntries, touchSyncState } from "./db";
import { deleteUnmappedHarvestEntriesForIssue, findHarvestProjectByCode } from "./harvest";
import { getJiraIssueForSync, listIssueWorklogs, searchIssuesWithHarvestBillingProject } from "./jira";
import { handleWorklogEvent } from "./sync";
import { spentDateFromStarted, todayInTimeZone } from "./webhook";

export async function pollManagedJiraWorklogs(): Promise<{ pulled: number; ignored: number; errors: number }> {
  let pulled = 0;
  let ignored = 0;
  let errors = 0;
  const lookback = worklogLookbackDate();
  const today = todayInTimeZone(CENTRAL_TZ);

  let issues;
  try {
    issues = await searchIssuesWithHarvestBillingProject(50);
    const seenKeys = new Set(issues.map((issue) => issue.key));
    const tracked = await listEntries({ statuses: ["synced", "pending", "duplicate", "failed"], limit: 200 });
    for (const entry of tracked) {
      if (seenKeys.has(entry.jira_issue_key)) continue;
      try {
        issues.push(await getJiraIssueForSync(entry.jira_issue_key));
        seenKeys.add(entry.jira_issue_key);
      } catch (error) {
        errors += 1;
        const message = error instanceof Error ? error.message : String(error);
        await touchSyncState({ last_jira_error: message });
      }
    }
    await touchSyncState({ last_successful_jira_at: new Date().toISOString(), last_jira_error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await touchSyncState({ last_jira_error: message });
    return { pulled: 0, ignored: 0, errors: 1 };
  }

  for (const issue of issues) {
    const canWrite = Boolean(issue.harvestProjectCode && isHarvestProjectCodeAllowed(issue.harvestProjectCode));
    try {
      const { worklogs, listedAll } = await listIssueWorklogs(issue.key);
      const seen = new Set<string>();
      if (canWrite) {
        for (const worklog of worklogs) {
          const spentDate = spentDateFromStarted(worklog.started);
          if (spentDate < lookback) continue;
          seen.add(worklog.id);
          const result = await handleWorklogEvent({
            webhookEvent: "worklog_created",
            worklogId: worklog.id,
            issueId: worklog.issueId || issue.id,
            accountId: worklog.accountId,
            timeSpentSeconds: worklog.timeSpentSeconds,
            started: worklog.started,
            commentText: worklog.commentText,
          });
          if (result.ignored) ignored += 1;
          else pulled += 1;
        }
      }
      if (!listedAll) continue;
      const existing = await listEntries({ issueKey: issue.key, limit: 200 });
      for (const entry of existing) {
        if (entry.sync_status === "deleted") continue;
        if (entry.spent_date < lookback) continue;
        if (canWrite && seen.has(entry.jira_worklog_id)) continue;
        await handleWorklogEvent({
          webhookEvent: "worklog_deleted",
          worklogId: entry.jira_worklog_id,
          issueId: entry.jira_issue_id,
          accountId: entry.jira_account_id,
          timeSpentSeconds: null,
          started: null,
          commentText: "",
        });
      }
      if (!issue.harvestProjectCode || !isHarvestProjectCodeAllowed(issue.harvestProjectCode)) continue;
      const project = await findHarvestProjectByCode(issue.harvestProjectCode);
      if (!project) continue;
      const keepHarvestIds = new Set(
        (await listEntries({ issueKey: issue.key, limit: 200 }))
          .filter((entry) => entry.sync_status !== "deleted" && entry.harvest_time_entry_id)
          .map((entry) => entry.harvest_time_entry_id as number)
      );
      await deleteUnmappedHarvestEntriesForIssue({
        issueKey: issue.key,
        projectId: project.id,
        from: lookback,
        to: today,
        keepHarvestIds,
      });
    } catch (error) {
      errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      await touchSyncState({ last_jira_error: message });
    }
  }

  return { pulled, ignored, errors };
}
