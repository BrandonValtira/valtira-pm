"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Allocation = {
  resource_name: string;
  week_start: string;
  fte: number;
};

function getWeekStart(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}

function addWeeks(weekStart: string, n: number): string {
  const d = new Date(weekStart + "T12:00:00Z");
  d.setDate(d.getDate() + 7 * n);
  return d.toISOString().slice(0, 10);
}

const ROW_KEY_SEP = "\u0001";
const MAX_ITEMS = 10;
const PLACEHOLDER_RESOURCE = "(No resources yet)";

/** Least Utilized and Coming Free cards for dashboard; one fetch, next 4 weeks. */
export function DashboardUtilizationWidgets() {
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date();
    const weekStart = getWeekStart(today);
    const weekEnd = addWeeks(weekStart, 3); // 4 weeks total (0..3)
    fetch(`/api/resource-planning/allocations?weekStart=${weekStart}&weekEnd=${weekEnd}`)
      .then((r) => r.json())
      .then((data) => setAllocations(data.allocations ?? []))
      .catch(() => setAllocations([]))
      .finally(() => setLoading(false));
  }, []);

  const next4WeekStarts = (() => {
    const today = new Date();
    const start = getWeekStart(today);
    return Array.from({ length: 4 }, (_, i) => addWeeks(start, i));
  })();

  const utilizationByResourceWeek = new Map<string, number>();
  allocations.forEach((a) => {
    const k = `${a.resource_name}${ROW_KEY_SEP}${a.week_start}`;
    utilizationByResourceWeek.set(k, (utilizationByResourceWeek.get(k) ?? 0) + Number(a.fte));
  });

  const uniqueResourceNames = Array.from(
    new Set(allocations.map((a) => a.resource_name).filter((name) => name !== PLACEHOLDER_RESOURCE))
  );

  const resourceMetrics = new Map<string, { avgUtil: number; comingFreeDelta: number }>();
  uniqueResourceNames.forEach((name) => {
    const utilByWeek = next4WeekStarts.map(
      (w) => utilizationByResourceWeek.get(`${name}${ROW_KEY_SEP}${w}`) ?? 0
    );
    const avgUtil = utilByWeek.reduce((a, b) => a + b, 0) / 4;
    const avgFirst2 = (utilByWeek[0] + utilByWeek[1]) / 2;
    const avgLast2 = (utilByWeek[2] + utilByWeek[3]) / 2;
    resourceMetrics.set(name, {
      avgUtil,
      comingFreeDelta: avgFirst2 - avgLast2,
    });
  });

  const leastUtilized = [...uniqueResourceNames]
    .sort(
      (a, b) =>
        (resourceMetrics.get(a)?.avgUtil ?? 0) - (resourceMetrics.get(b)?.avgUtil ?? 0) ||
        a.localeCompare(b)
    )
    .slice(0, MAX_ITEMS);

  const comingFree = [...uniqueResourceNames]
    .filter((name) => (resourceMetrics.get(name)?.comingFreeDelta ?? 0) > 0)
    .sort(
      (a, b) =>
        (resourceMetrics.get(b)?.comingFreeDelta ?? 0) -
          (resourceMetrics.get(a)?.comingFreeDelta ?? 0) || a.localeCompare(b)
    )
    .slice(0, MAX_ITEMS);

  if (loading) {
    return (
      <>
        <div className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-neutral-900">Least Utilized Resources</h2>
          <p className="mt-1 text-sm text-neutral-600">Next 4 weeks.</p>
          <p className="mt-4 text-sm text-neutral-500">Loading…</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-medium text-neutral-900">Coming Free</h2>
          <p className="mt-1 text-sm text-neutral-600">Lower utilization in the next month.</p>
          <p className="mt-4 text-sm text-neutral-500">Loading…</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-medium text-neutral-900">Least Utilized Resources</h2>
        <p className="mt-1 text-sm text-neutral-600">Next 4 weeks.</p>
        {leastUtilized.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">No resources with allocations.</p>
        ) : (
          <ul className="mt-4 max-h-[224px] space-y-2 overflow-y-auto">
            {leastUtilized.map((name) => {
              const avg = resourceMetrics.get(name)?.avgUtil ?? 0;
              const pct = Math.round(avg * 100);
              return (
                <li key={name}>
                  <Link
                    href="/dashboard/resource-planning"
                    className="flex items-center justify-between gap-2 rounded-lg border border-neutral-100 px-3 py-2 text-sm hover:bg-neutral-50"
                  >
                    <span className="font-medium text-neutral-900">{name}</span>
                    <span className="shrink-0 text-neutral-600">{pct}%</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Link
          href="/dashboard/resource-planning"
          className="mt-3 inline-block text-sm font-medium text-neutral-700 hover:text-neutral-900"
        >
          View all →
        </Link>
      </div>
      <div className="rounded-xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-medium text-neutral-900">Coming Free</h2>
        <p className="mt-1 text-sm text-neutral-600">Lower utilization in the next month.</p>
        {comingFree.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">No resources with decreasing utilization.</p>
        ) : (
          <ul className="mt-4 max-h-[224px] space-y-2 overflow-y-auto">
            {comingFree.map((name) => {
              const delta = resourceMetrics.get(name)?.comingFreeDelta ?? 0;
              const pct = Math.round(delta * 100);
              return (
                <li key={name}>
                  <Link
                    href="/dashboard/resource-planning"
                    className="flex items-center justify-between gap-2 rounded-lg border border-neutral-100 px-3 py-2 text-sm hover:bg-neutral-50"
                  >
                    <span className="font-medium text-neutral-900">{name}</span>
                    <span className="shrink-0 text-neutral-600">−{pct}%</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Link
          href="/dashboard/resource-planning"
          className="mt-3 inline-block text-sm font-medium text-neutral-700 hover:text-neutral-900"
        >
          View all →
        </Link>
      </div>
    </>
  );
}
