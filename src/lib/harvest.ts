const HARVEST_API = "https://api.harvestapp.com/v2";

/** Harvest budgets tracked in hours (not fees). */
export function isHarvestHourBudget(budgetBy: string | null | undefined): boolean {
  return budgetBy === "project" || budgetBy === "person";
}

/** Harvest budgets tracked in currency (fees). */
export function isHarvestCostBudget(budgetBy: string | null | undefined): boolean {
  return budgetBy === "project_cost" || budgetBy === "person_cost";
}

export type HarvestProject = {
  id: number;
  name: string;
  code: string | null;
  is_active: boolean;
  client: { id: number; name: string; currency: string };
  budget?: number | null;
  budget_by?: string | null;
  cost_budget?: number | null;
  hourly_rate?: number | null;
  starts_on?: string | null;
  ends_on?: string | null;
};

export type HarvestProjectsResponse = {
  projects: HarvestProject[];
  total_entries: number;
  per_page?: number;
  page?: number;
  total_pages?: number;
  next_page?: number | null;
  links?: { next?: string | null; first?: string; last?: string; previous?: string | null };
};

export type HarvestUser = {
  id: number;
  first_name: string;
  last_name: string;
  is_active: boolean;
};

export type HarvestUsersResponse = {
  users: HarvestUser[];
  total_entries: number;
  links?: { next?: string | null };
  next_page?: number | null;
};

/** All active users (staff and contractors) – full org list, not filtered by team/project. */
export async function getHarvestUsers(
  accountId: string,
  accessToken: string
): Promise<HarvestUser[]> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Harvest-Account-Id": accountId,
    "User-Agent": "Valtira-PM (valtira.net)",
  };
  const all: HarvestUser[] = [];
  let url: string | null = `${HARVEST_API}/users?per_page=2000`;
  let page = 1;
  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Harvest API: ${res.status} ${text}`);
    }
    const data: HarvestUsersResponse = await res.json();
    const users = data.users ?? [];
    all.push(...users);
    const nextLink = data.links?.next ?? null;
    const nextPage = data.next_page ?? null;
    if (nextLink) {
      url = nextLink;
    } else if (nextPage != null && users.length > 0) {
      page = nextPage;
      url = `${HARVEST_API}/users?per_page=2000&page=${page}`;
    } else {
      url = null;
    }
  }
  return all.filter((u) => u.is_active);
}

export async function getHarvestProjects(
  accountId: string,
  accessToken: string,
  options?: { isActive?: boolean }
): Promise<HarvestProject[]> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Harvest-Account-Id": accountId,
    "User-Agent": "Valtira-PM (valtira.net)",
  };
  const all: HarvestProject[] = [];
  const params = new URLSearchParams({ per_page: "2000" });
  if (options?.isActive !== undefined) {
    params.set("is_active", options.isActive ? "true" : "false");
  }
  let url: string | null = `${HARVEST_API}/projects?${params}`;
  let page = 1;
  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Harvest API: ${res.status} ${text}`);
    }
    const data: HarvestProjectsResponse = await res.json();
    const projects = data.projects ?? [];
    all.push(...projects);
    const nextLink = data.links?.next ?? null;
    const nextPage = data.next_page ?? null;
    if (nextLink) {
      url = nextLink;
    } else if (nextPage != null && projects.length > 0) {
      page = nextPage;
      url = `${HARVEST_API}/projects?${params}&page=${page}`;
    } else {
      url = null;
    }
  }
  return all;
}

export type HarvestTimeEntry = {
  id: number;
  project: { id: number; name: string };
  task: { id: number; name: string };
  user: { id: number; name: string };
  spent_date: string;
  hours: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  external_reference?: { id: string; permalink?: string } | null;
};

export type HarvestTimeEntriesResponse = {
  time_entries: HarvestTimeEntry[];
  total_entries: number;
  total_pages: number;
  next_page: number | null;
  page: number;
};

export type HarvestProjectBudgetResult = {
  project_id: number;
  project_name: string;
  client_id: number;
  client_name: string;
  budget_is_monthly: boolean;
  budget_by: string;
  is_active: boolean;
  budget: number;
  budget_spent: number;
  budget_remaining: number;
};

export type HarvestProjectBudgetResponse = {
  results: HarvestProjectBudgetResult[];
  total_entries: number;
  next_page?: number | null;
  page?: number;
  links?: { next?: string | null; first?: string; last?: string; previous?: string | null };
};

/** Project Budget Report: returns all pages (budget, budget_spent, budget_remaining per project). */
export async function getHarvestProjectBudgetReport(
  accountId: string,
  accessToken: string
): Promise<HarvestProjectBudgetResult[]> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Harvest-Account-Id": accountId,
    "User-Agent": "Valtira-PM (valtira.net)",
  };
  const all: HarvestProjectBudgetResult[] = [];
  let url: string | null = `${HARVEST_API}/reports/project_budget?per_page=2000`;
  let page = 1;
  while (url) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Harvest API: ${res.status} ${text}`);
    }
    const data: HarvestProjectBudgetResponse = await res.json();
    const results = data.results ?? [];
    all.push(...results);
    const nextLink = data.links?.next ?? null;
    const nextPage = data.next_page ?? null;
    if (nextLink) {
      url = nextLink;
    } else if (nextPage != null && results.length > 0) {
      page = nextPage;
      url = `${HARVEST_API}/reports/project_budget?per_page=2000&page=${page}`;
    } else {
      url = null;
    }
  }
  return all;
}

/** Projects from Project Budget Report (for merging with /projects list). Managers may see more projects here. */
export function harvestProjectsFromBudgetReport(
  results: HarvestProjectBudgetResult[]
): HarvestProject[] {
  return results.map((r) => ({
    id: r.project_id,
    name: r.project_name,
    code: null,
    is_active: r.is_active,
    client: { id: r.client_id, name: r.client_name, currency: "" },
  }));
}

/** Fetch one page of time entries. */
async function fetchTimeEntriesPage(
  accountId: string,
  accessToken: string,
  params: URLSearchParams
): Promise<HarvestTimeEntriesResponse> {
  const res = await fetch(`${HARVEST_API}/time_entries?${params}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Harvest-Account-Id": accountId,
      "User-Agent": "Valtira-PM (valtira.net)",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Harvest API: ${res.status} ${text}`);
  }
  return res.json();
}

/** Fetch all time entries in range, following pagination. Only includes entries for projectIds when provided. */
export async function getHarvestTimeEntries(
  accountId: string,
  accessToken: string,
  from: string,
  to: string,
  projectIds?: number[]
): Promise<HarvestTimeEntry[]> {
  const set = new Set(projectIds ?? []);
  const perPage = 2000;
  const all: HarvestTimeEntry[] = [];

  if (set.size === 0) {
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const params = new URLSearchParams({ from, to, per_page: String(perPage), page: String(page) });
      const data = await fetchTimeEntriesPage(accountId, accessToken, params);
      const entries = data.time_entries ?? [];
      all.push(...entries);
      hasMore = data.next_page != null && entries.length === perPage;
      page = data.next_page ?? page + 1;
    }
    return all;
  }

  for (const projectId of Array.from(set)) {
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const params = new URLSearchParams({
        from,
        to,
        per_page: String(perPage),
        project_id: String(projectId),
        page: String(page),
      });
      const data = await fetchTimeEntriesPage(accountId, accessToken, params);
      const entries = data.time_entries ?? [];
      all.push(...entries);
      hasMore = data.next_page != null && entries.length === perPage;
      page = data.next_page ?? page + 1;
    }
  }
  return all;
}
