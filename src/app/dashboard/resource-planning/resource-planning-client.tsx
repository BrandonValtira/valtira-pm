"use client";

import Link from "next/link";
import { displayFirstName } from "@/lib/vacation-name-match";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const VACATION_EMOJI = "🌴";

function AllocationWithVacation({
  children,
  onVacation,
  vacationTitle,
}: {
  children: ReactNode;
  onVacation: boolean;
  vacationTitle?: string;
}) {
  if (!onVacation) return <>{children}</>;
  return (
    <span className="inline-flex items-center justify-center gap-0.5">
      <span>{children}</span>
      <span
        className="text-[10px] leading-none"
        title={vacationTitle}
        aria-label={vacationTitle ?? "Vacation planned"}
      >
        {VACATION_EMOJI}
      </span>
    </span>
  );
}

type Allocation = {
  id: string;
  resource_name: string;
  role: string;
  project_name: string;
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

function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart + "T12:00:00Z");
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const m1 = d.toLocaleDateString("en-US", { month: "short" });
  const m2 = end.toLocaleDateString("en-US", { month: "short" });
  const day1 = d.getDate();
  const day2 = end.getDate();
  if (m1 === m2) return `${m1} ${day1}-${day2}`;
  return `${m1} ${day1} – ${m2} ${day2}`;
}

/** Short label for table header (mobile): e.g. "2/22" */
function formatWeekLabelShort(weekStart: string): string {
  const d = new Date(weekStart + "T12:00:00Z");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}/${day}`;
}

/** Range label for table header (desktop, max 9 chars): e.g. "2/22-28" or "12/22-28" */
function formatWeekLabelRange(weekStart: string): string {
  const d = new Date(weekStart + "T12:00:00Z");
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const mStart = d.getMonth() + 1;
  const dayStart = d.getDate();
  const mEnd = end.getMonth() + 1;
  const dayEnd = end.getDate();
  if (mStart === mEnd) return `${mStart}/${dayStart}-${dayEnd}`;
  return `${mStart}/${dayStart}-${mEnd}/${dayEnd}`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

const WEEKS_VIEW = 52;
const ROW_KEY_SEP = "\u0001";
const FULL_PCT = 0.8;
const PARTIAL_PCT = 0.4;
const OVER_PCT = 1;
const HOURS_PER_FULL_FTE = 40;

type DisplayUnit = "percent" | "hours";

function formatAllocationDisplay(fte: number, unit: DisplayUnit): string {
  if (!(fte > 0)) return "—";
  if (unit === "hours") {
    const hours = fte * HOURS_PER_FULL_FTE;
    return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  }
  const pct = fte * 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(pct % 1 === 0 ? 0 : 1)}%`;
}

function fteFromDisplayInput(raw: string, unit: DisplayUnit): number {
  const n = parseFloat(raw) || 0;
  if (unit === "hours") return Math.min(1, Math.max(0, n / HOURS_PER_FULL_FTE));
  const fte = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, fte));
}

function editValueFromFte(fte: number, unit: DisplayUnit): string {
  if (!(fte > 0)) return "";
  if (unit === "hours") {
    const hours = fte * HOURS_PER_FULL_FTE;
    return Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 10) / 10);
  }
  const pct = fte * 100;
  return Number.isInteger(pct) ? String(pct) : String(Math.round(pct * 10) / 10);
}

