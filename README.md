# Valtira PM

Project management and client reporting: Harvest hours, PDF reports, and email to clients. Built for Valtira PMs (max ~8 users).

## Stack

- **Next.js 14** (App Router), TypeScript, Tailwind
- **Supabase** – Postgres + Storage
- **NextAuth (Auth.js v5)** – Google sign-in, invite-only access
- **Super admin** – Add PMs by email; system emails sent from your Gmail (Phase 2)

## Setup

### 1. Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

- **Supabase**: Create a project at [supabase.com](https://supabase.com). In Project Settings → API you’ll find:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API → service_role, keep secret)
- **NextAuth**: Set `AUTH_SECRET` (e.g. `openssl rand -base64 32`). Create a Google OAuth client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and set `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
- **Super admin**: Set `SUPER_ADMIN_EMAIL` to your email. Only this user can sign in before any PMs are added, and only they can access the Team page and send system emails.

### 2. Database (choose one)

**Option A – Local Supabase (Docker required)**  
1. Start Docker Desktop.  
2. Run: `npm run supabase:start` (starts Postgres + Supabase locally and applies migrations).  
3. Run: `npm run supabase:env` (writes Supabase URL and keys into `.env.local`).  
4. Add `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and `SUPER_ADMIN_EMAIL` to `.env.local`.

**Option B – Hosted Supabase (no Docker)**  
1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard) (Sign in → New project).  
2. In the dashboard, open **SQL Editor** → New query, paste the contents of `supabase/schema.sql`, and run it.  
3. In **Project Settings → API**, copy the Project URL, `anon` key, and `service_role` key into `.env.local` as `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

### 3. Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with the Google account that matches `SUPER_ADMIN_EMAIL`. You’ll be created as `super_admin` and can use **Dashboard → Team** (next phase: add PMs by email and invite flow).

### 4. Phase 2 schema (Jira + integrations)

If you already ran the initial `supabase/schema.sql`, run the second migration so projects can store Jira keys and user_integrations can store Jira:

1. In Supabase **SQL Editor**, open and run the contents of `supabase/migrations/20250209100000_add_jira_and_integrations.sql`.

## Phase 2 (current)

- **Settings** → Connect **Harvest** (Personal Access Token + Account ID) and **Jira** (site URL, email, API token).
- **Add project** → Name, select Harvest projects (for hours), client emails (report recipients), and optional Jira project keys (for context/knowledge).
- Project detail page shows linked Harvest IDs, Jira keys, and recipients.
- API: `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/[id]`, `GET /api/integrations/harvest/projects`, `GET /api/integrations/jira/projects`.

Reports + PDF send (Resend) are done. Next for Release 1: approval flow, invite PMs, automations runner (see ROADMAP.md).

## Roadmap

See **[ROADMAP.md](./ROADMAP.md)** for Release 1 (core: approval flow, invite PMs, automations → GitHub → Vercel → OAuth URLs) and Release 2 (contextual documents, mood, summaries, chat).

## Launch checklist (Vercel + pm.valtira.net)

**→ Full list of Vercel env vars:** **[docs/vercel-environment-variables.md](./docs/vercel-environment-variables.md)**

When you deploy to Vercel and point the app to **pm.valtira.net** (or your domain):

- **OAuth – redirect/callback URLs**  
  Add production URLs to each OAuth app so sign-in and integrations work:
  - **Google (NextAuth):** add `https://pm.valtira.net/api/auth/callback/google` (and any other NextAuth providers you use). Set `NEXTAUTH_URL` (or `AUTH_URL`) in Vercel to `https://pm.valtira.net`.
  - **Harvest:** add `https://pm.valtira.net/api/auth/callback/harvest`. If you see “This page isn’t working – id.getharvest.com sent an invalid response”, the redirect URL in [Harvest Developers](https://id.getharvest.com/developers) must match exactly (https, no trailing slash).
  - **Jira/Atlassian:** add `https://pm.valtira.net/api/auth/callback/jira`.

- **Resend (optional – invite emails only)**  
  Report/approval emails are sent from the PM’s Gmail. Resend is only used for **invite emails** (inviting new PMs). If you use that, set `RESEND_API_KEY` (and optionally `RESEND_FROM`) in Vercel and add Resend’s DNS records for your from-domain so invites don’t land in spam.
