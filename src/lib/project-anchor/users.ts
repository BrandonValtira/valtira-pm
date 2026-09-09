import { createAdminClient } from "@/lib/supabase/admin";
import { getJiraUser } from "./jira";
import { listHarvestUsersWithEmail } from "./harvest";
import type { ProjectAnchorUserMap } from "./types";
import { SyncError } from "./types";

function harvestDisplayName(user: { first_name?: string; last_name?: string; email?: string; id: number }): string {
  return [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.email || String(user.id);
}

function mapRow(row: Record<string, unknown>): ProjectAnchorUserMap {
  return {
    id: String(row.id),
    jira_account_id: row.jira_account_id == null ? null : String(row.jira_account_id),
    jira_email: (row.jira_email as string | null) ?? null,
    jira_display_name: (row.jira_display_name as string | null) ?? null,
    harvest_user_id: row.harvest_user_id == null ? null : Number(row.harvest_user_id),
    harvest_email: (row.harvest_email as string | null) ?? null,
    harvest_display_name: (row.harvest_display_name as string | null) ?? null,
    default_harvest_task_name: (row.default_harvest_task_name as string | null) ?? null,
    mapped_by: (row.mapped_by as ProjectAnchorUserMap["mapped_by"]) ?? "email_auto",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listUserMaps(): Promise<ProjectAnchorUserMap[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("project_anchor_user_maps")
    .select("*")
    .order("harvest_display_name", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function getUserMap(jiraAccountId: string): Promise<ProjectAnchorUserMap | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("project_anchor_user_maps")
    .select("*")
    .eq("jira_account_id", jiraAccountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function getUserMapByHarvestId(harvestUserId: number): Promise<ProjectAnchorUserMap | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("project_anchor_user_maps")
    .select("*")
    .eq("harvest_user_id", harvestUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function resolveUserMap(jiraAccountId: string): Promise<ProjectAnchorUserMap> {
  const existingByJira = await getUserMap(jiraAccountId);
  if (existingByJira?.harvest_user_id) return existingByJira;

  const jiraUser = await getJiraUser(jiraAccountId);
  const harvestUsers = await listHarvestUsersWithEmail();
  const email =
    jiraUser.emailAddress?.trim().toLowerCase() ?? existingByJira?.jira_email?.trim().toLowerCase() ?? null;
  const jiraName = (jiraUser.displayName ?? existingByJira?.jira_display_name ?? "").trim().toLowerCase();
  const harvestMatch =
    (email ? harvestUsers.find((u) => u.email?.trim().toLowerCase() === email) : undefined) ??
    (jiraName
      ? harvestUsers.find((u) => harvestDisplayName(u).trim().toLowerCase() === jiraName)
      : undefined);

  if (harvestMatch) {
    const existingByHarvest = await getUserMapByHarvestId(harvestMatch.id);
    if (existingByHarvest) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("project_anchor_user_maps")
        .update({
          jira_account_id: jiraAccountId,
          jira_email: jiraUser.emailAddress ?? existingByHarvest.jira_email,
          jira_display_name: jiraUser.displayName ?? existingByHarvest.jira_display_name,
          harvest_email: harvestMatch.email ?? existingByHarvest.harvest_email,
          harvest_display_name: harvestDisplayName(harvestMatch),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingByHarvest.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return mapRow(data as Record<string, unknown>);
    }
  }

  const supabase = createAdminClient();
  const payload = {
    jira_account_id: jiraAccountId,
    jira_email: jiraUser.emailAddress ?? existingByJira?.jira_email ?? null,
    jira_display_name: jiraUser.displayName ?? existingByJira?.jira_display_name ?? null,
    harvest_user_id: harvestMatch?.id ?? existingByJira?.harvest_user_id ?? null,
    harvest_email: harvestMatch?.email ?? existingByJira?.harvest_email ?? null,
    harvest_display_name: harvestMatch
      ? harvestDisplayName(harvestMatch)
      : existingByJira?.harvest_display_name ?? null,
    mapped_by: harvestMatch ? "email_auto" : existingByJira?.mapped_by ?? "email_auto",
    updated_at: new Date().toISOString(),
  };

  if (existingByJira) {
    const { data, error } = await supabase
      .from("project_anchor_user_maps")
      .update(payload)
      .eq("id", existingByJira.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const mapped = mapRow(data as Record<string, unknown>);
    if (!mapped.harvest_user_id) {
      throw new SyncError(
        `No Harvest person matched ${jiraUser.displayName || email || "this Jira user"}` +
          (email ? ` (${email})` : ". Confirm they exist in Harvest with the same email."),
        false
      );
    }
    return mapped;
  }

  const { data, error } = await supabase.from("project_anchor_user_maps").insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  const mapped = mapRow(data as Record<string, unknown>);
  if (!mapped.harvest_user_id) {
    throw new SyncError(
      `No Harvest person matched ${jiraUser.displayName || email || "this Jira user"}` +
        (email ? ` (${email})` : ". Confirm they exist in Harvest with the same email."),
      false
    );
  }
  return mapped;
}

export async function upsertDefaultRole(input: {
  harvest_user_id: number;
  harvest_email?: string | null;
  harvest_display_name?: string | null;
  default_harvest_task_name: string | null;
}): Promise<ProjectAnchorUserMap> {
  const supabase = createAdminClient();
  const existing = await getUserMapByHarvestId(input.harvest_user_id);
  const payload = {
    harvest_user_id: input.harvest_user_id,
    harvest_email: input.harvest_email ?? existing?.harvest_email ?? null,
    harvest_display_name: input.harvest_display_name ?? existing?.harvest_display_name ?? null,
    default_harvest_task_name: input.default_harvest_task_name,
    mapped_by: "manual" as const,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await supabase
      .from("project_anchor_user_maps")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapRow(data as Record<string, unknown>);
  }

  const { data, error } = await supabase.from("project_anchor_user_maps").insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  return mapRow(data as Record<string, unknown>);
}