function DisplayUnitSelect({
  value,
  onChange,
}: {
  value: DisplayUnit;
  onChange: (unit: DisplayUnit) => void;
}) {
  return (
    <div className="relative shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as DisplayUnit)}
        aria-label="Display units"
        title="100% = 40 hours"
        className="appearance-none rounded-lg border border-neutral-300 bg-white pl-3 pr-8 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
      >
        <option value="hours">Hours</option>
        <option value="percent">Percentage</option>
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-neutral-500">
        <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4">
          <path
            d="M5.25 7.5L10 12.25L14.75 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}

/** Lowercase full names hidden from the Utilization tab (match Harvest "First Last"). */
const UTILIZATION_EXCLUDED_NAME_LOWER = new Set(["david bagley", "stacey roelofs"]);

function isUtilizationExcludedName(name: string): boolean {
  return UTILIZATION_EXCLUDED_NAME_LOWER.has(name.trim().toLowerCase());
}

type HarvestTeamLoadState =
  | { status: "loading" }
  | { status: "ok"; names: string[] }
  | { status: "error"; message: string };

export function ResourcePlanningClient() {
  const today = new Date();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- week range is fixed; setter reserved for future week picker
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today));
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [resources, setResources] = useState<string[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [projectMeta, setProjectMeta] = useState<Record<string, { display_title: string | null; harvest_project_ids: number[]; harvest_project_names: string[] }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- setter used for tooltip; value reserved for hover styling
  const [hoverCell, setHoverCell] = useState<{ rowKey: string; weekStart: string } | null>(null);
  const [tooltipState, setTooltipState] = useState<{
    resource_name: string;
    total: number;
    listForWeek: Allocation[];
    left: number;
    top: number;
    vacationPlanned?: boolean;
  } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForProject, setAddForProject] = useState<string | null>(null);
  const [showAddProject, setShowAddProject] = useState(false);
  const [addedProjectName, setAddedProjectName] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<
    { id: string; inputValue: string } | { new: true; rowKey: string; weekStart: string; inputValue: string }
  | null>(null);
  const [toast, setToast] = useState<"saved" | null>(null);
  const [openProjectMenu, setOpenProjectMenu] = useState<string | null>(null);
  const [openRowMenu, setOpenRowMenu] = useState<string | null>(null);
  const [rowMenuAnchor, setRowMenuAnchor] = useState<{ left: number; top: number } | null>(null);
  const [rowMenuContext, setRowMenuContext] = useState<{
    projectName: string;
    resource_name: string;
    role: string;
  } | null>(null);
  const [dismissedProjectAlerts, setDismissedProjectAlerts] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("resource-planning-dismissed-alerts");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"calendar" | "individual">("calendar");
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>(() => {
    if (typeof window === "undefined") return "percent";
    try {
      return localStorage.getItem("valtira-rp-display-unit") === "hours" ? "hours" : "percent";
    } catch {
      return "percent";
    }
  });
  const [expandedIndividualResource, setExpandedIndividualResource] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [utilizationFilter, setUtilizationFilter] = useState<"all" | "least" | "most" | "coming-free">("all");
  const [harvestProjectIdToName, setHarvestProjectIdToName] = useState<Record<number, string>>({});
  const [editProjectName, setEditProjectName] = useState<string | null>(null);
  const [editProjectTitleDraft, setEditProjectTitleDraft] = useState("");
  const [addProjectDisplayNameDraft, setAddProjectDisplayNameDraft] = useState("");
  /** Harvest directory for Utilization tab; errors must not fall back to allocation-only names. */
  const [harvestTeamLoad, setHarvestTeamLoad] = useState<HarvestTeamLoadState>({ status: "loading" });
  /** resource_name → week_start (Sunday) with vacation from Google calendar */
  const [vacationWeeksByResource, setVacationWeeksByResource] = useState<Record<string, string[]>>({});
  const [vacationNotice, setVacationNotice] = useState<string | null>(null);

  const weekEnd = addWeeks(weekStart, WEEKS_VIEW - 1);
  const oneMonthFromNow = addWeeks(getWeekStart(today), 4);
  const weekEndForFetch = weekEnd >= oneMonthFromNow ? weekEnd : oneMonthFromNow;
  const weekStarts = Array.from({ length: WEEKS_VIEW }, (_, i) => addWeeks(weekStart, i));

  const fetchAllocations = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const res = await fetch(
        `/api/resource-planning/allocations?weekStart=${weekStart}&weekEnd=${weekEndForFetch}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setAllocations(data.allocations ?? []);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load");
      if (!silent) setAllocations([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [weekStart, weekEndForFetch]);

  const fetchMeta = useCallback(async () => {
    try {
      const [rRes, pRes] = await Promise.all([
        fetch("/api/resource-planning/resources"),
        fetch("/api/resource-planning/projects"),
      ]);
      const rData = await rRes.json().catch(() => ({}));
      const pData = await pRes.json().catch(() => ({}));
      if (rRes.ok) setResources(rData.resources ?? []);
      if (pRes.ok) {
        setProjects(pData.projects ?? []);
        setProjectMeta(
          Object.fromEntries(
            (Object.entries(pData.projectMeta ?? {}) as [string, { display_title?: string | null; harvest_project_ids?: number[]; harvest_project_names?: string[] }][]).map(([k, v]) => [
              k,
              {
                display_title: v.display_title ?? null,
                harvest_project_ids: Array.isArray(v.harvest_project_ids) ? v.harvest_project_ids : [],
                harvest_project_names: Array.isArray(v.harvest_project_names) ? v.harvest_project_names : [],
              },
            ])
          )
        );
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchAllocations();
  }, [fetchAllocations]);

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  const fetchVacation = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/resource-planning/vacation?weekStart=${encodeURIComponent(weekStart)}&weekEnd=${encodeURIComponent(weekEndForFetch)}`
      );
      const data = await res.json().catch(() => ({}));
      if (data.weeksByResource && typeof data.weeksByResource === "object") {
        setVacationWeeksByResource(data.weeksByResource as Record<string, string[]>);
      }
      if (typeof data.message === "string" && data.message.trim()) {
        const needsAttention =
          data.configured === false ||
          data.connected === false ||
          data.needsReconnect === true ||
          data.calendarApiDisabled === true ||
          !res.ok;
        setVacationNotice(needsAttention ? data.message.trim() : null);
      } else if (res.ok) {
        setVacationNotice(null);
      }
    } catch {
      setVacationNotice("Could not load vacation calendar. Check your connection and try again.");
    }
  }, [weekStart, weekEndForFetch]);

  useEffect(() => {
    fetchVacation();
  }, [fetchVacation]);

  const vacationWeekSetByResource = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const [name, weeks] of Object.entries(vacationWeeksByResource)) {
      map.set(name, new Set(weeks));
    }
    return map;
  }, [vacationWeeksByResource]);

  const hasVacationWeek = useCallback(
    (resourceName: string, week: string) => vacationWeekSetByResource.get(resourceName)?.has(week) ?? false,
    [vacationWeekSetByResource]
  );

  const vacationTooltipMessage = useCallback(
    (resourceName: string) =>
      `${displayFirstName(resourceName)} has time off this week (vacation calendar). Review their allocations.`,
    []
  );

  useEffect(() => {
    try {
      localStorage.setItem("valtira-rp-display-unit", displayUnit);
    } catch {
      // ignore
    }
  }, [displayUnit]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/harvest/projects")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || data.error) return;
        const idToName: Record<number, string> = {};
        (data.projects ?? []).forEach((p: { id: number; name: string }) => {
          idToName[p.id] = p.name;
        });
        setHarvestProjectIdToName(idToName);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/integrations/harvest/users");
        const data: { users?: { name?: string }[]; error?: string } = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          const fromBody =
            typeof data.error === "string" && data.error.trim() ? data.error.trim() : "";
          const message =
            fromBody ||
            (res.status === 401
              ? "You need to be signed in to load Harvest."
              : "Could not load your Harvest team.");
          setHarvestTeamLoad({ status: "error", message });
          return;
        }
        if (data.error) {
          setHarvestTeamLoad({
            status: "error",
            message:
              typeof data.error === "string" && data.error.trim()
                ? data.error.trim()
                : "Could not load your Harvest team.",
          });
          return;
        }
        const names = (data.users ?? [])
          .map((u) => (typeof u.name === "string" ? u.name.trim() : ""))
          .filter(Boolean);
        setHarvestTeamLoad({ status: "ok", names });
      } catch {
        if (!cancelled) {
          setHarvestTeamLoad({
            status: "error",
            message: "Network error while loading Harvest. Check your connection and try again.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => fetchAllocations(true), 15000);
    return () => clearInterval(interval);
  }, [fetchAllocations]);

  useEffect(() => {
    if (dismissedProjectAlerts.size === 0) return;
    try {
      localStorage.setItem("resource-planning-dismissed-alerts", JSON.stringify(Array.from(dismissedProjectAlerts)));
    } catch {
      // ignore
    }
  }, [dismissedProjectAlerts]);

  useEffect(() => {
    if (!openProjectMenu) return;
    const close = (e: MouseEvent) => {
      const el = (e.target as Node) as Element;
      if (el.closest?.("[data-project-menu]") == null) setOpenProjectMenu(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openProjectMenu]);

  useEffect(() => {
    if (!openRowMenu) return;
    const close = (e: MouseEvent) => {
      const el = (e.target as Node) as Element;
      if (el.closest?.("[data-row-menu]") == null) {
        setOpenRowMenu(null);
        setRowMenuAnchor(null);
        setRowMenuContext(null);
      }
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openRowMenu]);

  useEffect(() => {
    if (toast !== "saved") return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const projectNames = Array.from(new Set(allocations.map((a) => a.project_name))).sort();
  const getDisplayTitle = (name: string) => projectMeta[name]?.display_title?.trim() || name;
  function getLinkedProjectsLabel(name: string): { label: string; tooltip?: string; unlinked?: boolean } {
    const ids = projectMeta[name]?.harvest_project_ids ?? [];
    const storedNames = projectMeta[name]?.harvest_project_names ?? [];
    if (ids.length === 0) return { label: "Not linked to Harvest", unlinked: true };
    const names = ids.map((id, i) => storedNames[i] ?? harvestProjectIdToName[id]).filter((n): n is string => Boolean(n));
    if (ids.length === 1) return { label: names[0] ?? "1 project linked" };
    const tooltipText = names.length > 0 ? names.map((n) => `• ${n}`).join("\n") : `${ids.length} projects linked`;
    return { label: `${ids.length} projects linked`, tooltip: tooltipText };
  }
  const q = projectSearchQuery.trim().toLowerCase();
  const filteredProjectNames = q
    ? projectNames.filter((name) => name.toLowerCase().includes(q))
    : projectNames;
  const searchSuggestions = q ? filteredProjectNames.slice(0, 8) : [];

  const byProject = new Map<string, { resource_name: string; role: string }[]>();
  allocations.forEach((a) => {
    const key = a.project_name;
    const existing = byProject.get(key) ?? [];
    const rowKey = `${a.resource_name}${ROW_KEY_SEP}${a.role}`;
    if (!existing.some((r) => `${r.resource_name}${ROW_KEY_SEP}${r.role}` === rowKey)) {
      existing.push({ resource_name: a.resource_name, role: a.role });
    }
    byProject.set(key, existing);
  });

  const projectAlertResourceNames = new Map<string, string[]>();
  const PLACEHOLDER_NO_RESOURCES = "(No resources yet)";
  projectNames.forEach((name) => {
    const rows = byProject.get(name) ?? [];
    const needReview: string[] = [];
    for (const { resource_name, role } of rows) {
      if (resource_name === PLACEHOLDER_NO_RESOURCES) continue;
      const hasAllocationOneMonthOut = allocations.some(
        (a) =>
          a.project_name === name &&
          a.resource_name === resource_name &&
          a.role === role &&
          a.week_start >= oneMonthFromNow &&
          Number(a.fte) > 0
      );
      if (!hasAllocationOneMonthOut && !needReview.includes(resource_name)) needReview.push(resource_name);
    }
    if (needReview.length > 0) projectAlertResourceNames.set(name, needReview);
  });

  useEffect(() => {
    if (!addedProjectName || !projectNames.includes(addedProjectName)) return;
    const el = document.querySelector(`[data-project-name="${CSS.escape(addedProjectName)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setAddedProjectName(null);
  }, [addedProjectName, projectNames]);

  function formatProjectAlertMessage(names: string[]): string {
    if (names.length === 0) return "";
    if (names.length === 1) return `${names[0]}'s allocation needs review.`;
    if (names.length === 2) return `${names[0]}'s and ${names[1]}'s allocations need review.`;
    if (names.length > 5) return `${names[0]} and ${names.length - 1} others' allocations need review.`;
    return `${names.slice(0, -1).map((n) => `${n}'s`).join(", ")} and ${names[names.length - 1]}'s allocations need review.`;
  }

  const allocationByKeyWeek = new Map<string, Allocation>();
  allocations.forEach((a) => {
    const rowKey = `${a.project_name}${ROW_KEY_SEP}${a.resource_name}${ROW_KEY_SEP}${a.role}`;
    allocationByKeyWeek.set(`${rowKey}${ROW_KEY_SEP}${a.week_start}`, a);
  });

  const utilizationByResourceWeek = new Map<string, number>();
  allocations.forEach((a) => {
    const k = `${a.resource_name}${ROW_KEY_SEP}${a.week_start}`;
    utilizationByResourceWeek.set(k, (utilizationByResourceWeek.get(k) ?? 0) + Number(a.fte));
  });

  const uniqueResourceNames = Array.from(
    new Set(allocations.map((a) => a.resource_name).filter((n) => n !== PLACEHOLDER_NO_RESOURCES))
  ).sort();

  /** Utilization tab: all active Harvest people (minus exclusions) plus allocation-only names only when Harvest directory loaded successfully. */
  const utilizationResourceNames = (() => {
    if (harvestTeamLoad.status !== "ok") {
      return [];
    }
    const set = new Set<string>();
    for (const n of harvestTeamLoad.names) {
      if (!isUtilizationExcludedName(n)) set.add(n);
    }
    for (const n of uniqueResourceNames) {
      if (!isUtilizationExcludedName(n)) set.add(n);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  })();

  const allocationsByResourceProject = new Map<string, { project_name: string; weekFte: Map<string, number> }[]>();
  utilizationResourceNames.forEach((resource_name) => {
    const byProject = new Map<string, Map<string, number>>();
    allocations
      .filter((a) => a.resource_name === resource_name)
      .forEach((a) => {
        let weekFte = byProject.get(a.project_name);
        if (!weekFte) {
          weekFte = new Map();
          byProject.set(a.project_name, weekFte);
        }
        const prev = weekFte.get(a.week_start) ?? 0;
        weekFte.set(a.week_start, prev + Number(a.fte));
      });
    allocationsByResourceProject.set(
      resource_name,
      Array.from(byProject.entries()).map(([project_name, weekFte]) => ({ project_name, weekFte }))
    );
  });

  /** Next 4 weeks (from current week) for utilization filter. */
  const next4WeekStarts = weekStarts.slice(0, 4);

  /** Per-resource metrics over next 4 weeks: avg utilization, and "coming free" = avg(weeks 1–2) − avg(weeks 3–4). */
  const resourceMetricsNext4 = new Map<
    string,
    { avgUtil: number; comingFreeDelta: number }
  >();
  utilizationResourceNames.forEach((name) => {
    const utilByWeek = next4WeekStarts.map(
      (w) => utilizationByResourceWeek.get(`${name}${ROW_KEY_SEP}${w}`) ?? 0
    );
    const avgUtil = utilByWeek.reduce((a, b) => a + b, 0) / 4;
    const avgFirst2 = (utilByWeek[0] + utilByWeek[1]) / 2;
    const avgLast2 = (utilByWeek[2] + utilByWeek[3]) / 2;
    resourceMetricsNext4.set(name, {
      avgUtil,
      comingFreeDelta: avgFirst2 - avgLast2,
    });
  });

  const sortedFilteredResources = (() => {
    const list = [...utilizationResourceNames];
    if (utilizationFilter === "all") return list;
    if (utilizationFilter === "least") {
      return list.sort(
        (a, b) =>
          (resourceMetricsNext4.get(a)?.avgUtil ?? 0) -
            (resourceMetricsNext4.get(b)?.avgUtil ?? 0) ||
          a.localeCompare(b)
      );
    }
    if (utilizationFilter === "most") {
      return list.sort(
        (a, b) =>
          (resourceMetricsNext4.get(b)?.avgUtil ?? 0) -
            (resourceMetricsNext4.get(a)?.avgUtil ?? 0) ||
          a.localeCompare(b)
      );
    }
    if (utilizationFilter === "coming-free") {
      return list
        .filter((name) => (resourceMetricsNext4.get(name)?.comingFreeDelta ?? 0) > 0)
        .sort(
          (a, b) =>
            (resourceMetricsNext4.get(b)?.comingFreeDelta ?? 0) -
              (resourceMetricsNext4.get(a)?.comingFreeDelta ?? 0) ||
            a.localeCompare(b)
        );
    }
    return list;
  })();

  function getUtilizationColor(resourceName: string, w: string): string {
    const sum = utilizationByResourceWeek.get(`${resourceName}${ROW_KEY_SEP}${w}`) ?? 0;
    const base = "resource-planning-util-cell ";
    if (sum > OVER_PCT) return base + "bg-red-100 border-red-300";
    if (sum >= FULL_PCT) return base + "bg-green-100 border-green-300";
    if (sum >= PARTIAL_PCT) return base + "bg-amber-100 border-amber-300";
    if (sum > 0) return base + "bg-orange-100 border-orange-300";
    return base + "bg-red-50 border-red-200";
  }

  /** Bright dot color for tooltip status (over / full / partial / low / none). */
  function getStatusDotColor(utilizationSum: number): string {
    if (utilizationSum > OVER_PCT) return "bg-red-400";
    if (utilizationSum >= FULL_PCT) return "bg-green-500";
    if (utilizationSum >= PARTIAL_PCT) return "bg-amber-400";
    if (utilizationSum > 0) return "bg-orange-500";
    return "bg-red-500";
  }

  const DEBOUNCE_MS = 1200;
  type PendingOp =
    | { type: "patch"; id: string; fte: number }
    | { type: "post"; projectName: string; resource_name: string; role: string; weekStart: string; fte: number };
  const pendingRef = useRef<Map<string, PendingOp>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setAllocationsRef = useRef(setAllocations);
  setAllocationsRef.current = setAllocations;

  function showSavedToast() {
    setToast("saved");
  }

  const flushPending = useCallback(async () => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const pending = new Map(pendingRef.current);
    pendingRef.current.clear();
    if (pending.size === 0) return;
    const ops = Array.from(pending.entries());
    const results = await Promise.allSettled(
      ops.map(async ([key, op]) => {
        if (op.type === "patch") {
          const res = await fetch(`/api/resource-planning/allocations/${op.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fte: op.fte }),
          });
          if (!res.ok) throw new Error("Patch failed");
          return { type: "patch" as const, id: op.id, data: await res.json() };
        } else {
          const res = await fetch("/api/resource-planning/allocations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              resourceName: op.resource_name,
              role: op.role,
              projectName: op.projectName,
              weekStart: op.weekStart,
              fte: Math.min(1, Math.max(0, op.fte)),
            }),
          });
          if (!res.ok) throw new Error("Post failed");
          return { type: "post" as const, key, data: await res.json(), op };
        }
      })
    );
    const setAlloc = setAllocationsRef.current;
    setAlloc((prev) => {
      let next = prev.filter((a) => !String(a.id).startsWith("pending-"));
      results.forEach((r) => {
        if (r.status !== "fulfilled") return;
        const v = r.value;
        if (v.type === "patch") {
          next = next.map((a) => (a.id === v.id ? { ...a, fte: v.data.fte } : a));
        } else if (v.type === "post" && v.data?.id != null) {
          const a: Allocation = {
            id: v.data.id,
            resource_name: v.data.resource_name ?? v.op.resource_name,
            role: v.data.role ?? v.op.role,
            project_name: v.data.project_name ?? v.op.projectName,
            week_start: v.data.week_start ?? v.op.weekStart,
            fte: v.data.fte ?? v.op.fte,
          };
          next = [...next, a];
        }
      });
      return next;
    });
    showSavedToast();
  }, []);

  function scheduleFlush() {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flushPending, DEBOUNCE_MS);
  }

  function saveCell(
    payload:
      | { id: string; fte: number }
      | { new: true; projectName: string; resource_name: string; role: string; weekStart: string; fte: number }
  ) {
    if ("id" in payload) {
      pendingRef.current.set(payload.id, { type: "patch", id: payload.id, fte: payload.fte });
      setAllocations((prev) =>
        prev.map((a) => (a.id === payload.id ? { ...a, fte: payload.fte } : a))
      );
    } else {
      const key = `${payload.projectName}\u0001${payload.resource_name}\u0001${payload.role}\u0001${payload.weekStart}`;
      pendingRef.current.set(key, {
        type: "post",
        projectName: payload.projectName,
        resource_name: payload.resource_name,
        role: payload.role,
        weekStart: payload.weekStart,
        fte: payload.fte,
      });
      const optimistic: Allocation = {
        id: `pending-${key}`,
        resource_name: payload.resource_name,
        role: payload.role,
        project_name: payload.projectName,
        week_start: payload.weekStart,
        fte: payload.fte,
      };
      setAllocations((prev) => [...prev, optimistic]);
    }
    setEditingCell(null);
    scheduleFlush();
  }

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (pendingRef.current.size > 0) flushPending();
    };
  }, [flushPending]);

  const allocationsForResourceWeek = (resourceName: string, w: string) =>
    allocations.filter((a) => a.resource_name === resourceName && a.week_start === w);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2 pb-3 flex-wrap">
        <div role="group" aria-label="View mode" className="shrink-0">
          <div className="inline-flex rounded-full border border-neutral-300 bg-white text-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={`rounded-l-full px-4 py-2 font-medium transition-colors ${viewMode === "calendar" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
            >
              Calendar
            </button>
            <button
              type="button"
              onClick={() => setViewMode("individual")}
              className={`rounded-r-full px-4 py-2 font-medium transition-colors ${viewMode === "individual" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}
            >
              Utilization
            </button>
          </div>
        </div>
        {viewMode === "individual" && (
          <div className="flex items-center gap-2 shrink-0">
          <div role="group" aria-label="Filter by utilization" className="relative shrink-0">
            <select
              value={utilizationFilter}
              onChange={(e) => setUtilizationFilter(e.target.value as "all" | "least" | "most" | "coming-free")}
              className="appearance-none rounded-lg border border-neutral-300 bg-white pl-3 pr-8 py-2 text-sm text-neutral-900 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
            >
              <option value="all">All resources</option>
              <option value="least">Least utilized</option>
              <option value="most">Most utilized</option>
              <option value="coming-free">Coming free</option>
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-neutral-500">
              <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4">
                <path
                  d="M5.25 7.5L10 12.25L14.75 7.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>
            <DisplayUnitSelect value={displayUnit} onChange={setDisplayUnit} />
          </div>
        )}
        {viewMode === "calendar" && (
          <>
            <div className="flex-1 flex justify-center items-center gap-2 min-w-0">
              <div className="relative w-full max-w-[268px] md:max-w-[350px]">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden>
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={projectSearchQuery}
                  onChange={(e) => setProjectSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                  placeholder="Search projects…"
                  className="w-full rounded-full border border-neutral-300 bg-white pl-9 pr-8 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                  aria-label="Search projects"
                  aria-autocomplete="list"
                  aria-expanded={searchFocused && searchSuggestions.length > 0}
                />
                {projectSearchQuery.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setProjectSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                    aria-label="Clear search"
                  >
                    <span className="text-base leading-none" aria-hidden>×</span>
                  </button>
                )}
                {searchFocused && searchSuggestions.length > 0 && (
                  <div
                    className="absolute left-0 top-full z-20 mt-0.5 max-h-48 w-full overflow-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
                    role="listbox"
                  >
                    {searchSuggestions.map((name) => (
                      <button
                        key={name}
                        type="button"
                        role="option"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setProjectSearchQuery(name);
                          setSearchFocused(false);
                        }}
                        className="w-full px-2.5 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 truncate"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <DisplayUnitSelect value={displayUnit} onChange={setDisplayUnit} />
            </div>
            <button
              type="button"
              onClick={() => { setShowAddProject(true); setAddProjectDisplayNameDraft(""); }}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 shrink-0"
            >
              Add new project
            </button>
          </>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}

      {vacationNotice && (
        <div
          className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          role="status"
        >
          <span className="font-medium">Vacation calendar: </span>
          {vacationNotice}
          {(vacationNotice.includes("Reconnect") || vacationNotice.includes("not connected")) && (
            <>
              {" "}
              <Link href="/dashboard/settings" className="font-medium underline hover:text-amber-900">
                Open Settings
              </Link>
            </>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : viewMode === "individual" && harvestTeamLoad.status === "loading" ? (
        <p className="text-sm text-neutral-500">Loading Harvest team…</p>
      ) : viewMode === "individual" && harvestTeamLoad.status === "error" ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-950 shadow-sm"
          role="alert"
        >
          <p className="font-medium text-amber-950">Harvest is not available for utilization</p>
          <p className="mt-2 text-amber-900/90">{harvestTeamLoad.message}</p>
          <p className="mt-3 text-amber-900/90">
            The utilization view uses Harvest&apos;s full team list (via the super admin&apos;s Harvest connection when
            available, otherwise yours). Connect or refresh Harvest under <strong>Accounts</strong> on the Dashboard,
            then return here.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex items-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Open Dashboard (Accounts)
          </Link>
        </div>
      ) : viewMode === "individual" ? (
        <div className="min-w-0 rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full min-w-[500px] table-fixed border-collapse text-xs">
            <thead className="bg-neutral-50">
              <tr className="border-b border-neutral-200">
                <th className="sticky left-0 z-20 min-w-[268px] w-[268px] border-r border-neutral-200 bg-neutral-50 px-2 py-1 text-left font-medium text-neutral-700 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                  Name
                </th>
                  {weekStarts.map((w) => (
                    <th
                      key={w}
                      className="min-w-[5rem] w-[5rem] border-r border-neutral-200 px-0.5 py-1 text-center font-medium text-neutral-600 last:border-r-0 whitespace-nowrap text-xs"
                    >
                      <span className="md:hidden">{formatWeekLabelShort(w)}</span>
                      <span className="hidden md:inline">{formatWeekLabelRange(w)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedFilteredResources.flatMap((resource_name) => {
                  const isExpanded = expandedIndividualResource === resource_name;
                  const totalByWeek = weekStarts.map((w) => utilizationByResourceWeek.get(`${resource_name}${ROW_KEY_SEP}${w}`) ?? 0);
                  const projectRows = allocationsByResourceProject.get(resource_name) ?? [];
                  const toggleExpanded = () => setExpandedIndividualResource((v) => (v === resource_name ? null : resource_name));
                  const mainRow = (
                    <tr
                      key={resource_name}
                      className="group border-b border-neutral-100 cursor-pointer hover:bg-neutral-50/50"
                      onClick={toggleExpanded}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpanded(); } }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? `Collapse projects for ${resource_name}` : `Show projects for ${resource_name}`}
                    >
                      <td className="sticky left-0 z-20 min-w-[268px] w-[268px] border-r border-neutral-200 bg-white px-2 py-2 align-middle shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] group-hover:bg-neutral-50">
                        <div className="flex items-center gap-1">
                          <span className="text-base leading-none text-neutral-500" aria-hidden>{isExpanded ? "−" : "+"}</span>
                          <span className="font-medium text-neutral-900">{resource_name}</span>
                        </div>
                      </td>
                      {weekStarts.map((w, i) => {
                        const sum = totalByWeek[i] ?? 0;
                        const color = getUtilizationColor(resource_name, w);
                        const onVacation = hasVacationWeek(resource_name, w);
                        return (
                          <td
                            key={w}
                            className={`min-w-[5rem] w-[5rem] border-r border-neutral-200 px-0.5 py-2 text-center last:border-r-0 ${color}`}
                          >
                            <AllocationWithVacation
                              onVacation={onVacation}
                              vacationTitle={vacationTooltipMessage(resource_name)}
                            >
                              {formatAllocationDisplay(sum, displayUnit)}
                            </AllocationWithVacation>
                          </td>
                        );
                      })}
                    </tr>
                  );
                  const detailRows = isExpanded
                    ? projectRows.map(({ project_name, weekFte }) => (
                        <tr key={`${resource_name}-${project_name}`} className="border-b border-neutral-50 bg-neutral-50/50">
                          <td className="sticky left-0 z-20 min-w-[268px] w-[268px] border-r border-neutral-200 bg-neutral-50/80 pl-6 pr-2 py-2 text-neutral-600 text-left shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                            {(() => {
                              const { label, tooltip } = getLinkedProjectsLabel(project_name);
                              if (!label) return <span className="text-neutral-800">{getDisplayTitle(project_name)}</span>;
                              return (
                                <>
                                  <span className="text-neutral-800">{getDisplayTitle(project_name)}</span>
                                  <span className="text-neutral-400"> · </span>
                                  {tooltip != null ? (
                                    <span className="text-neutral-600" title={tooltip}>{label}</span>
                                  ) : (
                                    <span className="text-neutral-600">{label}</span>
                                  )}
                                </>
                              );
                            })()}
                          </td>
                          {weekStarts.map((w) => {
                            const fte = weekFte.get(w) ?? 0;
                            return (
                              <td
                                key={w}
                                className="min-w-[5rem] w-[5rem] border-r border-neutral-200 px-0.5 py-2 text-center last:border-r-0 text-neutral-600"
                              >
                                {formatAllocationDisplay(fte, displayUnit)}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    : [];
                  return [mainRow, ...detailRows];
                })}
              </tbody>
            </table>
        </div>
      ) : (
        <div className="min-w-0 space-y-6">
          {filteredProjectNames.map((projectName) => {
            const rows = byProject.get(projectName) ?? [];
            const displayRows = rows.filter(
              (r) => r.resource_name !== PLACEHOLDER_NO_RESOURCES || r.role !== "—"
            );
            return (
              <div
                key={projectName}
                data-project-name={projectName}
                className="min-w-0 rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className="text-sm font-semibold text-neutral-900 truncate" title={(() => { const { label, tooltip } = getLinkedProjectsLabel(projectName); return [getDisplayTitle(projectName), label ? (tooltip ?? label) : null].filter(Boolean).join(" · "); })()}>
                      <span className="text-neutral-800">{getDisplayTitle(projectName)}</span>
                      {(() => {
                        const { label, tooltip, unlinked } = getLinkedProjectsLabel(projectName);
                        if (!label) return null;
                        return (
                          <>
                            <span className="text-neutral-400"> · </span>
                            <span
                              className={unlinked ? "text-neutral-500 italic" : "text-neutral-600"}
                              title={tooltip ?? (unlinked ? "Link Harvest projects from Edit project when the SOW is signed." : undefined)}
                            >
                              {label}
                            </span>
                          </>
                        );
                      })()}
                    </h2>
                    {projectAlertResourceNames.has(projectName) && !dismissedProjectAlerts.has(projectName) && (() => {
                      const names = projectAlertResourceNames.get(projectName) ?? [];
                      const msg = formatProjectAlertMessage(names);
                      return (
                      <span className="inline-flex items-center gap-1 min-w-0 max-w-[240px] sm:max-w-[320px] rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800" title={msg}>
                        <span className="truncate min-w-0">{msg}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDismissedProjectAlerts((prev) => new Set(prev).add(projectName));
                          }}
                          className="rounded p-0.5 hover:bg-amber-200/80"
                          aria-label="Dismiss alert"
                        >
                          <span aria-hidden>×</span>
                        </button>
                      </span>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-1" data-project-menu>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setOpenProjectMenu((v) => (v === projectName ? null : projectName)); }}
                        className="rounded border border-neutral-300 bg-white p-1 text-neutral-600 hover:bg-neutral-50"
                        aria-label="Project options"
                        aria-expanded={openProjectMenu === projectName}
                      >
                        <span className="sr-only">Options</span>
                        <span aria-hidden className="text-base leading-none">⋮</span>
                      </button>
                      {openProjectMenu === projectName && (
                        <div className="absolute right-0 top-full z-30 mt-0.5 min-w-[120px] rounded border border-neutral-200 bg-white py-1 shadow-lg">
                          <button
                            type="button"
                            onClick={() => {
                              setOpenProjectMenu(null);
                              setEditProjectName(projectName);
                              setEditProjectTitleDraft(projectMeta[projectName]?.display_title ?? "");
                            }}
                            className="w-full px-2 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                          >
                            Edit project
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm(`Delete project "${getDisplayTitle(projectName)}" and all its allocations?`)) return;
                              setOpenProjectMenu(null);
                              const res = await fetch(`/api/resource-planning/projects/${encodeURIComponent(projectName)}`, { method: "DELETE" });
                              if (res.ok) {
                                fetchAllocations(true);
                                fetchMeta();
                              } else {
                                const data = await res.json().catch(() => ({}));
                                setTimeout(() => setError(data?.error ?? "Failed to delete project"), 0);
                              }
                            }}
                            className="w-full px-2 py-1.5 text-left text-xs text-red-700 hover:bg-red-50"
                          >
                            Delete project
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="min-h-0 max-h-[50vh] overflow-auto">
                  <table className="w-full min-w-[500px] table-fixed border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-neutral-50">
                      <tr className="border-b border-neutral-200">
                        <th className="sticky left-0 z-20 min-w-[268px] w-[268px] border-r border-neutral-200 bg-neutral-50 px-2 py-1 text-left font-medium text-neutral-700 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                          Name / Role
                        </th>
                        {weekStarts.map((w) => (
                          <th
                            key={w}
                            className="min-w-[5rem] w-[5rem] border-r border-neutral-200 px-0.5 py-1 text-center font-medium text-neutral-600 last:border-r-0 whitespace-nowrap text-xs"
                          >
                            <span className="md:hidden">{formatWeekLabelShort(w)}</span>
                            <span className="hidden md:inline">{formatWeekLabelRange(w)}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map(({ resource_name, role }) => {
                        const rowKey = `${projectName}${ROW_KEY_SEP}${resource_name}${ROW_KEY_SEP}${role}`;
                        return (
                          <tr key={rowKey} className="group border-b border-neutral-100 hover:bg-neutral-50/50">
                            <td className="sticky left-0 z-20 min-w-[268px] w-[268px] border-r border-neutral-200 bg-white px-2 py-0.5 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] group-hover:bg-neutral-50">
                              <div className="flex items-center justify-between gap-1" data-row-menu>
                                <div className="min-w-0">
                                  <span className="font-medium text-neutral-900">{resource_name}</span>
                                  <span className="text-neutral-500"> · {role}</span>
                                </div>
                                <div className="relative shrink-0" data-row-menu>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                      if (openRowMenu === rowKey) {
                                        setOpenRowMenu(null);
                                        setRowMenuAnchor(null);
                                        setRowMenuContext(null);
                                      } else {
                                        setOpenRowMenu(rowKey);
                                        setRowMenuAnchor({ left: rect.left, top: rect.bottom + 4 });
                                        setRowMenuContext({ projectName, resource_name, role });
                                      }
                                    }}
                                    className="rounded border border-transparent p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                                    aria-label="Row options"
                                    aria-expanded={openRowMenu === rowKey}
                                  >
                                    <span className="text-base leading-none">⋮</span>
                                  </button>
                                </div>
                              </div>
                            </td>
                            {weekStarts.map((w) => {
                              const alloc = allocationByKeyWeek.get(`${rowKey}${ROW_KEY_SEP}${w}`);
                              const isEditingExisting = alloc && editingCell && "id" in editingCell && editingCell.id === alloc.id;
                              const isEditingNew = !alloc && editingCell && "new" in editingCell && editingCell.rowKey === rowKey && editingCell.weekStart === w;
                              const isEditing = isEditingExisting || isEditingNew;
                              const color = getUtilizationColor(resource_name, w);
                              const listForWeek = allocationsForResourceWeek(resource_name, w);
                              const total = listForWeek.reduce((s, a) => s + Number(a.fte), 0);
                              const onVacation = hasVacationWeek(resource_name, w);
                              return (
                                <td
                                  key={w}
                                  className={`relative min-w-[5rem] w-[5rem] border-r border-neutral-200 text-center last:border-r-0 ${color} ${isEditing ? "p-0" : "px-0.5 py-0.5"}`}
                                  onMouseEnter={(e) => {
                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                    setHoverCell({ rowKey, weekStart: w });
                                    setTooltipState({
                                      resource_name,
                                      total,
                                      listForWeek,
                                      left: rect.left,
                                      top: rect.bottom + 4,
                                      vacationPlanned: onVacation,
                                    });
                                  }}
                                  onMouseLeave={() => {
                                    setHoverCell(null);
                                    setTooltipState(null);
                                  }}
                                >
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      placeholder={displayUnit === "hours" ? "hrs" : "%"}
                                      value={
                                        editingCell && "id" in editingCell
                                          ? editingCell.inputValue
                                          : editingCell && "new" in editingCell
                                            ? editingCell.inputValue
                                            : ""
                                      }
                                      onChange={(e) => {
                                        let val = e.target.value.replace(/[^0-9.]/g, "");
                                        const dotCount = (val.match(/\./g) || []).length;
                                        if (dotCount > 1) val = val.replace(/(\..*)\./g, "$1");
                                        if (editingCell && "id" in editingCell) setEditingCell({ id: editingCell.id, inputValue: val });
                                        else if (editingCell && "new" in editingCell) setEditingCell({ ...editingCell, inputValue: val });
                                      }}
                                      onBlur={() => {
                                        if (!editingCell) return;
                                        const raw = "id" in editingCell ? editingCell.inputValue : editingCell.inputValue;
                                        const parsed = fteFromDisplayInput(raw, displayUnit);
                                        if ("id" in editingCell) {
                                          saveCell({ id: editingCell.id, fte: parsed });
                                        } else {
                                          if (editingCell.inputValue.trim() !== "") saveCell({ new: true, projectName, resource_name, role, weekStart: w, fte: parsed });
                                          else setEditingCell(null);
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Escape") setEditingCell(null);
                                        if (e.key !== "Enter") return;
                                        const raw = "id" in editingCell! ? editingCell.inputValue : editingCell!.inputValue;
                                        const parsed = fteFromDisplayInput(raw, displayUnit);
                                        if ("id" in editingCell!) saveCell({ id: editingCell.id, fte: parsed });
                                        else {
                                          if (editingCell!.inputValue.trim() !== "") saveCell({ new: true, projectName, resource_name, role, weekStart: w, fte: parsed });
                                          else setEditingCell(null);
                                        }
                                      }}
                                      className="block h-full min-h-8 w-full rounded border border-neutral-300 px-1 py-1.5 text-center text-sm tabular-nums focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                                      autoFocus
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (alloc) setEditingCell({ id: alloc.id, inputValue: editValueFromFte(Number(alloc.fte), displayUnit) });
                                        else setEditingCell({ new: true, rowKey, weekStart: w, inputValue: "" });
                                      }}
                                      className="block w-full rounded px-0.5 py-0.5 hover:ring-1 hover:ring-neutral-400"
                                    >
                                      <AllocationWithVacation
                                        onVacation={onVacation}
                                        vacationTitle={vacationTooltipMessage(resource_name)}
                                      >
                                        {alloc ? formatAllocationDisplay(Number(alloc.fte), displayUnit) : "—"}
                                      </AllocationWithVacation>
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="sticky bottom-0 z-10 border-t border-neutral-200 bg-neutral-50">
                        <td colSpan={weekStarts.length + 1} className="bg-neutral-50 px-2 py-3">
                          <button
                            type="button"
                            onClick={() => { setAddForProject(projectName); setShowAdd(true); }}
                            className="text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:underline"
                          >
                            + Resource
                          </button>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  {displayRows.length === 0 && (
                    <p className="px-3 py-4 text-center text-xs text-neutral-500">No resources on this project in this range.</p>
                  )}
                </div>
              </div>
            );
          })}
          {projectNames.length === 0 && (
            <p className="rounded-lg border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
              No projects. Add a project or run the seed script to load from CSV.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
        <span className="inline-flex items-center gap-1">
          <span className="resource-planning-util-cell rounded bg-red-100 px-1.5 py-0.5">Over</span> &gt;100%
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="resource-planning-util-cell rounded bg-green-100 px-1.5 py-0.5">Full</span> 80–100%
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="resource-planning-util-cell rounded bg-amber-100 px-1.5 py-0.5">Partial</span> 40–79%
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="resource-planning-util-cell rounded bg-orange-100 px-1.5 py-0.5">Low</span> 1–39%
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden>{VACATION_EMOJI}</span> Vacation planned (Google calendar)
        </span>
      </div>

      {toast === "saved" && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          Saved
        </div>
      )}

      {typeof document !== "undefined" &&
        tooltipState &&
        createPortal(
          <div
            className="z-[9999] w-48 rounded border border-neutral-200 bg-white p-2 shadow-lg text-left text-xs"
            style={{ position: "fixed", left: tooltipState.left, top: tooltipState.top }}
            role="tooltip"
          >
            <div className="flex items-center gap-1.5 font-medium text-neutral-900">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${getStatusDotColor(tooltipState.total)}`}
                aria-hidden
              />
              {tooltipState.resource_name}
            </div>
            {tooltipState.vacationPlanned && (
              <p className="mt-1 font-medium leading-snug text-red-700">
                {vacationTooltipMessage(tooltipState.resource_name)}
              </p>
            )}
            <div className="mt-0.5 text-neutral-600">
              Total: {formatAllocationDisplay(tooltipState.total, displayUnit)}
            </div>
            <ul className="mt-1 space-y-0.5 text-neutral-500">
              {tooltipState.listForWeek.map((a) => {
                const { label, tooltip } = getLinkedProjectsLabel(a.project_name);
                const suffix = label ? ` · ${label}` : "";
                const labelStr = getDisplayTitle(a.project_name) + suffix;
                return (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span className="truncate min-w-0" title={tooltip ?? labelStr}>
                      {truncate(labelStr, 28)}
                    </span>
                    <span className="shrink-0">{formatAllocationDisplay(Number(a.fte), displayUnit)}</span>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body
        )}

      {typeof document !== "undefined" &&
        openRowMenu &&
        rowMenuAnchor &&
        rowMenuContext &&
        createPortal(
          <div
            data-row-menu
            className="z-[9999] min-w-[160px] rounded border border-neutral-200 bg-white py-1 shadow-lg"
            style={{ position: "fixed", left: rowMenuAnchor.left, top: rowMenuAnchor.top }}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                setOpenRowMenu(null);
                setRowMenuAnchor(null);
                setRowMenuContext(null);
                const confirmed = window.confirm(
                  `Are you sure you want to remove ${rowMenuContext.resource_name} from this project? They will be removed from this week forward only; past weeks will still show their allocation.`
                );
                if (!confirmed) return;
                const fromWeek = getWeekStart(new Date());
                const res = await fetch(
                  `/api/resource-planning/allocations?projectName=${encodeURIComponent(rowMenuContext.projectName)}&resourceName=${encodeURIComponent(rowMenuContext.resource_name)}&role=${encodeURIComponent(rowMenuContext.role)}&fromWeek=${encodeURIComponent(fromWeek)}`,
                  { method: "DELETE" }
                );
                if (res.ok) {
                  fetchAllocations(true);
                  fetchMeta();
                }
              }}
              className="w-full px-2 py-1.5 text-left text-xs text-red-700 hover:bg-red-50"
            >
              Remove from project
            </button>
          </div>,
          document.body
        )}

      {showAdd && (
        <AddAllocationForm
          resources={resources}
          projects={projects}
          weekStarts={weekStarts}
          initialProject={addForProject ?? undefined}
          onClose={() => { setShowAdd(false); setAddForProject(null); }}
          onAdded={() => {
            const scrollY = window.scrollY;
            setShowAdd(false);
            setAddForProject(null);
            void fetchAllocations(true).then(() => {
              requestAnimationFrame(() => window.scrollTo(0, scrollY));
            });
            fetchMeta();
          }}
        />
      )}

      {showAddProject && (
        <AddProjectFromHarvestModal
          existingProjectNames={projectNames}
          displayName={addProjectDisplayNameDraft}
          onDisplayNameChange={setAddProjectDisplayNameDraft}
          onClose={() => { setShowAddProject(false); setAddProjectDisplayNameDraft(""); }}
          onAdded={async (addedNames) => {
            setShowAddProject(false);
            setAddProjectDisplayNameDraft("");
            await fetchAllocations(true);
            fetchMeta();
            if (addedNames.length) setAddedProjectName(addedNames[0]);
          }}
        />
      )}

      {editProjectName && (
        <EditProjectModal
          key={editProjectName}
          projectName={editProjectName}
          displayTitle={editProjectTitleDraft}
          onDisplayTitleChange={setEditProjectTitleDraft}
          harvestProjectIds={projectMeta[editProjectName]?.harvest_project_ids ?? []}
          onClose={() => { setEditProjectName(null); setEditProjectTitleDraft(""); }}
          onSaved={() => {
            setEditProjectName(null);
            setEditProjectTitleDraft("");
            fetchMeta();
          }}
        />
      )}
    </div>
  );
}

