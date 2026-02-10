const HARVEST_API = "https://api.harvestapp.com/v2";

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
};

export type HarvestProjectsResponse = {
  projects: HarvestProject[];
  total_entries: number;
};

export async function getHarvestProjects(
  accountId: string,
  accessToken: string
): Promise<HarvestProject[]> {
  const res = await fetch(`${HARVEST_API}/projects?per_page=2000`, {
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
  const data: HarvestProjectsResponse = await res.json();
  return data.projects ?? [];
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
};

/** Project Budget Report: returns budget, budget_spent, budget_remaining per project (all-time hours consumed/remaining). */
export async function getHarvestProjectBudgetReport(
  accountId: string,
  accessToken: string
): Promise<HarvestProjectBudgetResult[]> {
  const res = await fetch(`${HARVEST_API}/reports/project_budget?per_page=2000`, {
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
  const data: HarvestProjectBudgetResponse = await res.json();
  return data.results ?? [];
}

export async function getHarvestTimeEntries(
  accountId: string,
  accessToken: string,
  from: string,
  to: string,
  projectIds?: number[]
): Promise<HarvestTimeEntry[]> {
  // Harvest accepts one project_id per request; fetch per project and merge
  const set = new Set(projectIds ?? []);
  if (set.size === 0) {
    const params = new URLSearchParams({ from, to, per_page: "2000" });
    const res = await fetch(`${HARVEST_API}/time_entries?${params}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Harvest-Account-Id": accountId,
        "User-Agent": "Valtira-PM (valtira.net)",
      },
    });
    if (!res.ok) throw new Error(`Harvest API: ${res.status}`);
    const data: HarvestTimeEntriesResponse = await res.json();
    return data.time_entries ?? [];
  }
  const all: HarvestTimeEntry[] = [];
  for (const projectId of Array.from(set)) {
    const params = new URLSearchParams({
      from,
      to,
      per_page: "2000",
      project_id: String(projectId),
    });
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
    const data: HarvestTimeEntriesResponse = await res.json();
    all.push(...(data.time_entries ?? []));
  }
  return all;
}
