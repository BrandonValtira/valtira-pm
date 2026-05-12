"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Item = { projectName: string; label: string; nextRunLabel: string; sortKey: string; projectId: string };

export function OutgoingReportsList() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/outgoing-reports")
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items ?? []);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-medium text-neutral-900">Outgoing reports</h2>
        <p className="mt-1 text-sm text-neutral-600">Scheduled report automations.</p>
        <p className="mt-4 text-sm text-neutral-500">Loading…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-medium text-neutral-900">Outgoing reports</h2>
        <p className="mt-1 text-sm text-neutral-600">Scheduled report automations.</p>
        <p className="mt-4 text-sm text-neutral-500">No scheduled reports.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="text-lg font-medium text-neutral-900">Outgoing reports</h2>
      <p className="mt-1 text-sm text-neutral-600">Next scheduled report runs.</p>
      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li key={`${item.projectId}-${item.sortKey}`}>
            <Link
              href={`/dashboard/project/${item.projectId}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-neutral-100 px-3 py-2 text-sm hover:bg-neutral-50"
            >
              <span className="font-medium text-neutral-900">
                {item.projectName} — {item.label}
              </span>
              <span className="shrink-0 text-neutral-600">{item.nextRunLabel}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
