export type DuplicateCandidate = {
  id: number;
  user_id: number;
  spent_date: string;
  hours: number;
  project_id: number;
  notes: string | null;
  external_reference?: { id: string; permalink?: string } | null;
};

export type DuplicateTarget = {
  harvestUserId: number;
  spentDate: string;
  hours: number;
  projectId: number;
  issueKey: string;
};

const ISSUE_KEY = /\b([A-Za-z][A-Za-z0-9]+-\d+)\b/;

function issueKeyFromExternalReference(ref?: { id: string; permalink?: string } | null): string | null {
  if (!ref) return null;
  const fromPermalink =
    ref.permalink?.match(/\/browse\/([A-Za-z][A-Za-z0-9]+-\d+)/)?.[1] ??
    ref.permalink?.match(/\/issues\/([A-Za-z][A-Za-z0-9]+-\d+)/)?.[1];
  if (fromPermalink) return fromPermalink.toUpperCase();
  if (/^[A-Za-z][A-Za-z0-9]+-\d+$/.test(ref.id)) return ref.id.toUpperCase();
  return null;
}

export function hoursClose(a: number, b: number, epsilon = 0.05): boolean {
  return Math.abs(a - b) <= epsilon;
}

function issueKeyFromNotes(notes: string | null | undefined): string | null {
  const match = notes?.match(ISSUE_KEY);
  return match?.[1]?.toUpperCase() ?? null;
}

function candidateIssueKey(candidate: DuplicateCandidate): string | null {
  const fromRef = issueKeyFromExternalReference(candidate.external_reference);
  if (fromRef) return fromRef.toUpperCase();
  return issueKeyFromNotes(candidate.notes);
}

/**
 * Detect a Harvest plugin (or other) entry that would double-bill the same Jira worklog.
 *
 * Strong match: same user/date/project and the entry is tied to this Jira issue (external_reference or notes).
 * Weak match: same user/date/project/hours and the candidate is not tied to a *different* issue.
 */
export function isLikelyDuplicateHarvestEntry(candidate: DuplicateCandidate, target: DuplicateTarget): boolean {
  if (candidate.user_id !== target.harvestUserId) return false;
  if (candidate.spent_date !== target.spentDate) return false;
  if (candidate.project_id !== target.projectId) return false;

  const candidateIssue = candidateIssueKey(candidate);
  const targetIssue = target.issueKey.toUpperCase();

  if (candidateIssue && candidateIssue !== targetIssue) return false;

  if (candidateIssue === targetIssue && hoursClose(candidate.hours, target.hours, 0.25)) {
    return true;
  }

  if (!candidateIssue && hoursClose(candidate.hours, target.hours, 0.01)) {
    return true;
  }

  return false;
}

export function pickDuplicateCandidate(
  candidates: DuplicateCandidate[],
  target: DuplicateTarget,
  alreadyMappedIds: Set<number>
): DuplicateCandidate | null {
  return (
    candidates.find(
      (c) => !alreadyMappedIds.has(c.id) && isLikelyDuplicateHarvestEntry(c, target)
    ) ?? null
  );
}
