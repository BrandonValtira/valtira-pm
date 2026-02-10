#!/usr/bin/env node
/**
 * Merges Supabase local env vars (from `supabase status -o env`) into .env.local.
 * Run after `npx supabase start` when using local Supabase.
 * Preserves existing AUTH_* and SUPER_ADMIN_EMAIL.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const envLocalPath = path.join(__dirname, "..", ".env.local");
const supabaseKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function parseEnv(content) {
  const lines = content.split("\n").filter((line) => line.trim());
  const out = {};
  for (const line of lines) {
    const i = line.indexOf("=");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (value.startsWith('"') && value.endsWith('"'))
      value = value.slice(1, -1).replace(/\\"/g, '"');
    out[key] = value;
  }
  return out;
}

function formatEnv(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n";
}

let existing = {};
if (fs.existsSync(envLocalPath)) {
  existing = parseEnv(fs.readFileSync(envLocalPath, "utf8"));
}

let supabaseEnv;
try {
  const out = execSync("npx supabase status -o env", {
    encoding: "utf8",
    cwd: path.join(__dirname, ".."),
  });
  supabaseEnv = parseEnv(out);
} catch (e) {
  console.error("Run 'npx supabase start' first (Docker must be running).");
  process.exit(1);
}

const merged = { ...existing };
for (const key of supabaseKeys) {
  if (supabaseEnv[key]) merged[key] = supabaseEnv[key];
}

fs.writeFileSync(envLocalPath, formatEnv(merged));
console.log("Updated .env.local with Supabase local URLs and keys.");
console.log("Ensure AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, and SUPER_ADMIN_EMAIL are set.");
