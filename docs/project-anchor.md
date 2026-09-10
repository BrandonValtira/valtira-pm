# Project Anchor

Project Anchor syncs **native Jira worklogs** into Harvest for issues that have a Harvest Billing Project. It lives in Valtira PM (Vercel Functions + Supabase). Issues without that field are ignored so the existing Harvest Jira plugin can keep serving unmanaged tickets.

## Architecture

```
Jira worklog webhook
        → /api/time-entry/jira-webhook
        → Project Anchor (Supabase)
        → Harvest time entry
```

Jira is the source of truth for managed tickets. The Time Entry dashboard reads totals from the Project Anchor database, not from Harvest on every page load.

Do **not** log time with the Harvest Jira plugin on managed tickets. If that still happens, Project Anchor detects the existing Harvest entry, **links it instead of creating a second bill**, and flags leftover extras as possible double billing.

## Jira configuration

Uses the **Jira connection in Settings** (same OAuth as the rest of Valtira PM). No separate Jira API token.

1. Create a short-text custom field **Harvest Billing Project**. Value = Harvest **project code** (today: `VL906`). Empty = ignore the issue (Harvest plugin still owns those tickets).
2. Optional: **Harvest Billing Task**. When set, every worklog on the issue uses that Harvest task.
3. Put the project field on any issue that should sync. CS-106 is the first test ticket, not a special case in code.
4. Time Entry **Sync from Jira** (and the 15-minute cron) finds every issue where that field is set and pulls recent worklogs.

Optional webhook (Jira admin → System → Webhooks) for faster updates:
- Events: Worklog created, updated, deleted
- URL: `https://pm.valtira.net/api/time-entry/jira-webhook?token=<CRON_SECRET or JIRA_WEBHOOK_SECRET>`

## Harvest configuration

Project Anchor uses the Harvest account already connected in **Settings** (super admin first, same as Resource Planning). Optional dedicated `HARVEST_ACCOUNT_ID` / `HARVEST_ACCESS_TOKEN` override that if set.

Creating time for other people requires the connected Harvest user to be an **Administrator**. MVP writes only to project code **VL906**.

## Harvest task resolution

Per worklog, in order:

1. Comment tag, e.g. `[UX]`, `[Dev]`, `[PM]`
2. Issue field Harvest Billing Task
3. User mapping default task
4. Otherwise the sync fails and shows on Time Entry for an admin to map

## User mapping

The Time Entry **People** list is Harvest employees and contractors. Pick a default Harvest role for each person. Roles are the company-standard Harvest tasks (Application Developer, Back-End Developer, Front End Developer, DevOps Engineer, DevOps Lead, Project Manager, QA Analyst, Technical Architect, UI/UX Designer) — not the full Harvest task catalog, and not a per-project list. Sync still resolves that name against whichever Harvest project the Jira issue bills to.

Jira is the company site — nobody needs a Jira account ID. On first worklog, Project Anchor matches the Jira user to Harvest by **email** and uses that person’s default role.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `JIRA_HARVEST_PROJECT_FIELD_ID` | Optional override if the field is not named Harvest Billing Project |
| `JIRA_HARVEST_TASK_FIELD_ID` | Optional Harvest Billing Task field id |
| `JIRA_WEBHOOK_SECRET` | Optional webhook secret (falls back to `CRON_SECRET`) |
| `HARVEST_ALLOWED_PROJECT_CODES` | Codes we may write; default `VL906` |

Never commit secrets. Set Production / Preview / Development separately in Vercel.

## Data model

- `project_anchor_entries` — one row per Jira worklog (`jira_worklog_id` unique)
- `project_anchor_user_maps` — Jira account → Harvest user + default task
- `project_anchor_sync_state` — last webhook / Harvest / reconcile timestamps

## Local development

Webhooks need a public HTTPS URL. Use a preview/production deploy, or a tunnel to `npm run dev`. Apply `supabase/migrations/20260909120000_project_anchor.sql` (already in `schema.sql`).

## Deployment

Same Valtira PM Vercel project and GitHub repo. Cron: `*/15 * * * *` → `/api/cron/project-anchor-reconcile`. Node 22 (`engines.node`).

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| Worklog ignored | Harvest Billing Project empty on the issue |
| Failed: project not allowed | Code is not `VL906` (or not in `HARVEST_ALLOWED_PROJECT_CODES`) |
| Failed: no Harvest user | Email hidden in Jira, or emails differ — set a manual mapping |
| Failed: no Harvest task | Add `[TaskName]`, issue task field, or user default task |
| Double bill row | Harvest plugin also wrote time — **Remove extra Harvest entry** |
| Locked row | Harvest timesheet is locked (month close or offboarded person). Project Anchor does not create, update, or delete that time. Unlock in Harvest, then Retry. |
| Webhook 401 | HMAC secret mismatch, or add `?token=` for UI webhooks |

## Ownership

Valtira PM engineers. Feature code: `src/lib/project-anchor/`, `src/app/dashboard/time-entry/`, `src/app/api/time-entry/`.
