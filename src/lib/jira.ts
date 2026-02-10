export type JiraProject = {
  key: string;
  name: string;
  id: string;
};

/** Jira Cloud with OAuth 2.0 (3LO) – use cloud ID from accessible-resources */
export async function getJiraProjectsOAuth(
  cloudId: string,
  accessToken: string
): Promise<JiraProject[]> {
  const res = await fetch(
    `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API: ${res.status} ${text}`);
  }
  const data: { key: string; name: string; id: string }[] = await res.json();
  return data.map((p) => ({ key: p.key, name: p.name, id: p.id }));
}

/** Jira Cloud with Basic auth (email + API token) – legacy / fallback */
export async function getJiraProjects(
  siteUrl: string,
  email: string,
  apiToken: string
): Promise<JiraProject[]> {
  const base = siteUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/rest/api/3/project`, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API: ${res.status} ${text}`);
  }
  const data: { key: string; name: string; id: string }[] = await res.json();
  return data.map((p) => ({ key: p.key, name: p.name, id: p.id }));
}
