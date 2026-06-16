type SegmentInput = {
  displayName: string;
  hours: number;
  percent: number;
  notes: string[];
};

/** One sentence per ticket project for Budget Allocation reports. */
export async function generateBudgetAllocationSummaries(
  segments: SegmentInput[],
  periodLabel: string
): Promise<Record<string, string>> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const out: Record<string, string> = {};

  if (!apiKey || segments.length === 0) return out;

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const lines = segments.map((s) => {
    const noteSample = s.notes.slice(0, 12).join(" | ") || "(no notes)";
    return `- ${s.displayName} (${s.percent.toFixed(0)}% of hours, ${s.hours.toFixed(1)}h): ${noteSample}`;
  });

  const prompt = `You write brief client-facing report summaries for a software consultancy.

Period: ${periodLabel}

For each ticket project below, write exactly ONE sentence summarizing the main work themes from the time-entry notes. Be specific but concise (client-ready). Do not invent facts not supported by the notes.

Projects:
${lines.join("\n")}

Respond with one line per workstream in this exact format (no bullets, no numbering):
WORKSTREAM_NAME :: one sentence summary

Use the workstream name exactly as shown before the parenthesis.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      const sep = trimmed.indexOf("::");
      if (sep <= 0) continue;
      const name = trimmed.slice(0, sep).trim();
      const summary = trimmed.slice(sep + 2).trim();
      if (name && summary) out[name] = summary;
    }
  } catch {
    // Caller falls back to note-based summaries
  }

  return out;
}
