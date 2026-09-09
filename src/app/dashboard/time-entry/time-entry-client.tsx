"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TimeEntryDashboardData } from "@/lib/project-anchor/dashboard";
import type { ProjectAnchorEntry, ProjectAnchorUserMap } from "@/lib/project-anchor/types";

function formatHours(hours: number): string {
  return hours.toFixed(2);
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusLabel(status: string): string {
  if (status === "synced") return "Synced";
  if (status === "pending") return "Pending";
  if (status === "failed") return "Failed";
  if (status === "duplicate") return "Double bill";
  if (status === "deleted") return "Deleted";
  if (status === "ignored") return "Ignored";
  return status;
}

function actionLabel(action: string, linkSource: string | null): string {
  if (linkSource === "adopted") return "Linked existing Harvest entry";
  if (action === "created") return "Created";
  if (action === "updated") return "Updated";
  if (action === "deleted") return "Deleted";
  return action;
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "synced"
      ? "bg-emerald-50 text-emerald-800"
      : status === "pending"
        ? "bg-amber-50 text-amber-800"
        : status === "duplicate"
          ? "bg-orange-50 text-orange-800"
          : status === "failed"
            ? "bg-red-50 text-red-800"
            : "bg-neutral-100 text-neutral-700";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{statusLabel(status)}</span>;
}

function userLabel(entry: ProjectAnchorEntry, maps: ProjectAnchorUserMap[]): string {
  const map =
    maps.find((m) => m.jira_account_id && m.jira_account_id === entry.jira_account_id) ??
    maps.find((m) => m.harvest_user_id && m.harvest_user_id === entry.harvest_user_id);
  return map?.harvest_display_name || map?.jira_display_name || map?.harvest_email || "Unknown";
}

export function TimeEntryClient({ initial }: { initial: TimeEntryDashboardData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const failedCount = data.status.failed + data.status.duplicate;

  async function refresh() {
    const res = await fetch("/api/time-entry/status");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Failed to refresh");
    setData(json as TimeEntryDashboardData);
  }

  async function pullFromJira() {
    setError("");
    setBusy("pull");
    try {
      const res = await fetch("/api/time-entry/pull", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Sync from Jira failed");
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync from Jira failed");
    } finally {
      setBusy(null);
    }
  }

  async function retry(id: string, action?: "remove_duplicate") {
    setError("");
    setBusy(id);
    try {
      const res = await fetch("/api/time-entry/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Retry failed");
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveDefaultRole(person: TimeEntryDashboardData["people"][number], taskName: string) {
    setError("");
    setBusy(`role-${person.harvestUserId}`);
    setData((current) => ({
      ...current,
      people: current.people.map((p) =>
        p.harvestUserId === person.harvestUserId ? { ...p, defaultTask: taskName || null } : p
      ),
    }));
    try {
      const res = await fetch("/api/time-entry/mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          harvest_user_id: person.harvestUserId,
          harvest_email: person.email || null,
          harvest_display_name: person.name,
          default_harvest_task_name: taskName || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to save default role");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save default role");
      await refresh().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  const integrationItems = useMemo(
    () => [
      { label: "Jira", value: data.status.jira === "ok" ? "Connected" : data.status.jira === "error" ? "Error" : "Waiting for first sync" },
      { label: "Harvest", value: data.status.harvest === "ok" ? "Connected" : data.status.harvest === "error" ? "Error" : "Waiting for first sync" },
      { label: "Last successful sync", value: formatWhen(data.status.lastSuccessfulSync) },
      { label: "Pending", value: String(data.status.pending) },
      { label: "Failed", value: String(data.status.failed) },
      { label: "Possible double bills", value: String(data.status.duplicate) },
    ],
    [data.status]
  );

  return (
    <div className="mt-6 space-y-8">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-neutral-900">Today&apos;s Hours</h2>
            <p className="mt-1 text-sm text-neutral-600">Central time · {data.today}</p>
          </div>
          <button
            type="button"
            onClick={pullFromJira}
            disabled={busy === "pull"}
            className="rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === "pull" ? "Syncing…" : "Sync from Jira"}
          </button>
        </div>
        {data.todayHours.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">No Project Anchor time logged today.</p>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-100">
            {data.todayHours.map((row) => (
              <li key={row.jiraAccountId}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between py-3 text-left"
                  onClick={() => setExpanded(expanded === row.jiraAccountId ? null : row.jiraAccountId)}
                >
                  <span className="font-medium text-neutral-900">{row.displayName}</span>
                  <span className="tabular-nums text-neutral-700">{formatHours(row.hours)} hrs</span>
                </button>
                {expanded === row.jiraAccountId && (
                  <div className="mb-3 overflow-x-auto rounded-lg border border-neutral-100 bg-neutral-50">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-neutral-500">
                          <th className="px-3 py-2 font-medium">Issue</th>
                          <th className="px-3 py-2 font-medium">Hours</th>
                          <th className="px-3 py-2 font-medium">Harvest</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.entries.map((entry) => (
                          <tr key={entry.id} className="border-t border-neutral-100 text-neutral-800">
                            <td className="px-3 py-2">
                              {entry.jira_issue_key}
                              {entry.jira_issue_summary ? ` · ${entry.jira_issue_summary}` : ""}
                            </td>
                            <td className="px-3 py-2 tabular-nums">{formatHours(Number(entry.hours))}</td>
                            <td className="px-3 py-2">
                              {entry.harvest_project_code || entry.harvest_project_name || "—"}
                              {entry.harvest_task_name ? ` / ${entry.harvest_task_name}` : ""}
                            </td>
                            <td className="px-3 py-2">
                              <StatusPill status={entry.sync_status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-neutral-900">Integration Status</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {integrationItems.map((item) => (
            <div key={item.label} className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2">
              <dt className="text-xs uppercase tracking-wide text-neutral-500">{item.label}</dt>
              <dd className="mt-1 text-sm text-neutral-900">{item.value}</dd>
            </div>
          ))}
        </dl>
        {(data.status.lastJiraError || data.status.lastHarvestError) && (
          <p className="mt-3 text-sm text-red-700">{data.status.lastHarvestError || data.status.lastJiraError}</p>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-neutral-900">Recent Activity</h2>
        {data.recent.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">No sync activity yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="px-2 py-2 font-medium">Time</th>
                  <th className="px-2 py-2 font-medium">User</th>
                  <th className="px-2 py-2 font-medium">Issue</th>
                  <th className="px-2 py-2 font-medium">Hours</th>
                  <th className="px-2 py-2 font-medium">Harvest</th>
                  <th className="px-2 py-2 font-medium">Action</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((entry) => (
                  <tr key={entry.id} className="border-t border-neutral-100 text-neutral-800">
                    <td className="whitespace-nowrap px-2 py-2">{formatWhen(entry.updated_at)}</td>
                    <td className="px-2 py-2">{userLabel(entry, data.userMaps)}</td>
                    <td className="px-2 py-2">
                      <div>{entry.jira_issue_key}</div>
                      {entry.jira_issue_summary && (
                        <div className="max-w-xs truncate text-xs text-neutral-500">{entry.jira_issue_summary}</div>
                      )}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{formatHours(Number(entry.hours))}</td>
                    <td className="px-2 py-2">{entry.harvest_project_code || entry.harvest_project_name || "—"}</td>
                    <td className="px-2 py-2">{actionLabel(entry.action, entry.harvest_link_source)}</td>
                    <td className="px-2 py-2">
                      <StatusPill status={entry.sync_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-neutral-900">Failed Synchronizations</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Temporary API failures retry automatically. Possible double bills appear here if the Harvest Jira plugin also wrote time.
        </p>
        {data.failed.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">
            {failedCount === 0 ? "No failed or duplicate entries." : "No rows to display."}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="px-2 py-2 font-medium">User</th>
                  <th className="px-2 py-2 font-medium">Issue</th>
                  <th className="px-2 py-2 font-medium">Worklog</th>
                  <th className="px-2 py-2 font-medium">Harvest project</th>
                  <th className="px-2 py-2 font-medium">Error</th>
                  <th className="px-2 py-2 font-medium">Last retry</th>
                  <th className="px-2 py-2 font-medium">Tries</th>
                  <th className="px-2 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {data.failed.map((entry) => (
                  <tr key={entry.id} className="border-t border-neutral-100 text-neutral-800">
                    <td className="px-2 py-2">{userLabel(entry, data.userMaps)}</td>
                    <td className="px-2 py-2">{entry.jira_issue_key}</td>
                    <td className="px-2 py-2 font-mono text-xs">{entry.jira_worklog_id}</td>
                    <td className="px-2 py-2">{entry.harvest_project_code || "—"}</td>
                    <td className="max-w-xs px-2 py-2 text-xs text-neutral-700">{entry.last_error || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2">{formatWhen(entry.last_retry_at)}</td>
                    <td className="px-2 py-2">{entry.retry_count}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          disabled={busy === entry.id}
                          onClick={() => retry(entry.id)}
                          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        >
                          {busy === entry.id ? "Working…" : "Retry Sync"}
                        </button>
                        {entry.duplicate_harvest_time_entry_id && (
                          <button
                            type="button"
                            disabled={busy === entry.id}
                            onClick={() => retry(entry.id, "remove_duplicate")}
                            className="rounded-lg border border-orange-300 px-3 py-1.5 text-xs font-medium text-orange-800"
                          >
                            Remove extra Harvest entry
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-neutral-900">People</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Employees and contractors from Harvest. Set each person&apos;s default Harvest role. Jira is matched automatically by email when they log time.
        </p>
        {data.peopleError ? (
          <p className="mt-4 text-sm text-red-700">{data.peopleError}</p>
        ) : data.people.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">No active Harvest people found.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Type</th>
                  <th className="px-2 py-2 font-medium">Default role</th>
                </tr>
              </thead>
              <tbody>
                {data.people.map((person) => (
                  <tr key={person.harvestUserId} className="border-t border-neutral-100 text-neutral-800">
                    <td className="px-2 py-2">
                      <div>{person.name}</div>
                      {person.email && <div className="text-xs text-neutral-500">{person.email}</div>}
                    </td>
                    <td className="px-2 py-2 text-neutral-600">{person.isContractor ? "Contractor" : "Employee"}</td>
                    <td className="px-2 py-2">
                      <select
                        className="w-full max-w-xs rounded-lg border border-neutral-300 bg-white px-3 py-2"
                        value={person.defaultTask ?? ""}
                        disabled={busy === `role-${person.harvestUserId}`}
                        onChange={(e) => saveDefaultRole(person, e.target.value)}
                      >
                        <option value="">Select role…</option>
                        {person.defaultTask && !data.roles.includes(person.defaultTask) && (
                          <option value={person.defaultTask}>{person.defaultTask}</option>
                        )}
                        {data.roles.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
