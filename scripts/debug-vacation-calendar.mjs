#!/usr/bin/env node
/**
 * Debug vacation calendar: env, Google token, Calendar API events, name matching.
 * Usage: node scripts/debug-vacation-calendar.mjs [weekStart] [weekEnd]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const env = {
  ...parseEnvFile(path.join(root, ".env")),
  ...parseEnvFile(path.join(root, ".env.local")),
};
for (const [k, v] of Object.entries(env)) {
  if (v !== undefined) process.env[k] = v;
}

const calendarId = process.env.GOOGLE_VACATION_CALENDAR_ID?.trim();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const superEmail =
  process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ||
  process.env.AUTH_SUPER_ADMIN_EMAIL?.trim().toLowerCase();

const weekStart = process.argv[2] ?? "2026-05-17";
const weekEnd = process.argv[3] ?? "2026-06-07";

console.log("GOOGLE_VACATION_CALENDAR_ID:", calendarId ? `${calendarId.slice(0, 20)}...` : "(missing)");
console.log("SUPER_ADMIN_EMAIL:", superEmail ?? "(not set)");
console.log("Range:", weekStart, "→", weekEnd);

if (!calendarId || !supabaseUrl || !serviceKey) {
  console.error("Missing calendar id or Supabase env.");
  process.exit(1);
}

async function supabaseGet(table, query) {
  const url = `${supabaseUrl}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

async function refreshGoogleToken(integration) {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!integration.refresh_token || !clientId || !clientSecret) return integration.access_token;
  const expiresAt = integration.expires_at ? new Date(integration.expires_at).getTime() : 0;
  if (Date.now() < expiresAt - 5 * 60 * 1000) return integration.access_token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: integration.refresh_token,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

const admins = await supabaseGet("users", "select=id,email,role,status&role=eq.super_admin&status=eq.active");
const admin = superEmail
  ? admins.find((a) => a.email?.trim().toLowerCase() === superEmail)
  : admins[0];
if (!admin) {
  console.error("No active super_admin user found.");
  process.exit(1);
}
console.log("Super admin:", admin.email, admin.id);

const integrations = await supabaseGet(
  "user_integrations",
  `select=access_token,refresh_token,expires_at&user_id=eq.${admin.id}&provider=eq.google_drive`
);
const integration = integrations[0];
if (!integration?.access_token) {
  console.error("Super admin has no google_drive integration. Reconnect Google in Settings.");
  process.exit(1);
}
console.log("Google integration: yes");

let accessToken;
try {
  accessToken = await refreshGoogleToken(integration);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const timeMin = new Date(weekStart + "T00:00:00Z").toISOString();
const timeMax = new Date(weekEnd + "T12:00:00Z");
timeMax.setUTCDate(timeMax.getUTCDate() + 1);
const calUrl = new URL(
  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
);
calUrl.searchParams.set("timeMin", timeMin);
calUrl.searchParams.set("timeMax", timeMax.toISOString());
calUrl.searchParams.set("singleEvents", "true");
calUrl.searchParams.set("maxResults", "50");
calUrl.searchParams.set("orderBy", "startTime");

const calRes = await fetch(calUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
const calText = await calRes.text();
if (!calRes.ok) {
  console.error("Calendar API error:", calRes.status, calText.slice(0, 400));
  process.exit(1);
}
const calData = JSON.parse(calText);
const items = calData.items ?? [];
console.log("\nCalendar events in range:", items.length);
function personFromSummary(summary) {
  let s = (summary ?? "").trim();
  if (!s) return "";
  const dashParts = s.split(/\s+[-–—]\s+/);
  if (dashParts.length > 1 && dashParts[0]?.trim()) return dashParts[0].trim();
  return s.replace(/[-–—]?\s*(ooo|pto|out\s*of\s*office|vacation|000)\s*$/i, "").trim();
}

for (const ev of items.slice(0, 15)) {
  const start = ev.start?.date ?? ev.start?.dateTime ?? "?";
  const person = personFromSummary(ev.summary);
  console.log(`  - ${JSON.stringify(ev.summary ?? "(no title)")} → "${person}" | ${start}`);
}
if (items.length > 15) console.log(`  ... and ${items.length - 15} more`);

const allocRows = await supabaseGet(
  "resource_planning_allocations",
  `select=resource_name&week_start=gte.${weekStart.slice(0, 4)}-01-01`
);
const resourceNames = [...new Set(allocRows.map((r) => r.resource_name).filter(Boolean))].sort();
console.log("\nAllocation resource names:", resourceNames.length);
console.log(resourceNames.slice(0, 10).join(", ") + (resourceNames.length > 10 ? "..." : ""));

const brandonRes = resourceNames.find((n) => /brandon/i.test(n));
if (brandonRes) {
  const calNames = items.map((ev) => personFromSummary(ev.summary)).filter(Boolean);
  const brandonEvents = items.filter((ev) => /brandon/i.test(personFromSummary(ev.summary)));
  console.log("\nBrandon resource name:", brandonRes);
  console.log("Brandon calendar events:", brandonEvents.length);
  for (const ev of brandonEvents) {
    const start = ev.start?.date ?? ev.start?.dateTime?.slice(0, 10);
    const d = new Date((start ?? "") + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    const ws = d.toISOString().slice(0, 10);
    console.log(`  week_start ${ws} (event ${start}) summary: ${ev.summary}`);
  }
}
