export type HarvestLockFields = {
  is_locked?: boolean | null;
  locked_reason?: string | null;
};

export function harvestEntryIsLocked(entry: HarvestLockFields | null | undefined): boolean {
  return Boolean(entry?.is_locked);
}

export function firstLockedHarvestEntry<T extends HarvestLockFields>(entries: T[]): T | null {
  return entries.find((entry) => harvestEntryIsLocked(entry)) ?? null;
}

export function userDateHasLockedTime(entries: HarvestLockFields[]): boolean {
  return firstLockedHarvestEntry(entries) != null;
}

export function harvestUserIsInactive(user: { is_active?: boolean | null } | null | undefined): boolean {
  if (user == null) return true;
  return user.is_active === false;
}

export function harvestLockedMessage(reason?: string | null): string {
  const detail = reason?.trim() ? ` (${reason.trim()})` : "";
  return `Harvest time is locked${detail}. Harvest was not changed.`;
}

export function harvestInactiveUserMessage(): string {
  return "Harvest user is inactive. Harvest was not changed.";
}
