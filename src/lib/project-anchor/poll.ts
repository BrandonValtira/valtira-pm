import { isHarvestProjectCodeAllowed, worklogLookbackDate } from "./config";
import { listEntries, touchSyncState } from "./db";
import { listIssueWorklogs, searchIssuesWithHarvestBillingProject } from "./jira";
import { handleWorklogEvent } from "./sync";
import { spentDateFromStarted } from "./webhook";

export async function pollManagedJiraWorklogs(): Promise<{ pulled: number; ignored: number; errors: number }> {
  let pulled = 0;
  let ignored = 0;
  let errors = 0;
  const lookback = worklogLookbackDate();

  let issues;
  try {
    issues = await searchIssuesWithHarvestBillingProject(50);
    await touchSyncState({ last_successful_jira_at: new Date().toISOString(), last_jira_error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await touchSyncState({ last_jira_error: message });
    return { pulled: 0, ignored: 0, errors: 1 };
  }

  for (const issue of issues) {
    if (!issue.harvestProjectCode || !isHarvestProjectCodeAllowed(issue.harvestProjectCode)) {
      ignored += 1;
      continue;
    }
    try {
      const { worklogs, listedAll } = await listIssueWorklogs(issue.key);
      const seen = new Set<string>();
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
      if (!listedAll || worklogs.length === 0) continue;
      const existing = await listEntries({ issueKey: issue.key, limit: 200 });
      for (const entry of existing) {
        if (entry.sync_status === "deleted") continue;
        if (entry.spent_date < lookback) continue;
        if (seen.has(entry.jira_worklog_id)) continue;
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
    } catch (error) {
      errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      await touchSyncState({ last_jira_error: message });
    }
  }

  return { pulled, ignored, errors };
}
