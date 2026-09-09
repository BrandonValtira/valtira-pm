/** Company-wide Harvest roles. Same names on every project so a person keeps one default. */
export const STANDARD_HARVEST_ROLES = [
  "Application Developer",
  "Back-End Developer",
  "Front End Developer",
  "DevOps Engineer",
  "DevOps Lead",
  "Project Manager",
  "QA Analyst",
  "Technical Architect",
  "UI/UX Designer",
] as const;

const TASK_ALIASES: Record<string, string> = {
  dev: "Application Developer",
  development: "Application Developer",
  "application developer": "Application Developer",
  "back-end developer": "Back-End Developer",
  "backend developer": "Back-End Developer",
  "front end developer": "Front End Developer",
  "front-end developer": "Front End Developer",
  "frontend developer": "Front End Developer",
  devops: "DevOps Engineer",
  "devops engineer": "DevOps Engineer",
  "devops lead": "DevOps Lead",
  pm: "Project Manager",
  "project management": "Project Manager",
  "project manager": "Project Manager",
  qa: "QA Analyst",
  "qa analyst": "QA Analyst",
  architect: "Technical Architect",
  "technical architect": "Technical Architect",
  ux: "UI/UX Designer",
  "ui/ux": "UI/UX Designer",
  "ui/ux designer": "UI/UX Designer",
};

export type HarvestTaskAssignment = {
  id: number;
  is_active: boolean;
  billable?: boolean;
  task: { id: number; name: string };
};

export function extractTaskTag(notes: string | null | undefined): string | null {
  if (!notes?.trim()) return null;
  const match = notes.match(/\[([^\]]{1,80})\]/);
  const tag = match?.[1]?.trim();
  return tag || null;
}

export function normalizeTaskName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function canonicalTaskName(name: string): string {
  const key = normalizeTaskName(name);
  return TASK_ALIASES[key] ?? name.trim();
}

export function findTaskAssignment(
  assignments: HarvestTaskAssignment[],
  requestedName: string
): HarvestTaskAssignment | null {
  const wanted = normalizeTaskName(canonicalTaskName(requestedName));
  const active = assignments.filter((a) => a.is_active !== false);
  const exact = active.find((a) => normalizeTaskName(a.task.name) === wanted);
  if (exact) return exact;
  const aliasTarget = TASK_ALIASES[wanted];
  if (aliasTarget) {
    const viaAlias = active.find((a) => normalizeTaskName(a.task.name) === normalizeTaskName(aliasTarget));
    if (viaAlias) return viaAlias;
  }
  return (
    active.find((a) => normalizeTaskName(a.task.name).includes(wanted) || wanted.includes(normalizeTaskName(a.task.name))) ??
    null
  );
}

export type TaskResolutionInput = {
  commentTag: string | null;
  issueTaskField: string | null;
  userDefaultTask: string | null;
};

export function resolveRequestedTaskName(input: TaskResolutionInput): string | null {
  const comment = input.commentTag?.trim();
  if (comment) return canonicalTaskName(comment);
  const issue = input.issueTaskField?.trim();
  if (issue) return canonicalTaskName(issue);
  const userDefault = input.userDefaultTask?.trim();
  if (userDefault) return canonicalTaskName(userDefault);
  return null;
}
