const DEFAULT_ALLOWED_CODES = ["VL906"];

export function getWebhookSecret(): string | null {
  const secret =
    process.env.JIRA_WEBHOOK_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    null;
  return secret || null;
}

/** Harvest project codes Project Anchor may write to. MVP default: VL906. */
export function getAllowedHarvestProjectCodes(): string[] {
  const raw = process.env.HARVEST_ALLOWED_PROJECT_CODES?.trim();
  const list = (raw ? raw.split(/[,\s]+/) : DEFAULT_ALLOWED_CODES)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_ALLOWED_CODES;
}

export function isHarvestProjectCodeAllowed(code: string | null | undefined): boolean {
  if (!code?.trim()) return false;
  return getAllowedHarvestProjectCodes().includes(code.trim().toUpperCase());
}

export function harvestProjectCodeFromField(fieldValue: string | null | undefined): string | null {
  const code = fieldValue?.trim().toUpperCase() || null;
  return code || null;
}

export function worklogLookbackDate(now = new Date()): string {
  const raw = Number(process.env.JIRA_WORKLOG_LOOKBACK_DAYS ?? 14);
  const days = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 90) : 14;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const CENTRAL_TZ = "America/Chicago";
export const MAX_AUTO_RETRIES = 20;
export const IN_REQUEST_RETRIES = 2;
