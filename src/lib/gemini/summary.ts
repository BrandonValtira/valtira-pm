import { getGoogleAccessToken } from "@/lib/google-auth";
import { getHarvestAccess } from "@/lib/harvest-auth";
import { getHarvestProjectBudgetReport } from "@/lib/harvest";
import { getJiraAccess } from "@/lib/jira-auth";
import { getJiraDoneLastMonthOAuth, getJiraRecentIssuesOAuth } from "@/lib/jira";
import { extractPdfText } from "@/lib/pdf-text";

const BUCKET = "project-files";
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const MAX_PDF_CHARS = 18000;
const MAX_MEET_RECORDING_CHARS = 18000;

/** Fetch Google Doc body as plain text using Drive export (user's token). */
async function fetchDriveDocText(
  accessToken: string,
  driveFileId: string
): Promise<string | null> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}/export?mimeType=text/plain`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  return res.text();
}

type ProjectRow = {
  id: string;
  name: string;
  harvest_project_ids: number[] | null;
  jira_project_keys: string[] | null;
};

export type BuildProjectContextResult = {
  contextParts: string[];
  /** True when project has Jira keys but Jira returned no data (no access, API error, or zero issues). */
  jiraReturnedNothing: boolean;
};

/** Build context parts (files, Jira, Harvest) for summary or Q&A. Newer items first. */
export async function buildProjectContext(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  projectId: string,
  project: ProjectRow,
  userId: string
): Promise<BuildProjectContextResult> {
  const harvestIds = (project.harvest_project_ids ?? []) as number[];
  const jiraKeys = (project.jira_project_keys ?? []) as string[];
  const now = Date.now();
  const googleParts: string[] = [];
  const materialParts: string[] = [];
  let jiraSection = "";
  let harvestSection = "";
  let jiraReturnedNothing = false;

  const { data: files } = await supabase
    .from("project_files")
    .select("id, file_name, storage_path, file_type, uploaded_at")
    .eq("project_id", projectId)
    .order("uploaded_at", { ascending: false });

  const driveToken = await getGoogleAccessToken(userId);

  for (const f of files ?? []) {
    const uploadedAt = new Date(f.uploaded_at).getTime();
    if (f.file_type === "meet_recording" && now - uploadedAt > SIXTY_DAYS_MS) continue;
    if (f.file_type === "meet_recording") {
      let meetContext = `[Meeting recording: "${f.file_name}" (${f.uploaded_at})]`;
      if (driveToken) {
        try {
          const text = await fetchDriveDocText(driveToken, f.storage_path);
          if (text) {
            const excerpt =
              text.length > MAX_MEET_RECORDING_CHARS
                ? text.slice(0, MAX_MEET_RECORDING_CHARS) + "\n[... truncated]"
                : text;
            meetContext += "\n" + excerpt;
          }
        } catch {
          meetContext += "\n(Text could not be loaded from Drive.)";
        }
      }
      googleParts.push(meetContext);
    }
    if (f.file_type === "pdf_note") {
      let pdfContext = `[PDF: "${f.file_name}" (uploaded ${f.uploaded_at})]`;
      try {
        const { data: blob, error: downloadError } = await supabase.storage
          .from(BUCKET)
          .download(f.storage_path);
        if (downloadError) {
          pdfContext += `\n(Storage error: ${downloadError.message})`;
        } else if (blob) {
          const buffer = Buffer.from(await blob.arrayBuffer());
          const text = await extractPdfText(buffer);
          if (text) {
            const excerpt = text.length > MAX_PDF_CHARS ? text.slice(0, MAX_PDF_CHARS) + "\n[... truncated]" : text;
            pdfContext += "\n" + excerpt;
          } else {
            pdfContext += "\n(Text could not be extracted or PDF is empty.)";
          }
        } else {
          pdfContext += "\n(File not found in storage.)";
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        pdfContext += `\n(Text could not be extracted: ${msg.slice(0, 80)}.)`;
      }
      materialParts.push(pdfContext);
    }
  }

  const jiraAccess = await getJiraAccess(userId);
  if (jiraKeys.length > 0 && !jiraAccess) {
    console.warn("[Jira context] Project has jira keys but no access:", { jiraKeys, userId: userId.slice(0, 8) });
    jiraSection = "[Jira: connect in Settings or reconnect to refresh access.]";
    jiraReturnedNothing = true;
  } else if (jiraKeys.length > 0 && jiraAccess) {
    try {
      let doneLastMonth: Awaited<ReturnType<typeof getJiraDoneLastMonthOAuth>> = [];
      const recent = await getJiraRecentIssuesOAuth(jiraAccess.cloudId, jiraAccess.accessToken, jiraKeys, 25);
      try {
        doneLastMonth = await getJiraDoneLastMonthOAuth(jiraAccess.cloudId, jiraAccess.accessToken, jiraKeys, 50);
      } catch (doneErr) {
        const doneMsg = doneErr instanceof Error ? doneErr.message : String(doneErr);
        console.warn("[Jira context] Done-in-last-month query failed (using recent only):", doneMsg.slice(0, 200));
      }
      if (doneLastMonth.length === 0 && recent.length === 0) {
        console.warn("[Jira context] No issues returned for keys:", jiraKeys);
        jiraReturnedNothing = true;
      }
      const doneLines = doneLastMonth.length > 0
        ? "Issues moved to Done in the past 30 days:\n" +
          doneLastMonth.map((i) => `- ${i.key}: ${i.summary} | Updated: ${(i.updated || "").slice(0, 10)}`).join("\n")
        : "(No issues moved to Done in the past 30 days.)";
      const recentLines = recent.length > 0
        ? "Recent activity (all statuses):\n" +
          recent.map((i) => `- ${i.key}: ${i.summary} | Status: ${i.status} | Updated: ${(i.updated || "").slice(0, 10)}`).join("\n")
        : "";
      jiraSection = doneLines + (recentLines ? "\n\n" + recentLines : "");
      if (recent.length === 0 && doneLastMonth.length === 0) {
        jiraSection += "\n(No issues found for project keys: " + jiraKeys.join(", ") + ". Check that these match your Jira board keys.)";
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[Jira context] API error:", msg);
      jiraSection = `[Jira could not be loaded: ${msg.slice(0, 120)}.]`;
      jiraReturnedNothing = true;
    }
  }

  const harvest = await getHarvestAccess(userId);
  if (harvestIds.length > 0 && harvest) {
    try {
      const budgetReport = await getHarvestProjectBudgetReport(
        harvest.accountId,
        harvest.accessToken
      );
      const projectBudgets = budgetReport.filter((r) => harvestIds.includes(r.project_id));
      if (projectBudgets.length > 0) {
        harvestSection = projectBudgets
          .map(
            (r) =>
              `${r.project_name}: budget ${r.budget} hours, spent ${r.budget_spent.toFixed(1)}, remaining ${r.budget_remaining.toFixed(1)}`
          )
          .join("\n");
      }
    } catch {
      harvestSection = "[Harvest is linked but budget data could not be loaded.]";
    }
  }

  const contextParts: string[] = [];
  if (googleParts.length > 0) contextParts.push("=== GOOGLE TRANSCRIPTS ===\n" + googleParts.join("\n\n"));
  if (materialParts.length > 0) contextParts.push("=== ADDITIONAL MATERIALS ===\n" + materialParts.join("\n\n"));
  if (jiraSection) contextParts.push("=== JIRA ===\n" + jiraSection);
  if (harvestSection) contextParts.push("=== HARVEST BUDGET ===\n" + harvestSection);
  return { contextParts, jiraReturnedNothing };
}

export type GenerateProjectSummaryResult = {
  summary: string;
  jiraReturnedNothing: boolean;
};

/** Generate project summary (mood, budget, next steps) from context. No persistence. */
export async function generateProjectSummary(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  projectId: string,
  project: ProjectRow,
  userId: string
): Promise<GenerateProjectSummaryResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const { contextParts, jiraReturnedNothing } = await buildProjectContext(supabase, projectId, project, userId);

  if (contextParts.length === 0) {
    return {
      summary: "Add Jira boards (project settings), Google Meet recordings, or PDFs (meeting notes, SOWs) in the panels on the right, then generate a summary to see project mood, budget status, and next steps.",
      jiraReturnedNothing: false,
    };
  }

  if (!apiKey?.trim()) {
    // Log only presence (not value) so Vercel logs can confirm env is set
    if (process.env.NODE_ENV === "production") {
      console.warn("[Gemini] GEMINI_API_KEY missing or empty in Production. Add it in Vercel → Settings → Environment Variables, enable Production, then redeploy.");
    }
    return {
      summary: [
        "Project: " + project.name,
        "",
        "Context gathered (Gemini API key not set; summary is placeholder). In Vercel: set GEMINI_API_KEY in Settings → Environment Variables for Production and redeploy, then regenerate.",
        ...contextParts,
        "",
        "Budget status: See Harvest budget section above if available.",
        "Next steps: Review Jira issues and any uploaded materials for action items.",
      ].join("\n"),
      jiraReturnedNothing,
    };
  }

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are a project management assistant. Using ONLY the context below, write a CONCISE project summary for a PM before a client meeting.

Rules: Be brief. Summarize only the most important information. Do NOT regurgitate or list everything. One to three sentences per section is enough.

Context:
---
${contextParts.join("\n\n")}
---

Respond with exactly these section headers on their own lines (no numbers, no colons after the header). Put PROJECT MOOD first.

PROJECT MOOD
One line only. Choose one: On track (green) | Needs attention (yellow) | At risk (red) | Unknown / insufficient context (gray).

GOOGLE TRANSCRIPTS
1–3 sentences. Key points from meeting transcripts only. If no transcripts, say "No meeting transcripts in context."

ADDITIONAL MATERIALS
1–3 sentences. Key points from PDFs/uploaded materials only. If none, say "No additional materials in context."

JIRA
1–3 sentences. Focus on tickets moved to Done in the past month: count and 1–2 notable items. Do not list every ticket. If no Jira data, say "No Jira data in context."

NEXT STEPS
3–5 brief bullet points. Use a single leading dash per line (e.g. "- "). Action items only.`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();
  if (!text) throw new Error("Empty response from Gemini");
  return { summary: text, jiraReturnedNothing };
}