type HarvestProject = { id: number; name: string; is_active: boolean; client?: { name: string } };

function AddProjectFromHarvestModal({
  existingProjectNames,
  displayName,
  onDisplayNameChange,
  onClose,
  onAdded,
}: {
  existingProjectNames: string[];
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  onClose: () => void;
  onAdded: (addedNames: string[], clientByProject?: Record<string, string>) => void | Promise<void>;
}) {
  const [allFetched, setAllFetched] = useState<(HarvestProject & { _alreadyAdded?: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<HarvestProject[]>([]);
  const [saving, setSaving] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  const existingSet = useMemo(
    () => new Set(existingProjectNames.map((n) => n.trim().toLowerCase())),
    [existingProjectNames]
  );
  const clients = useMemo(() => {
    const set = new Set<string>();
    allFetched.forEach((p) => { if (p.client?.name) set.add(p.client.name); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [allFetched]);
  const projectsForClient = useMemo(
    () =>
      selectedClient
        ? allFetched.filter(
            (p) => p.client?.name === selectedClient && !(p as HarvestProject & { _alreadyAdded?: boolean })._alreadyAdded
          )
        : [],
    [allFetched, selectedClient]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setDebugInfo(null);
    const existing = existingSet;
    fetch("/api/integrations/harvest/projects")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          setAllFetched([]);
          return;
        }
        const raw = (data.projects ?? []).filter((p: HarvestProject) => p.is_active);
        const list = raw.map((p: HarvestProject) => ({
          ...p,
          _alreadyAdded: existing.has((p.name ?? "").trim().toLowerCase()),
        }));
        list.sort((a: HarvestProject & { _alreadyAdded?: boolean }, b: HarvestProject & { _alreadyAdded?: boolean }) => {
          const clientA = (a.client?.name ?? "\uFFFF").toLowerCase();
          const clientB = (b.client?.name ?? "\uFFFF").toLowerCase();
          if (clientA !== clientB) return clientA.localeCompare(clientB);
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        });
        setAllFetched(list);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load Harvest projects.");
          setAllFetched([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  function toggleProject(p: HarvestProject) {
    setSelectedProjects((prev) =>
      prev.some((x) => x.id === p.id) ? prev.filter((x) => x.id !== p.id) : [...prev, p]
    );
  }

  async function handleAdd() {
    const projectName = displayName.trim();
    if (!projectName) return;
    if (existingSet.has(projectName.toLowerCase())) {
      setError("A project with this name already exists.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const weekStart = getWeekStart(new Date());
      const res = await fetch("/api/resource-planning/allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceName: "(No resources yet)",
          role: "—",
          projectName,
          weekStart,
          fte: 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to add project");
      const clientByProject: Record<string, string> = {};
      const first = selectedProjects[0];
      if (first?.client?.name) clientByProject[projectName] = first.client.name;
      await fetch(`/api/resource-planning/projects/${encodeURIComponent(projectName)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_title: projectName,
          harvest_project_ids: selectedProjects.map((p) => p.id),
          harvest_project_names: selectedProjects.map((p) => p.name),
        }),
      });
      await onAdded([projectName], clientByProject);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add project");
    } finally {
      setSaving(false);
    }
  }

  const canAdd = displayName.trim().length > 0 && !saving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-neutral-200 bg-white p-4 shadow-xl">
        <h3 className="text-base font-semibold text-neutral-900">Add new project</h3>
        <p className="mt-0.5 text-xs text-neutral-500">
          Enter a display name to plan future work. Link a client and Harvest projects now, or add them later from Edit project after the SOW is signed.
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-3">
          <label className="block text-xs font-medium text-neutral-600">Display name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder="e.g. Q1 Support"
            className="mt-0.5 w-full rounded border border-neutral-300 px-2.5 py-1.5 text-sm"
          />
        </div>
        <div className="mt-4 border-t border-neutral-100 pt-3">
          <p className="text-xs font-medium text-neutral-700">Link Harvest projects (optional)</p>
          {loading ? (
            <p className="mt-2 text-sm text-neutral-500">Loading Harvest projects…</p>
          ) : allFetched.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">
              No active Harvest projects, or Harvest is not connected. You can still add this project and link Harvest later from Edit project.
            </p>
          ) : (
            <>
            <div className="mt-2">
              <label className="block text-xs font-medium text-neutral-600">Client</label>
              <select
                value={selectedClient ?? ""}
                onChange={(e) => {
                  setSelectedClient(e.target.value || null);
                  setSelectedProjects([]);
                }}
                className="mt-0.5 w-full rounded border border-neutral-300 px-2.5 py-1.5 text-sm"
              >
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            {selectedClient && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-neutral-600">Projects ({projectsForClient.length})</label>
                <p className="mt-0.5 text-xs text-neutral-500">Select one or more Harvest projects to link to this card.</p>
                <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-neutral-200 divide-y divide-neutral-100">
                  {projectsForClient.map((p) => {
                    const checked = selectedProjects.some((x) => x.id === p.id);
                    return (
                      <li key={p.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-neutral-50">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProject(p)}
                          className="rounded border-neutral-300"
                          aria-label={`Select ${p.name}`}
                        />
                        <span className="flex-1 min-w-0 truncate text-sm text-neutral-900">{p.name}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setDebugInfo("Loading…");
                fetch("/api/integrations/harvest/projects?debug=1")
                  .then((r) => r.json())
                  .then((d) => {
                    const dbg = d._debug;
                    setDebugInfo(
                      dbg
                        ? `From API: ${dbg.fromApi}, from budget report: ${dbg.fromBudget}, merged: ${dbg.merged}. Hallmark/HMK005 matches: ${dbg.matchingHallmarkOrHmk ?? 0}. ${dbg.matchingNames?.length ? `Names: ${JSON.stringify(dbg.matchingNames)}` : ""}`
                        : "No debug data."
                    );
                  })
                  .catch(() => setDebugInfo("Failed to load debug."));
              }}
              className="mt-2 text-xs text-neutral-500 underline hover:text-neutral-700"
            >
              Troubleshoot: not seeing a project?
            </button>
            {debugInfo && (
              <p className="mt-1 break-all text-xs text-neutral-600" role="status">
                {debugInfo}
              </p>
            )}
            </>
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
            onClick={handleAdd}
            disabled={!canAdd}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {saving
              ? "Adding…"
              : selectedProjects.length
                ? `Add (${selectedProjects.length} Harvest project${selectedProjects.length === 1 ? "" : "s"})`
                : "Add project"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditProjectModal({
  projectName,
  displayTitle,
  onDisplayTitleChange,
  harvestProjectIds,
  onClose,
  onSaved,
}: {
  projectName: string;
  displayTitle: string;
  onDisplayTitleChange: (value: string) => void;
  harvestProjectIds: number[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [harvestProjects, setHarvestProjects] = useState<HarvestProject[]>([]);
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
        const list = (data.projects ?? []).filter((p: HarvestProject) => p.is_active);
        list.sort((a: HarvestProject, b: HarvestProject) => {
          const ca = (a.client?.name ?? "").localeCompare(b.client?.name ?? "");
          if (ca !== 0) return ca;
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        });
        setHarvestProjects(list);
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
      const title = displayTitle.trim();
      const res = await fetch(`/api/resource-planning/projects/${encodeURIComponent(projectName)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_title: title || null,
          harvest_project_ids: Array.from(selectedIds),
          harvest_project_names: harvestProjects.filter((p) => selectedIds.has(p.id)).map((p) => p.name),
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-neutral-200 bg-white p-4 shadow-xl">
        <h3 className="text-base font-semibold text-neutral-900">Edit project</h3>
        <p className="mt-0.5 text-xs text-neutral-500">
          Update the display name and link Harvest projects when ready. Leave Harvest unlinked for draft or future work.
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-3">
          <label className="block text-xs font-medium text-neutral-600">Display name</label>
          <input
            type="text"
            value={displayTitle}
            onChange={(e) => onDisplayTitleChange(e.target.value)}
            placeholder={projectName}
            className="mt-0.5 w-full rounded border border-neutral-300 px-2.5 py-1.5 text-sm"
          />
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
          <p className="mt-0.5 text-xs text-neutral-500">Select one or more Harvest projects to associate with this resource planning project.</p>
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
}

const ROLES = [
  "Architect", "Back-End Dev", "DevOps", "Front-End Dev", "Full-Stack Dev",
  "Project Manager", "QA Analyst", "SEO", "UI/UX Designer", "Product Owner", "Shopify",
];

function AddAllocationForm({
  resources,
  projects,
  weekStarts,
  initialProject,
  onClose,
  onAdded,
}: {
  resources: string[];
  projects: string[];
  weekStarts: string[];
  initialProject?: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const isAddResource = initialProject !== undefined;
  const [resourceName, setResourceName] = useState("");
  const [role, setRole] = useState("");
  const [projectName, setProjectName] = useState(initialProject ?? "");
  const [weekStart, setWeekStart] = useState(weekStarts[0] ?? "");
  const [fte, setFte] = useState(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [harvestUsers, setHarvestUsers] = useState<{ id: number; name: string }[]>([]);
  const [harvestUsersLoading, setHarvestUsersLoading] = useState(false);
  const [harvestUsersError, setHarvestUsersError] = useState("");
  const [harvestUsersRetryKey, setHarvestUsersRetryKey] = useState(0);

  useEffect(() => {
    if (initialProject !== undefined) setProjectName(initialProject);
  }, [initialProject]);

  useEffect(() => {
    if (!isAddResource) return;
    let cancelled = false;
    setHarvestUsersLoading(true);
    setHarvestUsersError("");
    (async () => {
      try {
        const res = await fetch("/api/integrations/harvest/users");
        const data: { users?: { id: number; name: string }[]; error?: string } = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setHarvestUsers([]);
          const fromBody =
            typeof data.error === "string" && data.error.trim() ? data.error.trim() : "";
          setHarvestUsersError(
            fromBody ||
              (res.status === 401
                ? "You need to be signed in to load Harvest."
                : "Could not load Harvest people for this form.")
          );
          return;
        }
        if (data.error) {
          setHarvestUsers([]);
          setHarvestUsersError(
            typeof data.error === "string" && data.error.trim()
              ? data.error.trim()
              : "Could not load Harvest people for this form."
          );
          return;
        }
        setHarvestUsers(Array.isArray(data.users) ? data.users : []);
      } catch {
        if (!cancelled) {
          setHarvestUsers([]);
          setHarvestUsersError("Network error while loading Harvest. Check your connection and try again.");
        }
      } finally {
        if (!cancelled) setHarvestUsersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAddResource, harvestUsersRetryKey]);

  async function submit() {
    const name = resourceName.trim();
    const r = role.trim();
    const proj = projectName.trim();
    if (!name || !r || !proj) {
      setErr(isAddResource ? "Name and role are required." : "Name, role, and project are required.");
      return;
    }
    setErr("");
    setSaving(true);
    try {
      const res = await fetch("/api/resource-planning/allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceName: name,
          role: r,
          projectName: proj,
          weekStart: isAddResource ? (weekStarts[0] ?? "") : weekStart || weekStarts[0],
          fte: isAddResource ? 0 : Math.min(1, Math.max(0, fte)),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to add");
      onAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-4 shadow-xl">
        <h3 className="text-base font-semibold text-neutral-900">{isAddResource ? "Add resource" : "Add allocation"}</h3>
        <p className="mt-0.5 text-xs text-neutral-500">
          {isAddResource ? "Select a Harvest user and role. They’ll be added to the project; you can then add entries in the table." : "Resource · Role · Project · Week · FTE"}
        </p>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        {harvestUsersError && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <p>{harvestUsersError}</p>
            <button
              type="button"
              className="mt-2 text-xs font-medium text-amber-900 underline hover:no-underline"
              onClick={() => setHarvestUsersRetryKey((k) => k + 1)}
            >
              Retry
            </button>
          </div>
        )}
        <div className="mt-3 space-y-2">
          <div>
            <label className="block text-xs font-medium text-neutral-600">Name</label>
            {isAddResource ? (
              <select
                value={resourceName}
                onChange={(e) => setResourceName(e.target.value)}
                className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                disabled={harvestUsersLoading || Boolean(harvestUsersError)}
              >
                <option value="">
                  {harvestUsersLoading ? "Loading Harvest…" : harvestUsersError ? "Harvest unavailable" : "Select from Harvest"}
                </option>
                {harvestUsers.map((u) => (
                  <option key={u.id} value={u.name}>{u.name}</option>
                ))}
              </select>
            ) : (
              <>
                <input
                  list="resources-list"
                  value={resourceName}
                  onChange={(e) => setResourceName(e.target.value)}
                  placeholder="e.g. Morgan Catlin"
                  className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                />
                <datalist id="resources-list">
                  {resources.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
            >
              <option value="">Select role</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          {!isAddResource && (
            <>
              <div>
                <label className="block text-xs font-medium text-neutral-600">Project</label>
                <input
                  list="projects-list"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. MyAtlas Enhancements"
                  className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                />
                <datalist id="projects-list">
                  {projects.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-neutral-600">Week</label>
                  <select
                    value={weekStart}
                    onChange={(e) => setWeekStart(e.target.value)}
                    className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                  >
                    {weekStarts.map((w) => (
                      <option key={w} value={w}>{formatWeekLabel(w)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-600">FTE (0–1)</label>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.25}
                    value={fte}
                    onChange={(e) => setFte(parseFloat(e.target.value) || 0)}
                    className="mt-0.5 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            </>
          )}
          {isAddResource && projectName && (
            <p className="text-xs text-neutral-500">Adding to: <strong>{projectName}</strong></p>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={
              saving ||
              (isAddResource &&
                (harvestUsersLoading || Boolean(harvestUsersError) || harvestUsers.length === 0))
            }
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
