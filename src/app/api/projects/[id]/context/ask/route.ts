import { auth } from "@/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { buildProjectContext } from "@/lib/gemini/summary";

async function getProjectAndCheckOwner(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
  userId: string
) {
  const { data } = await supabase
    .from("projects")
    .select("id, name, harvest_project_ids, jira_project_keys")
    .eq("id", projectId)
    .eq("owner_user_id", userId)
    .single();
  return data;
}

/** Answer a question using only project context. Newer materials weighted higher. No persistence. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: projectId } = await params;
  const supabase = createAdminClient();
  const project = await getProjectAndCheckOwner(supabase, projectId, userId);
  if (!project) {
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

  const { contextParts } = await buildProjectContext(supabase, projectId, project, userId);
  if (contextParts.length === 0) {
    return NextResponse.json({
      answer: "Add Jira boards, meeting recordings, or PDFs on the right to build context, then ask again.",
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
