# Valtira PM – Roadmap

## Release 1: Core (before first production deploy)

**Goal:** Finish core functionality, push to GitHub, deploy to Vercel (pm.valtira.net), then update OAuth URLs.

### Core areas to complete (pick/order as needed)

1. **Approval flow**  
   - Reports can be draft → approved → sent.  
   - Optional: email when a report is ready for approval; optional “approve” link in email or in-app only.

2. **Invite PMs**  
   - Team page: super admin adds PMs by email.  
   - Invite flow (email invite, sign-up/sign-in with Google so they become non–super-admin users).

3. **Automations**  
   - Already in place: create automations (weekly/monthly, title, requires approval, Central time).  
   - Optional: cron/worker that actually runs on schedule and creates (and optionally sends) reports based on active automations.

### After deploy (pm.valtira.net)

- **OAuth URLs**  
  Update redirect/callback URLs in:
  - Google OAuth (NextAuth): add `https://pm.valtira.net/api/auth/callback/google` (and any other NextAuth callbacks).
  - Harvest OAuth: add `https://pm.valtira.net/api/auth/callback/harvest`.
  - Jira/Atlassian OAuth: add `https://pm.valtira.net/api/auth/callback/jira`.  
  Set `NEXTAUTH_URL` (or `AUTH_URL`) in Vercel to `https://pm.valtira.net`.

- **Resend DNS**  
  Add Resend’s DNS records for your sending domain so report emails work (see README launch checklist).

---

## Release 2: Context & intelligence (later)

After Release 1 is live and stable:

- Uploading contextual documents (per project).
- Determining mood (e.g. from documents or inputs).
- Creating project summaries.
- Chat functionality (e.g. project-level or global).

These are explicitly out of scope for Release 1.
