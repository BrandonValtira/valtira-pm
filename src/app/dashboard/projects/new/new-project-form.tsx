"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type HarvestProject = { id: number; name: string; code: string | null; is_active?: boolean; client: { name: string } };
type JiraProject = { key: string; name: string; id: string };

export function NewProjectForm({ className }: { className?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [harvestProjects, setHarvestProjects] = useState<HarvestProject[]>([]);
  const [selectedHarvestIds, setSelectedHarvestIds] = useState<number[]>([]);
  const [clientEmails, setClientEmails] = useState<string[]>([""]);
  const [jiraProjects, setJiraProjects] = useState<JiraProject[]>([]);
  const [selectedJiraKeys, setSelectedJiraKeys] = useState<string[]>([]);
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
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          harvestProjectIds: selectedHarvestIds,
          clientEmails: emails,
          jiraProjectKeys: selectedJiraKeys,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setError(data.error || res.statusText);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setStatus("error");
      setError("Request failed");
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`rounded-xl border border-neutral-200 bg-white p-6 ${className ?? ""}`}>
      <div className="space-y-6">
        <div>
          <label htmlFor="project-name" className="block text-sm font-medium text-neutral-700">
            Project name
          </label>
          <input
            id="project-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Corp – Website"
            className="mt-1 block w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">
            Harvest projects (for hours in reports)
          </label>
          {harvestProjects.length === 0 ? (
            <p className="mt-1 text-sm text-neutral-700">
              Connect Harvest in{" "}
              <a href="/dashboard/settings" className="text-neutral-700 underline">
                Settings
              </a>{" "}
              to select projects.
            </p>
          ) : (
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-md border border-neutral-200 p-2">
              {harvestProjects
                .filter((p) => p.is_active !== false)
                .sort((a, b) => {
                  const clientA = a.client?.name ?? "";
                  const clientB = b.client?.name ?? "";
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
                      {p.name}
                      {p.client?.name && (
                        <span className="ml-1 text-neutral-700">({p.client.name})</span>
                      )}
                    </label>
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">
            Client emails (report recipients)
          </label>
          <div className="mt-2 space-y-2">
            {clientEmails.map((email, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmailAt(i, e.target.value)}
                  placeholder="client@example.com"
                  className="block flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
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

        
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      )}
      <div className="mt-6 flex gap-3">
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {status === "loading" ? "Creating…" : "Create project"}
        </button>
        <a
          href="/dashboard"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
