"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

type HarvestProject = { id: number; name: string; code: string | null; client: { name: string } };
type JiraProject = { key: string; name: string; id: string };

export function EditProjectForm({
  projectId,
  projectName,
  initialHarvestIds,
  initialJiraKeys,
  initialClientEmails,
}: {
  projectId: string;
  projectName: string;
  initialHarvestIds: number[];
  initialJiraKeys: string[];
  initialClientEmails: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const section = searchParams.get("section") ?? "harvest";

  const [harvestProjects, setHarvestProjects] = useState<HarvestProject[]>([]);
  const [selectedHarvestIds, setSelectedHarvestIds] = useState<number[]>(initialHarvestIds);
  const [jiraProjects, setJiraProjects] = useState<JiraProject[]>([]);
  const [selectedJiraKeys, setSelectedJiraKeys] = useState<string[]>(initialJiraKeys);
  const [clientEmails, setClientEmails] = useState<string[]>(
    initialClientEmails.length ? initialClientEmails : [""]
  );
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/harvest/projects")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.projects) setHarvestProjects(data.projects);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/jira/projects")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.projects) setJiraProjects(data.projects);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function addEmail() {
    setClientEmails((prev) => [...prev, ""]);
  }
  function removeEmail(i: number) {
    setClientEmails((prev) => prev.filter((_, idx) => idx !== i));
  }
  function setEmailAt(i: number, value: string) {
    setClientEmails((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  }

  function toggleHarvest(id: number) {
    setSelectedHarvestIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleJira(key: string) {
    setSelectedJiraKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatus("loading");
    const emails = clientEmails.map((e) => e.trim()).filter(Boolean);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          harvestProjectIds: selectedHarvestIds,
          jiraProjectKeys: selectedJiraKeys,
          clientEmails: emails,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setError(data.error || res.statusText);
        return;
      }
      router.push(`/dashboard/project/${projectId}`);
      router.refresh();
    } catch {
      setStatus("error");
      setError("Request failed");
    }
  }

  const sections = [
    { id: "harvest", label: "Harvest projects" },
    { id: "jira", label: "Jira project keys" },
    { id: "recipients", label: "Report recipients" },
  ] as const;

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="text-lg font-medium text-neutral-900">Edit {projectName}</h2>
      <p className="mt-1 text-sm text-neutral-700">
        Update Harvest projects, Jira keys, or report recipients.
      </p>

      <nav className="mt-4 flex gap-2 border-b border-neutral-200 pb-2">
        {sections.map((s) => (
          <Link
            key={s.id}
            href={`/dashboard/project/${projectId}/edit?section=${s.id}`}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              section === s.id
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6 space-y-6">
        {(section !== "jira" && section !== "recipients") && (
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Harvest projects (for hours in reports)
            </label>
            {harvestProjects.length === 0 ? (
              <p className="mt-1 text-sm text-neutral-700">
                Connect Harvest on the{" "}
                <Link href="/dashboard" className="text-neutral-700 underline">
                  dashboard
                </Link>{" "}
                to select projects.
              </p>
            ) : (
              <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-md border border-neutral-200 p-2">
                {harvestProjects
                  .sort((a, b) => {
                    const clientA = (a.client?.name ?? "\uFFFF").toLowerCase();
                    const clientB = (b.client?.name ?? "\uFFFF").toLowerCase();
                    const cmp = clientA.localeCompare(clientB, undefined, { sensitivity: "base" });
                    return cmp !== 0 ? cmp : a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
                  })
                  .map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`harvest-${p.id}`}
                      checked={selectedHarvestIds.includes(p.id)}
                      onChange={() => toggleHarvest(p.id)}
                      className="h-4 w-4 rounded border-neutral-300"
                    />
                    <label htmlFor={`harvest-${p.id}`} className="text-sm">
                      {p.client?.name && <span className="text-neutral-600">{p.client.name}</span>}
                      {p.client?.name && <span className="text-neutral-400"> · </span>}
                      <span className={p.client?.name ? "text-neutral-700" : ""}>{p.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {section === "jira" && (
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Jira project keys
            </label>
            {jiraProjects.length === 0 ? (
              <p className="mt-1 text-sm text-neutral-700">
                Connect Jira on the{" "}
                <Link href="/dashboard" className="text-neutral-700 underline">
                  dashboard
                </Link>{" "}
                to select projects.
              </p>
            ) : (
              <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-md border border-neutral-200 p-2">
                {jiraProjects.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`jira-${p.key}`}
                      checked={selectedJiraKeys.includes(p.key)}
                      onChange={() => toggleJira(p.key)}
                      className="h-4 w-4 rounded border-neutral-300"
                    />
                    <label htmlFor={`jira-${p.key}`} className="text-sm">
                      {p.name}
                      <span className="ml-1 text-neutral-700">({p.key})</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {section === "recipients" && (
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Report recipients (client emails)
            </label>
            <div className="mt-2 space-y-2">
              {clientEmails.map((email, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmailAt(i, e.target.value)}
                    placeholder="client@example.com"
                    className="block flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                  />
                  {clientEmails.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEmail(i)}
                      className="rounded-md border border-neutral-300 px-2 text-sm text-neutral-600 hover:bg-neutral-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addEmail}
                className="text-sm text-neutral-600 underline hover:text-neutral-900"
              >
                + Add another email
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <div className="mt-6 flex gap-3">
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {status === "loading" ? "Saving…" : "Save changes"}
        </button>
        <Link
          href={`/dashboard/project/${projectId}`}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
