import { auth } from "@/auth";
import { buildResourcePlanningProjectContext } from "@/lib/gemini/summary";
import { resourcePlanningProjectExists } from "@/lib/resource-planning-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const projectName = decodeURIComponent((await params).name);
  if (!projectName) return NextResponse.json({ error: "Project name required" }, { status: 400 });

  const supabase = createAdminClient();
  if (!(await resourcePlanningProjectExists(supabase, projectName))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Gemini API key not set. Answers require GEMINI_API_KEY." },
      { status: 503 }
    );
  }

  const { data: project } = await supabase
    .from("resource_planning_projects")
    .select("project_name, display_title, harvest_project_ids, jira_project_keys")
    .eq("project_name", projectName)
    .maybeSingle();

  const row = project ?? {
    project_name: projectName,
    display_title: null,
    harvest_project_ids: [],
    jira_project_keys: [],
  };

  const { contextParts } = await buildResourcePlanningProjectContext(supabase, projectName, row, userId);
  if (contextParts.length === 0) {
    return NextResponse.json({
      answer: "Add Jira boards, meeting recordings, or PDFs in Project Context below, then ask again.",
    });
  }

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are a project management assistant. Answer the user's question using ONLY the following context. Do not use external knowledge. If the answer is not in the context, say so. Prefer and weight information from more recent sources (newer PDFs, meeting recordings, and Jira updates) over older ones.

Context (newest first):
---
${contextParts.join("\n\n")}
---

User question: ${question}

Give a concise, direct answer in plain text.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return NextResponse.json({ answer: text?.trim() ?? "No answer could be generated." });
}
