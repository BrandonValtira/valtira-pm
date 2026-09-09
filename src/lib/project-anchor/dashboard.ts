import { CENTRAL_TZ } from "./config";
import { todayInTimeZone } from "./webhook";
import { countByStatus, getSyncState, listEntries } from "./db";
import { listHarvestUsersWithEmail, withHarvestSessionUser } from "./harvest";
import { STANDARD_HARVEST_ROLES } from "./tasks";
import { listUserMaps } from "./users";
import type { ProjectAnchorEntry, ProjectAnchorSyncState, ProjectAnchorUserMap } from "./types";

export type TodayHoursRow = {
  jiraAccountId: string;
  displayName: string;
  hours: number;
  entries: ProjectAnchorEntry[];
};

export type TimeEntryPerson = {
  harvestUserId: number;
  name: string;
  email: string;
  isContractor: boolean;
  defaultTask: string | null;
};

export type TimeEntryDashboardData = {
  today: string;
  todayHours: TodayHoursRow[];
  recent: ProjectAnchorEntry[];
  failed: ProjectAnchorEntry[];
  status: {
    jira: "ok" | "error" | "unknown";
    harvest: "ok" | "error" | "unknown";
    lastSuccessfulSync: string | null;
    lastJiraSyncAt: string | null;
    lastWebhookAt: string | null;
    lastReconcileAt: string | null;
    lastJiraError: string | null;
    lastHarvestError: string | null;
    pending: number;
    failed: number;
    duplicate: number;
  };
  people: TimeEntryPerson[];
  roles: string[];
  peopleError: string | null;
  userMaps: ProjectAnchorUserMap[];
  syncState: ProjectAnchorSyncState | null;
};

function displayNameFor(entry: ProjectAnchorEntry, maps: ProjectAnchorUserMap[]): string {
  const map =
    maps.find((m) => m.jira_account_id && m.jira_account_id === entry.jira_account_id) ??
    maps.find((m) => m.harvest_user_id && m.harvest_user_id === entry.harvest_user_id);
  return map?.harvest_display_name || map?.jira_display_name || map?.harvest_email || map?.jira_email || "Unknown";
}

export async function loadTimeEntryDashboard(sessionUserId?: string | null): Promise<TimeEntryDashboardData> {
  const today = todayInTimeZone(CENTRAL_TZ);
  const [todayEntries, recent, failed, counts, syncState, userMaps] = await Promise.all([
    listEntries({ spentDate: today, statuses: ["synced", "pending", "duplicate"], limit: 200 }),
    listEntries({ limit: 50 }),
    listEntries({ statuses: ["failed", "duplicate"], limit: 50 }),
    countByStatus(),
    getSyncState(),
    listUserMaps(),
  ]);

  const byUser = new Map<string, TodayHoursRow>();
  for (const entry of todayEntries) {
    const current = byUser.get(entry.jira_account_id) ?? {
      jiraAccountId: entry.jira_account_id,
      displayName: displayNameFor(entry, userMaps),
      hours: 0,
      entries: [],
    };
    current.hours += Number(entry.hours);
    current.entries.push(entry);
    byUser.set(entry.jira_account_id, current);
  }

  const todayHours = Array.from(byUser.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));

  const jira: "ok" | "error" | "unknown" = !syncState
    ? "unknown"
    : syncState.last_jira_error
      ? "error"
      : syncState.last_successful_jira_at
        ? "ok"
        : "unknown";
  const harvest: "ok" | "error" | "unknown" = !syncState
    ? "unknown"
    : syncState.last_harvest_error
      ? "error"
      : syncState.last_successful_harvest_at
        ? "ok"
        : "unknown";

  let people: TimeEntryPerson[] = [];
  const roles = [...STANDARD_HARVEST_ROLES];
  let peopleError: string | null = null;
  try {
    const harvestUsers = await withHarvestSessionUser(sessionUserId ?? null, () => listHarvestUsersWithEmail());
    const mapByHarvest = new Map(userMaps.filter((m) => m.harvest_user_id).map((m) => [m.harvest_user_id as number, m]));
    people = harvestUsers
      .map((u) => {
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || String(u.id);
        const mapped = mapByHarvest.get(u.id);
        return {
          harvestUserId: u.id,
          name,
          email: u.email ?? "",
          isContractor: Boolean(u.is_contractor),
          defaultTask: mapped?.default_harvest_task_name ?? null,
        };
      })
      .sort((a, b) => {
        if (a.isContractor !== b.isContractor) return a.isContractor ? 1 : -1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
  } catch (error) {
    peopleError = error instanceof Error ? error.message : "Could not load Harvest people";
  }

  return {
    today,
    todayHours,
    recent,
    failed,
    status: {
      jira,
      harvest,
      lastSuccessfulSync: syncState?.last_successful_harvest_at ?? null,
      lastJiraSyncAt: syncState?.last_successful_jira_at ?? syncState?.last_reconcile_at ?? null,
      lastWebhookAt: syncState?.last_webhook_at ?? null,
      lastReconcileAt: syncState?.last_reconcile_at ?? null,
      lastJiraError: syncState?.last_jira_error ?? null,
      lastHarvestError: syncState?.last_harvest_error ?? null,
      pending: counts.pending,
      failed: counts.failed,
      duplicate: counts.duplicate,
    },
    people,
    roles,
    peopleError,
    userMaps,
    syncState,
  };
}
