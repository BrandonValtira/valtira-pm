import { createHmac, timingSafeEqual } from "crypto";
import type { ParsedWorklogEvent } from "./types";

export function verifyJiraWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader?.trim()) return false;
  const [method, sig] = signatureHeader.trim().split("=");
  if (method !== "sha256" || !sig) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyWebhookAuth(opts: {
  rawBody: string;
  signatureHeader: string | null;
  queryToken: string | null;
  secret: string;
}): boolean {
  if (verifyJiraWebhookSignature(opts.rawBody, opts.signatureHeader, opts.secret)) return true;
  const token = opts.queryToken?.trim();
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(opts.secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Flatten Jira ADF or plain-string worklog comments to text. */
export function jiraCommentToText(comment: unknown): string {
  if (comment == null) return "";
  if (typeof comment === "string") return comment.trim();
  const parts: string[] = [];
  const walk = (node: unknown) => {
    const rec = asRecord(node);
    if (!rec) return;
    if (typeof rec.text === "string") parts.push(rec.text);
    if (Array.isArray(rec.content)) rec.content.forEach(walk);
  };
  walk(comment);
  return parts.join(" ").trim();
}

function webhookEventName(payload: Record<string, unknown>): ParsedWorklogEvent["webhookEvent"] | null {
  const raw = String(payload.webhookEvent ?? payload.event ?? "").toLowerCase();
  if (raw.includes("worklog_created") || raw === "jira:worklog_created") return "worklog_created";
  if (raw.includes("worklog_updated") || raw === "jira:worklog_updated") return "worklog_updated";
  if (raw.includes("worklog_deleted") || raw === "jira:worklog_deleted") return "worklog_deleted";
  return null;
}

export function parseWorklogWebhook(payload: unknown): ParsedWorklogEvent | null {
  const root = asRecord(payload);
  if (!root) return null;
  const event = webhookEventName(root);
  if (!event) return null;
  const worklog = asRecord(root.worklog) ?? asRecord(root.worklogCreated) ?? asRecord(root.worklogUpdated);
  if (!worklog) return null;
  const author = asRecord(worklog.author);
  const issue = asRecord(root.issue);
  const worklogId = worklog.id != null ? String(worklog.id) : "";
  if (!worklogId) return null;
  const issueId =
    (worklog.issueId != null ? String(worklog.issueId) : null) ||
    (issue?.id != null ? String(issue.id) : null);
  const timeSpentSeconds =
    typeof worklog.timeSpentSeconds === "number"
      ? worklog.timeSpentSeconds
      : typeof worklog.timeSpentSeconds === "string"
        ? Number(worklog.timeSpentSeconds)
        : null;
  return {
    webhookEvent: event,
    worklogId,
    issueId,
    accountId: author?.accountId != null ? String(author.accountId) : null,
    timeSpentSeconds: Number.isFinite(timeSpentSeconds) ? timeSpentSeconds : null,
    started: typeof worklog.started === "string" ? worklog.started : null,
    commentText: jiraCommentToText(worklog.comment),
  };
}

export function hoursFromSeconds(seconds: number | null): number {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.round((seconds / 3600) * 100) / 100;
}

/** Worklog `started` timestamp → Harvest spent_date in America/Chicago. */
export function spentDateFromStarted(started: string | null, timeZone = "America/Chicago"): string {
  const date = started ? new Date(started) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
  }
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

export function todayInTimeZone(timeZone = "America/Chicago"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}
