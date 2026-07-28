"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export type HarvestProjectOption = {
  id: number;
  name: string;
  is_active: boolean;
  client?: { name: string };
};

export function EditRpProjectModal({
  projectName,
  initialDisplayTitle,
  harvestProjectIds,
  onClose,
  onSaved,
}: {
  projectName: string;
  initialDisplayTitle: string;
  harvestProjectIds: number[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [titleDraft, setTitleDraft] = useState(
    () => initialDisplayTitle.trim() || projectName
  );
  const [harvestProjects, setHarvestProjects] = useState<HarvestProjectOption[]>([]);
  const [selectedClient, setSelectedClient] = useState<string | "">("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set(harvestProjectIds));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const clients = useMemo(() => {
    const set = new Set<string>();
    harvestProjects.forEach((p) => { if (p.client?.name) set.add(p.client.name); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [harvestProjects]);
  const projectsFiltered = useMemo(
    () =>
      selectedClient
        ? harvestProjects.filter((p) => p.client?.name === selectedClient)
        : harvestProjects,
    [harvestProjects, selectedClient]
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/harvest/projects")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || data.error) return;
        const list = (data.projects ?? []).filter((p: HarvestProjectOption) => p.is_active);
        list.sort((a: HarvestProjectOption, b: HarvestProjectOption) => {
          const ca = (a.client?.name ?? "").localeCompare(b.client?.name ?? "");
          if (ca !== 0) return ca;
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        });
        setHarvestProjects(list);
        // Drop stale inactive IDs that are no longer in the picker so Save
        // doesn't keep them in harvest_project_ids / budget totals.
        const available = new Set(list.map((p: HarvestProjectOption) => p.id));
        setSelectedIds((prev) => {
          const next = new Set(Array.from(prev).filter((id) => available.has(id)));
          return next.size === prev.size ? prev : next;
        });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (harvestProjects.length === 0 || harvestProjectIds.length === 0) return;
    const firstLinked = harvestProjects.find((p) => harvestProjectIds.includes(p.id));
    if (firstLinked?.client?.name) setSelectedClient(firstLinked.client.name);
  }, [harvestProjects, harvestProjectIds]);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const title = titleDraft.trim();
      const availableIds = new Set(harvestProjects.map((p) => p.id));
      const idsToSave = Array.from(selectedIds).filter((id) => availableIds.has(id));
      const res = await fetch(`/api/resource-planning/projects/${encodeURIComponent(projectName)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_title: title === projectName ? null : title || null,
          harvest_project_ids: idsToSave,
          harvest_project_names: harvestProjects.filter((p) => idsToSave.includes(p.id)).map((p) => p.name),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function toggleHarvestProject(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-neutral-200 bg-white p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-neutral-900">Edit project</h3>
        <p className="mt-0.5 text-xs text-neutral-500">
          Update the display name and link Harvest projects when ready. Leave Harvest unlinked for draft or future work.
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-3">
          <label className="block text-xs font-medium text-neutral-600">Display name</label>
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            placeholder="e.g. Q1 Support"
            autoFocus
            className="mt-0.5 w-full rounded border border-neutral-300 px-2.5 py-1.5 text-sm"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Internal key: <span className="font-mono text-neutral-600">{projectName}</span>
          </p>
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium text-neutral-600">Client</label>
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="mt-0.5 w-full rounded border border-neutral-300 px-2.5 py-1.5 text-sm"
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="mt-3">
          <label className="block text-xs font-medium text-neutral-600">Harvest projects linked</label>
          <p className="mt-0.5 text-xs text-neutral-500">Select one or more Harvest projects to associate with this project.</p>
          {loading ? (
            <p className="mt-1 text-sm text-neutral-500">Loading…</p>
          ) : (
            <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-neutral-200 divide-y divide-neutral-100">
              {projectsFiltered.map((p) => {
                const checked = selectedIds.has(p.id);
                return (
                  <li key={p.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-neutral-50">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleHarvestProject(p.id)}
                      className="rounded border-neutral-300"
                      aria-label={`Link ${p.name}`}
                    />
                    <span className="flex-1 min-w-0 truncate text-sm text-neutral-900">
                      {p.client?.name && <span className="text-neutral-600">{p.client.name}</span>}
                      {p.client?.name && <span className="text-neutral-400"> · </span>}
                      {p.name}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
