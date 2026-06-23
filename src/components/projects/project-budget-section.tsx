"use client";

import { useCallback, useEffect, useState } from "react";
import { BudgetBurnLineChart } from "@/app/dashboard/project/[id]/budget-burn-chart";
import type { BudgetBurnSnapshot } from "@/lib/budget-burn-chart";
import type { ResourcePlanningBudgetSummary } from "@/lib/fetch-resource-planning-budget";

type BudgetDetail = {
  summary: ResourcePlanningBudgetSummary;
  budgetBurn: BudgetBurnSnapshot | null;
};

function BudgetSectionSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading budget">
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            <div className="h-3 w-20 animate-pulse rounded bg-neutral-200" />
            <div className="mt-3 h-8 w-24 animate-pulse rounded bg-neutral-200" />
            {i === 1 ? <div className="mt-2 h-4 w-28 animate-pulse rounded bg-neutral-200" /> : null}
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="h-4 w-40 animate-pulse rounded bg-neutral-200" />
        <div className="mt-2 h-3 w-72 max-w-full animate-pulse rounded bg-neutral-200" />
        <div className="mt-4 h-[200px] w-full animate-pulse rounded-md bg-neutral-100" />
        <div className="mt-2 flex flex-wrap gap-4">
          <div className="h-3 w-36 animate-pulse rounded bg-neutral-200" />
          <div className="h-3 w-40 animate-pulse rounded bg-neutral-200" />
          <div className="h-3 w-44 animate-pulse rounded bg-neutral-200" />
        </div>
      </div>
    </div>
  );
}

export function ProjectBudgetSection({ projectName }: { projectName: string }) {
  const [detail, setDetail] = useState<BudgetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/resource-planning/projects/${encodeURIComponent(projectName)}/budget`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load budget");
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load budget");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [projectName]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <section className="mb-8 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-medium text-neutral-900">Budget</h2>
        <div className="mt-4">
          <BudgetSectionSkeleton />
        </div>
      </section>
    );
  }
  if (error) {
    return (
      <section className="mb-8 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-medium text-neutral-900">Budget</h2>
        <div className="mt-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {error}
          </div>
        </div>
      </section>
    );
  }
  if (detail?.summary.budgetTracking === "cost") {
    return null;
  }
  if (!detail?.summary.hasBudget) {
    return (
      <section className="mb-8 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-medium text-neutral-900">Budget</h2>
        <div className="mt-4">
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
            No hour budget set in Harvest for linked projects. Link Harvest projects and set a budget in Harvest to see burn tracking.
          </div>
        </div>
      </section>
    );
  }

  const { summary, budgetBurn } = detail;
  const pct =
    summary.totalBudgetHours > 0
      ? Math.round((summary.spentToDate / summary.totalBudgetHours) * 100)
      : 0;
  const over = summary.spentToDate > summary.totalBudgetHours;

  return (
    <section className="mb-8 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-medium text-neutral-900">Budget</h2>
      <div className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Total budget</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900 tabular-nums">
            {summary.totalBudgetHours.toFixed(1)}h
          </p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Consumed to date</p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900 tabular-nums">
            {summary.spentToDate.toFixed(1)}h
          </p>
          <p className={`mt-0.5 text-sm ${over ? "text-red-700" : "text-green-700"}`}>
            {pct}% of total budget
          </p>
        </div>
      </div>

      {budgetBurn && budgetBurn.points.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-neutral-900">Budget burn over time</h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            Cumulative hours consumed vs. target pace through the contract period.
          </p>
          <div className="mt-4">
            <BudgetBurnLineChart
              points={budgetBurn.points}
              totalBudgetHours={budgetBurn.totalBudgetHours}
              contractStart={budgetBurn.contractStart}
              contractEnd={budgetBurn.contractEnd}
            />
          </div>
        </div>
      )}
      </div>
    </section>
  );
}
