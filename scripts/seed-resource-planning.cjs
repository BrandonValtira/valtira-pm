#!/usr/bin/env node
/**
 * Seed resource_planning_allocations from data/resource-planning-2026.csv
 * Run: npm run seed-resource-planning
 */
const fs = require("fs");
const path = require("path");
try {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    });
  }
} catch {}
const { createClient } = require("@supabase/supabase-js");

const csvPath = path.join(__dirname, "..", "data", "resource-planning-2026.csv");
if (!fs.existsSync(csvPath)) {
  console.error("Missing data/resource-planning-2026.csv");
  process.exit(1);
}

function parseCSVLine(line) {
  return line.split(",").map((s) => s.trim());
}

function parseMMDDYYYY(s) {
  const t = String(s).trim();
  if (!t || t.length < 8) return null;
  const parts = t.split(/[-/]/);
  if (parts.length !== 3) return null;
  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2020) return null;
  const date = new Date(year, month - 1, day);
  return date.toISOString().slice(0, 10);
}

function parseFte(val) {
  const s = String(val).trim();
  if (s === "" || s === "-") return null;
  const n = parseFloat(s.replace(",", "."));
  if (Number.isNaN(n) || n < 0) return null;
  return Math.min(1, n);
}

const csv = fs.readFileSync(csvPath, "utf-8");
const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
const header = parseCSVLine(lines[0]);
const weekDates = [];
for (let i = 4; i < header.length; i++) {
  const d = parseMMDDYYYY(header[i]);
  if (d) weekDates.push({ colIndex: i, weekStart: d });
}

const oneYearAgo = new Date();
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
const minWeek = oneYearAgo.toISOString().slice(0, 10);

const allocations = [];
let currentProject = "";

for (let r = 4; r < lines.length; r++) {
  const cells = parseCSVLine(lines[r]);
  const projectCell = (cells[0] || "").trim();
  const role = (cells[1] || "").trim();
  const name = (cells[2] || "").trim();
  if (projectCell) currentProject = projectCell;
  if (!name || !role) continue;
  const project = currentProject || projectCell;
  if (!project) continue;
  for (const { colIndex, weekStart } of weekDates) {
    if (weekStart < minWeek) continue;
    const val = cells[colIndex];
    const fte = parseFte(val);
    if (fte == null) continue;
    allocations.push({
      resource_name: name,
      role,
      project_name: project,
      week_start: weekStart,
      fte,
    });
  }
}

console.log(`Parsed ${allocations.length} allocations (weeks >= ${minWeek})`);
if (allocations.length === 0) {
  console.log("Nothing to insert.");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local)");
  process.exit(1);
}

const supabase = createClient(url, key);
const BATCH = 200;
(async () => {
  for (let i = 0; i < allocations.length; i += BATCH) {
    const batch = allocations.slice(i, i + BATCH);
    const { error } = await supabase
      .from("resource_planning_allocations")
      .upsert(batch, { onConflict: "resource_name,role,project_name,week_start" });
    if (error) {
      console.error("Insert error:", error.message);
      process.exit(1);
    }
    console.log(`Inserted ${Math.min(i + BATCH, allocations.length)}/${allocations.length}`);
  }
  console.log("Done.");
})();
