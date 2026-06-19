"use client";

import type { ResourcePlanningBudgetSummary } from "@/lib/fetch-resource-planning-budget";

type Props = {
  summary: ResourcePlanningBudgetSummary | null | undefined;
  compact?: boolean;
  /** True while budget data is still loading for this project. */
  loading?: boolean;
};

function CompactBudgetSkeleton() {
  return (
    <div
      className="hidden sm:flex w-[9.5rem] shrink-0 items-center gap-2"
      aria-hidden
    >
      <div className="h-1.5 w-16 shrink-0 animate-pulse rounded-full bg-neutral-200" />
      <div className="h-3 w-14 animate-pulse rounded bg-neutral-200" />
    </div>
  );
}

function CardBudgetSkeleton() {
  return (
    <div
      className="box-border flex h-[3.25rem] w-[6.5rem] shrink-0 flex-col rounded-md border border-neutral-200 bg-white px-2 py-1"
      aria-hidden
    >
      <div className="h-2.5 w-10 animate-pulse rounded bg-neutral-200" />
      <div className="mt-1 h-3.5 w-full animate-pulse rounded bg-neutral-200" />
      <div className="mt-auto h-1.5 w-full animate-pulse rounded-full bg-neutral-200" />
    </div>
  );
}

export function MiniBudgetIndicator({ summary, compact, loading }: Props) {
  if (loading) {
    return compact ? <CompactBudgetSkeleton /> : <CardBudgetSkeleton />;
  }

  if (!summary?.hasBudget || summary.totalBudgetHours <= 0) {
    return null;
  }

  const pct = Math.min(100, Math.round((summary.spentToDate / summary.totalBudgetHours) * 100));
  const over = summary.spentToDate > summary.totalBudgetHours;
  const barColor = over ? "bg-red-500" : pct >= 90 ? "bg-amber-500" : "bg-green-600";

  if (compact) {
    return (
      <div
        className="hidden sm:flex w-[9.5rem] shrink-0 items-center gap-2"
        title={`${summary.spentToDate.toFixed(0)}h of ${summary.totalBudgetHours.toFixed(0)}h budget used`}
      >
        <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-neutral-200">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <span className={`text-xs font-semibold tabular-nums whitespace-nowrap ${over ? "text-red-700" : "text-neutral-600"}`}>
          {summary.spentToDate.toFixed(0)}/{summary.totalBudgetHours.toFixed(0)}h
        </span>
      </div>
    );
  }

  return (
    <div
      className="box-border flex h-[3.25rem] w-[6.5rem] shrink-0 flex-col rounded-md border border-neutral-200 bg-white px-2 py-1"
      title={`${summary.spentToDate.toFixed(0)}h of ${summary.totalBudgetHours.toFixed(0)}h budget used`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">Budget</p>
      <p className="truncate text-xs tabular-nums text-neutral-900">
        <span className="font-semibold">{summary.spentToDate.toFixed(0)}h</span>
        <span className="text-neutral-500"> / {summary.totalBudgetHours.toFixed(0)}h</span>
      </p>
      <div className="mt-auto h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
