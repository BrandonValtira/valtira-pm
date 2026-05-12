# Vercel environment variables for production

Set these in **Vercel → Your Project → Settings → Environment Variables**. Use **Production** (and optionally Preview) as needed.

---

## Just want emails to go out?

You **don’t need new env vars** for report/approval/client emails. They’re sent from your Gmail via the same Google account you use to sign in.

1. **Use the same env vars you already have** (Supabase, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `SUPER_ADMIN_EMAIL`). If the app runs locally, copy those into Vercel.
2. **Google OAuth client:** In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → your OAuth client → make sure **Gmail API** is enabled for the project (APIs & Services → Enable APIs → Gmail API) and that your OAuth consent screen includes the **Gmail send** scope (e.g. `https://www.googleapis.com/auth/gmail.send`). If you already connected Google in Settings and sent mail locally, you’re good.
3. **Production redirect:** Add `https://YOUR-VERCEL-URL.vercel.app/api/auth/callback/google` (and `/api/auth/callback/drive`) to that same OAuth client’s redirect URIs so “Connect Google” works after deploy.
4. **After deploy:** Open the live app → **Settings** → connect Google if it isn’t already. Emails go out from that account.

No Resend, no CRON_SECRET, no extra keys—just deploy and connect Google in the prod app.

---

## Required (app won’t work without these)

| Variable | Description | Where to get it |
|----------|-------------|------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous (public) key | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) | Same as above. **Keep secret.** |
| `AUTH_SECRET` | Secret for NextAuth session signing | Generate: `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` | Google OAuth 2.0 Client ID | Google Cloud Console → APIs & Services → Credentials |
| `AUTH_GOOGLE_SECRET` | Google OAuth 2.0 Client secret | Same as above |
| `SUPER_ADMIN_EMAIL` | Email of the super admin (can add PMs, etc.) | Your email (e.g. `you@valtira.net`) |

**Google OAuth (production):** In Google Cloud Console, add these **Authorized redirect URIs** for your OAuth client:

- `https://YOUR_VERCEL_DOMAIN/api/auth/callback/google`
- `https://YOUR_VERCEL_DOMAIN/api/auth/callback/drive`
- `https://YOUR_VERCEL_DOMAIN/api/auth/callback/harvest` (if using Harvest)
- `https://YOUR_VERCEL_DOMAIN/api/auth/callback/jira` (if using Jira)

Replace `YOUR_VERCEL_DOMAIN` with your actual Vercel URL (e.g. `your-app.vercel.app`) or custom domain.  
Ensure the OAuth client has **Gmail send** scope if you use report emails from Gmail (users connect Google in Settings).

---

## Cron (scheduled report automations)

| Variable | Description |
|----------|-------------|
| `CRON_SECRET` | Secret token for the cron endpoint. Generate: `openssl rand -base64 32`. In Vercel Cron, set the job to send `Authorization: Bearer YOUR_CRON_SECRET`. |

Without this, `/api/cron/run-automations` will return 401. With it, Vercel Cron can call that route on schedule (e.g. hourly).

---

## Optional (per feature)

| Variable | Description | When to set |
|----------|-------------|-------------|
| `HARVEST_CLIENT_ID` | Harvest OAuth client ID | If you use Harvest (time, reports) |
| `HARVEST_CLIENT_SECRET` | Harvest OAuth client secret | Same as above. Add redirect: `https://YOUR_DOMAIN/api/auth/callback/harvest` |
| `ATLASSIAN_CLIENT_ID` | Atlassian/Jira OAuth client ID | If you use Jira (boards, context) |
| `ATLASSIAN_CLIENT_SECRET` | Atlassian/Jira OAuth client secret | Same. Redirect: `https://YOUR_DOMAIN/api/auth/callback/jira` |
| `GEMINI_API_KEY` | Google AI Studio API key | If you want AI project summary (mood, budget, next steps). Get at https://aistudio.google.com/apikey |
| `RESEND_API_KEY` | Resend API key | Only for **invite emails** (inviting new PMs). Report emails use Gmail. https://resend.com/api-keys |
| `RESEND_FROM` | From address for Resend (e.g. `Valtira PM <pm@valtira.net>`) | Optional; default is `Valtira PM <onboarding@resend.dev>` |

---

## Optional (URLs)

Vercel sets `VERCEL_URL` automatically. The app derives the base URL from it, so you usually don’t need to set these. Set only if you use a custom domain and something is wrong with redirects or email links:

| Variable | Description |
|----------|-------------|
| `NEXTAUTH_URL` | Full app URL (e.g. `https://pm.yourdomain.com`) |
| `APP_URL` | Same idea; used as fallback for links in emails |

---

## Checklist before first deploy

1. [ ] All **Required** variables set in Vercel.
2. [ ] Google OAuth redirect URIs updated for your production domain.
3. [ ] `CRON_SECRET` set and wired in Vercel Cron (if you use automations).
4. [ ] Harvest/Jira redirect URIs updated if you use those integrations.
5. [ ] After deploy: connect Google in **Settings** (so report emails can send from your Gmail).
