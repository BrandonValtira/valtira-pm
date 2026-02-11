import { getHarvestAccess } from "@/lib/harvest-auth";
import { getHarvestProjectBudgetReport } from "@/lib/harvest";
import { getJiraAccess } from "@/lib/jira-auth";
import { getJiraRecentIssuesOAuth } from "@/lib/jira";
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

/** Build context parts (files, Jira, Harvest) for summary or Q&A. Newer items first. */
export async function buildProjectContext(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  projectId: string,
  project: ProjectRow,
  userId: string
): Promise<string[]> {
  const harvestIds = (project.harvest_project_ids ?? []) as number[];
  const jiraKeys = (project.jira_project_keys ?? []) as string[];
  const contextParts: string[] = [];
  const now = Date.now();

  const { data: files } = await supabase
    .from("project_files")
    .select("id, file_name, storage_path, file_type, uploaded_at")
    .eq("project_id", projectId)
    .order("uploaded_at", { ascending: false });

  const { data: driveIntegration } = await supabase
    .from("user_integrations")
    .select("access_token")
    .eq("user_id", userId)
    .eq("provider", "google_drive")
    .single();
  const driveToken = driveIntegration?.access_token ?? null;

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
      contextParts.push(meetContext);
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
      contextParts.push(pdfContext);
    }
  }

  // Jira recent activity (with token refresh)
  const jiraAccess = await getJiraAccess(userId);
  if (jiraKeys.length > 0 && jiraAccess) {
    try {
      const issues = await getJiraRecentIssuesOAuth(
        jiraAccess.cloudId,
        jiraAccess.accessToken,
        jiraKeys,
        25
      );
      if (issues.length > 0) {
        contextParts.push(
          "Recent Jira activity (newest first):\n" +
            issues
              .map(
                (i) =>
                  `- ${i.key}: ${i.summary} | Status: ${i.status} | Updated: ${(i.updated || "").slice(0, 10)}`
              )
              .join("\n")
        );
      } else {
        contextParts.push("[Jira: no recent issues found for the selected project keys.]");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      contextParts.push(`[Jira could not be loaded: ${msg.slice(0, 120)}.]`);
    }
  } else if (jiraKeys.length > 0) {
    contextParts.push("[Jira: connect in Settings or reconnect to refresh access.]");
  }

  // Harvest budget
  const harvest = await getHarvestAccess(userId);
  if (harvestIds.length > 0 && harvest) {
    try {
      const budgetReport = await getHarvestProjectBudgetReport(
        harvest.accountId,
        harvest.accessToken
      );
      const projectBudgets = budgetReport.filter((r) => harvestIds.includes(r.project_id));
      if (projectBudgets.length > 0) {
        const lines = projectBudgets.map(
          (r) =>
            `${r.project_name}: budget ${r.budget} hours, spent ${r.budget_spent.toFixed(1)}, remaining ${r.budget_remaining.toFixed(1)}`
        );
        contextParts.push("Harvest budget status:\n" + lines.join("\n"));
      }
    } catch {
      contextParts.push("[Harvest is linked but budget data could not be loaded.]");
    }
  }

  return contextParts;
}

/** Generate project summary (mood, budget, next steps) from context. No persistence. */
export async function generateProjectSummary(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  projectId: string,
  project: ProjectRow,
  userId: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  const contextParts = await buildProjectContext(supabase, projectId, project, userId);

  if (contextParts.length === 0) {
    return "Add Jira boards (project settings), Google Meet recordings, or PDFs (meeting notes, SOWs) in the panels on the right, then generate a summary to see project mood, budget status, and next steps.";
  }

  if (!apiKey?.trim()) {
    // Log only presence (not value) so Vercel logs can confirm env is set
    if (process.env.NODE_ENV === "production") {
      console.warn("[Gemini] GEMINI_API_KEY missing or empty in Production. Add it in Vercel → Settings → Environment Variables, enable Production, then redeploy.");
    }
    return [
      "Project: " + project.name,
      "",
      "Context gathered (Gemini API key not set; summary is placeholder). In Vercel: set GEMINI_API_KEY in Settings → Environment Variables for Production and redeploy, then regenerate.",
      ...contextParts,
      "",
      "Budget status: See Harvest budget section above if available.",
      "Next steps: Review Jira issues and any uploaded materials for action items.",
    ].join("\n");
  }

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are a project management assistant. Using ONLY the following context, produce a project summary for a PM preparing for a client meeting. The summary can be as long as needed to cover the context fully.

Context (prioritize newer information over older):
---
${contextParts.join("\n\n")}
---

You MUST use the context above. Include specifics from Jira (issues, boards, status), from additional materials (PDFs), and from Meet transcripts. Do not give a generic summary if the context contains concrete details.

Respond with exactly these four section headers on their own lines (no numbers, no colons): PROJECT MOOD, BUDGET STATUS, SUMMARY, NEXT STEPS. Use plain text, no markdown. Do not use asterisks or markdown for bullets—use plain text only.

PROJECT MOOD
One line only. Choose one: On track (green) | Needs attention (yellow) | At risk (red) | Unknown / insufficient context (gray). Base mood on the most recent info.

BUDGET STATUS
One line. Summarize Harvest budget if present; otherwise "No budget data in context."

SUMMARY
One or more paragraphs. Current state of the project using the context. Include stats or counts where relevant: e.g. how many PDFs or Meet transcripts, which Jira boards or recent issues. Weave in specifics from Jira, meeting transcripts, and uploaded materials. No indents.

NEXT STEPS
3–6 bullet points. Use a single leading dash or bullet character per line (e.g. "- " or "• "), not asterisks. Action items from transcripts, SOW/blockers from Jira, follow-ups.`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}
