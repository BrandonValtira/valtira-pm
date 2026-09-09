export const HARVEST_PROJECT_FIELD_LABEL = "Harvest Billing Project";
export const HARVEST_TASK_FIELD_LABEL = "Harvest Billing Task";

export function normalizeFieldName(name: string): string {
  return name.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function isHarvestProjectFieldName(name: string): boolean {
  const n = normalizeFieldName(name);
  if (n === "harvest billing project" || n === "harvest project") return true;
  return n.includes("harvest") && n.includes("billing") && n.includes("project");
}

export function isHarvestTaskFieldName(name: string): boolean {
  const n = normalizeFieldName(name);
  if (n === "harvest billing task" || n === "harvest task") return true;
  return n.includes("harvest") && n.includes("task") && !n.includes("project");
}

export function fieldIdFromNames(
  names: Record<string, string> | null | undefined,
  predicate: (name: string) => boolean
): string | null {
  if (!names) return null;
  for (const [id, name] of Object.entries(names)) {
    if (id && predicate(name)) return id;
  }
  return null;
}

export function customFieldNumericId(fieldId: string | null | undefined): string | null {
  return fieldId?.match(/^customfield_(\d+)$/)?.[1] ?? null;
}

export function jqlForHarvestProjectField(projectFieldId: string | null): string[] {
  const clauses: string[] = [];
  const numericId = customFieldNumericId(projectFieldId);
  if (numericId) clauses.push(`cf[${numericId}] is not EMPTY ORDER BY updated DESC`);
  clauses.push(`"${HARVEST_PROJECT_FIELD_LABEL}" is not EMPTY ORDER BY updated DESC`);
  clauses.push(`"Harvest Project" is not EMPTY ORDER BY updated DESC`);
  return [...new Set(clauses)];
}
