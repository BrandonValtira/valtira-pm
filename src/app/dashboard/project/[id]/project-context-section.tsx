"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export type ProjectFile = {
  id: string;
  file_name: string;
  storage_path: string;
  file_type: "transcript" | "pdf_note" | "meet_recording";
  uploaded_at: string;
  metadata?: Record<string, unknown>;
};

type AccordionPanel = "meet" | "materials" | "jira";

type MeetRecordingDrive = { id: string; name: string; modifiedTime: string | null };

export function ProjectContextSection({
  projectId,
  jiraKeys,
  driveConnected = false,
  jiraConnected = false,
}: {
  projectId: string;
  jiraKeys: string[];
  driveConnected?: boolean;
  jiraConnected?: boolean;
}) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [openPanel, setOpenPanel] = useState<AccordionPanel | null>("materials");
  const [summary, setSummary] = useState<string | null>(null);
  const [jiraReturnedNothing, setJiraReturnedNothing] = useState<boolean | null>(null);
  const [summaryStale, setSummaryStale] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [question, setQuestion] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [loadingAsk, setLoadingAsk] = useState(false);
  const [jiraProjects, setJiraProjects] = useState<{ key: string; name: string }[]>([]);
  const [jiraProjectsLoading, setJiraProjectsLoading] = useState(false);
  const [selectedJiraKeys, setSelectedJiraKeys] = useState<string[]>(jiraKeys);
  const [jiraSaving, setJiraSaving] = useState(false);
  const [meetRecordingsFromDrive, setMeetRecordingsFromDrive] = useState<MeetRecordingDrive[]>([]);
  const [meetRecordingsLoading, setMeetRecordingsLoading] = useState(false);
  const [meetRecordingsFolderName, setMeetRecordingsFolderName] = useState<string | null>(null);
  const [meetRecordingsError, setMeetRecordingsError] = useState<string | null>(null);
  const [addingMeetId, setAddingMeetId] = useState<string | null>(null);
  const router = useRouter();

  const jiraKeysStr = jiraKeys.join(",");
  useEffect(() => {
    setSelectedJiraKeys(jiraKeys);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when stringified keys change
  }, [jiraKeysStr]);

  const hasContext = files.length > 0 || selectedJiraKeys.length > 0;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/context/files`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.files)) setFiles(data.files);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingFiles(false);
      });
    return () => { cancelled = true; };
  }, [projectId]);

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setSummaryStale(true);
    fetch(`/api/projects/${projectId}/context/files/${id}`, { method: "DELETE" }).catch(() => {});
  }

  function onFilesChange() {
    setSummaryStale(true);
    fetch(`/api/projects/${projectId}/context/files`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.files)) setFiles(data.files);
      })
      .catch(() => {});
  }
  const jiraKeysKey = selectedJiraKeys.join(",");
  useEffect(() => {
    setSummaryStale(true);
  }, [jiraKeysKey]);

  useEffect(() => {
    if (openPanel !== "jira") return;
    setJiraProjectsLoading(true);
    fetch("/api/integrations/jira/projects")
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data.projects)) return;
        const sorted = [...data.projects].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
        );
        setJiraProjects(sorted);
      })
      .catch(() => {})
      .finally(() => setJiraProjectsLoading(false));
  }, [openPanel]);

  useEffect(() => {
    if (openPanel !== "meet" || !driveConnected) return;
    setMeetRecordingsLoading(true);
    setMeetRecordingsError(null);
    fetch("/api/integrations/drive/meet-recordings")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const detail = data.details ? ` (${String(data.details).slice(0, 120)})` : "";
          setMeetRecordingsError((data.error || "Could not load transcripts.") + detail);
          setMeetRecordingsFromDrive([]);
          setMeetRecordingsFolderName(data.folderName ?? null);
          if (data.authExpired === true || res.status === 401) {
            router.refresh();
          }
          return;
        }
        if (Array.isArray(data.files)) setMeetRecordingsFromDrive(data.files);
        setMeetRecordingsFolderName(data.folderName ?? null);
      })
      .catch(() => setMeetRecordingsError("Request failed."))
      .finally(() => setMeetRecordingsLoading(false));
  }, [openPanel, driveConnected]);

  async function addMeetRecording(driveFileId: string, fileName: string) {
    setAddingMeetId(driveFileId);
    try {
      const res = await fetch(`/api/projects/${projectId}/context/meet-recordings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFileId, fileName }),
      });
      if (res.ok) {
        setSummaryStale(true);
        const data = await res.json().catch(() => ({}));
        setFiles((prev) => [
          {
            id: data.id,
            file_name: data.file_name,
            storage_path: data.storage_path,
            file_type: "meet_recording",
            uploaded_at: data.uploaded_at,
            metadata: data.metadata,
          },
          ...prev,
        ]);
      }
    } finally {
      setAddingMeetId(null);
    }
  }

  async function toggleJiraBoard(key: string) {
    const next = selectedJiraKeys.includes(key)
      ? selectedJiraKeys.filter((k) => k !== key)
      : [...selectedJiraKeys, key];
    setSelectedJiraKeys(next);
    setSummaryStale(true);
    setJiraSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jiraProjectKeys: next }),
      });
      if (res.ok) router.refresh();
      else setSelectedJiraKeys(jiraKeys);
    } catch {
      setSelectedJiraKeys(jiraKeys);
    } finally {
      setJiraSaving(false);
    }
  }

  async function generateSummary() {
    setLoadingSummary(true);
    setSummaryStale(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/context/summary`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.summary === "string") {
        setSummary(data.summary);
        setJiraReturnedNothing(data.jiraReturnedNothing === true);
      } else {
        setSummary(data.error || "Unable to generate summary. Add Jira, materials, or meeting recordings for context.");
        setJiraReturnedNothing(null);
      }
    } catch {
      setSummary("Failed to generate summary.");
      setJiraReturnedNothing(null);
    } finally {
      setLoadingSummary(false);
    }
  }

  async function askQuestion(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loadingAsk) return;
    setQuestion("");
    setChatMessages((prev) => [...prev, { role: "user", content: q }]);
    setLoadingAsk(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/context/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json().catch(() => ({}));
      const answerText = res.ok && typeof data.answer === "string"
        ? data.answer
        : data.error || "Could not get an answer.";
      setChatMessages((prev) => [...prev, { role: "assistant", content: answerText }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Request failed." }]);
    } finally {
      setLoadingAsk(false);
    }
  }

  const summaryBoxClass = "relative mt-4 rounded-lg border border-neutral-200 bg-neutral-50/50 p-4";
  const showButtonOverlay = (hasContext && !summary) || (summaryStale && !!summary && !loadingSummary);
  const showSpinnerOverlay = loadingSummary;
  const overlayVisible = showButtonOverlay || showSpinnerOverlay;

  return (
    <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
      <div className="grid w-full gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="text-lg font-medium text-neutral-900">Project Summary</h2>
          <div className={summaryBoxClass}>
            {/* Behind overlay: old summary (if any) or nothing */}
            {overlayVisible ? (
              <div className={`min-h-[200px] ${summary ? "flex flex-col max-h-[420px]" : ""}`}>
                {summary ? (
                  <div className="overflow-y-auto flex-1 min-h-0 pr-1">
                    <FormattedSummary text={summary} />
                  </div>
                ) : (
                  <div className="min-h-[200px]" aria-hidden />
                )}
              </div>
            ) : null}
            {/* Blur + centered button: Generate summary (no summary yet) or Regenerate summary (stale) */}
            {showButtonOverlay && (
              <div className="summary-regenerate-overlay absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={generateSummary}
                  disabled={loadingSummary}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  {summary ? "Regenerate summary" : "Generate summary"}
                </button>
              </div>
            )}
            {/* Loading: opaque overlay + spinner */}
            {showSpinnerOverlay && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white dark:bg-neutral-950" aria-live="polite">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-48 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                    <div
                      className="h-2 w-[40%] rounded-full bg-neutral-900/80 dark:bg-neutral-100"
                      style={{ animation: "regenerate-progress 1.8s ease-in-out infinite" }}
                    />
                  </div>
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Regenerating summary…</span>
                </div>
              </div>
            )}
            {hasContext && (jiraReturnedNothing === true || (selectedJiraKeys.length > 0 && !!summary && /no jira data|no issues found for project/i.test(summary))) && (
              <a
                href={`/api/projects/${projectId}/context/jira-debug`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-neutral-500 hover:text-neutral-700 underline"
              >
                Jira not loading? Debug
              </a>
            )}
            {!overlayVisible && (
              <div className={`mt-4 min-h-[200px] ${summary ? "flex flex-col max-h-[420px]" : ""}`}>
                {!hasContext ? (
                  <p className="text-sm text-neutral-600">
                    Add Jira boards (in project settings or the Jira panel), Google Meet recordings, or PDFs (meeting notes, SOWs) to build context. Then generate a summary.
                  </p>
                ) : (
                  <div className="overflow-y-auto flex-1 min-h-0 pr-1">
                    <FormattedSummary text={summary ?? ""} />
                  </div>
                )}
              </div>
            )}
            {hasContext && (
              <div className="mt-4 border-t border-neutral-200 pt-4 flex flex-col gap-2">
                {(chatMessages.length > 0 || loadingAsk) && (
                  <div className="overflow-y-auto max-h-[280px] space-y-3 rounded-lg border border-neutral-200 bg-neutral-50/30 p-3">
                    {chatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}
                      >
                        <div
                          className={
                            msg.role === "user"
                              ? "max-w-[85%] rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white"
                              : "max-w-[85%] rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
                          }
                        >
                          <span className="whitespace-pre-wrap">{msg.content}</span>
                        </div>
                      </div>
                    ))}
                    {loadingAsk && (
                      <div className="flex justify-start">
                        <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-500">
                          …
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <form onSubmit={askQuestion} className="flex gap-2">
                  <input
                    id="context-question"
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Message…"
                    className="block flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-500"
                    disabled={loadingAsk}
                  />
                  <button
                    type="submit"
                    disabled={loadingAsk || !question.trim()}
                    className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                  >
                    Send
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Right 1/3: Project Context */}
        <div className="space-y-2">
          <h2 className="text-lg font-medium text-neutral-900">Project Context</h2>
          {/* Google Meet transcripts */}
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setOpenPanel(openPanel === "meet" ? null : "meet")}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-neutral-900 hover:bg-neutral-50"
            aria-expanded={openPanel === "meet"}
          >
            <span className="flex items-center gap-2">
              Google Meet transcripts
              <span className="text-xs font-normal text-neutral-500">
                {files.filter((f) => f.file_type === "meet_recording").length}
              </span>
            </span>
            <svg
              className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${openPanel === "meet" ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {openPanel === "meet" && (
            <div className="border-t border-neutral-200 px-4 pb-4 pt-2">
              {!driveConnected ? (
                <p className="text-sm text-neutral-500">
                  <a href="/dashboard" className="text-neutral-700 underline">Connect Google</a> on the dashboard to list transcripts.
                </p>
              ) : meetRecordingsLoading ? (
                <p className="text-sm text-neutral-500">Loading…</p>
              ) : meetRecordingsError ? (
                <p className="text-sm text-amber-600">{meetRecordingsError}</p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {meetRecordingsFromDrive.map((doc) => {
                    const alreadyAdded = files.some(
                      (f) => f.file_type === "meet_recording" && f.storage_path === doc.id
                    );
                    return (
                      <li
                        key={doc.id}
                        className="flex items-center justify-between gap-2 rounded border border-neutral-100 bg-neutral-50/50 px-2 py-1.5 text-sm"
                      >
                        <span className="min-w-0 truncate">{doc.name}</span>
                        {alreadyAdded ? (
                          <span className="shrink-0 text-xs text-neutral-500">Added</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => addMeetRecording(doc.id, doc.name)}
                            disabled={addingMeetId === doc.id}
                            className="shrink-0 rounded px-2 py-0.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
                          >
                            {addingMeetId === doc.id ? "Adding…" : "Add"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                  {files
                    .filter((f) => f.file_type === "meet_recording")
                    .map((f) => (
                      <li key={f.id} className="flex items-center justify-between gap-2 rounded border border-neutral-100 bg-neutral-50/50 px-2 py-1.5 text-sm">
                        <span className="min-w-0 truncate">{f.file_name}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(f.id)}
                          className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
                          aria-label={`Remove ${f.file_name}`}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  {meetRecordingsFromDrive.length === 0 && files.filter((f) => f.file_type === "meet_recording").length === 0 && (
                    <li className="text-sm text-neutral-500">
                      {meetRecordingsFolderName
                        ? `No transcripts in "${meetRecordingsFolderName}". Add Google Docs or .gdoc shortcuts to that folder.`
                        : "Meet Recordings folder not found in your Drive. Create a folder named \"Meet Recordings\" in My Drive."}
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Additional materials (PDFs) */}
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setOpenPanel(openPanel === "materials" ? null : "materials")}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-neutral-900 hover:bg-neutral-50"
            aria-expanded={openPanel === "materials"}
          >
            <span className="flex items-center gap-2">
              Additional materials
              <span className="text-xs font-normal text-neutral-500">
                {files.filter((f) => f.file_type === "pdf_note").length}
              </span>
            </span>
            <svg
              className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${openPanel === "materials" ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {openPanel === "materials" && (
            <div className="border-t border-neutral-200 px-4 pb-4 pt-2">
              <p className="text-xs text-neutral-600">
                Upload PDFs: meeting notes, SOWs, or other context. You can view and remove them below.
              </p>
              <ProjectMaterialsUpload projectId={projectId} onUpload={onFilesChange} />
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {loadingFiles ? (
                  <li className="text-sm text-neutral-500">Loading…</li>
                ) : (
                  files
                    .filter((f) => f.file_type === "pdf_note")
                    .map((f) => (
                      <li key={f.id} className="flex items-center justify-between gap-2 rounded border border-neutral-100 bg-neutral-50/50 px-2 py-1.5 text-sm">
                        <span className="min-w-0 truncate">{f.file_name}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(f.id)}
                          className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
                          aria-label={`Remove ${f.file_name}`}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </li>
                    ))
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Jira */}
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setOpenPanel(openPanel === "jira" ? null : "jira")}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-neutral-900 hover:bg-neutral-50"
            aria-expanded={openPanel === "jira"}
          >
            <span className="flex items-center gap-2">
              Jira
              <span className="text-xs font-normal text-neutral-500">
                {selectedJiraKeys.length}
              </span>
            </span>
            <svg
              className={`h-4 w-4 shrink-0 text-neutral-500 transition-transform ${openPanel === "jira" ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {openPanel === "jira" && (
            <div className="border-t border-neutral-200 px-4 pb-4 pt-2">
              <p className="text-xs text-neutral-600">
                Select one or more Jira boards to include in project context for summaries and Q&A.
              </p>
              {jiraProjectsLoading ? (
                <p className="mt-2 text-sm text-neutral-500">Loading boards…</p>
              ) : jiraProjects.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-500">
                  {jiraConnected ? (
                    <>Jira connection may be incomplete or expired. Reconnect on the <a href="/dashboard" className="text-neutral-700 underline">dashboard</a> to select boards.</>
                  ) : (
                    <>Connect Jira on the <a href="/dashboard" className="text-neutral-700 underline">dashboard</a> to select boards.</>
                  )}
                </p>
              ) : (
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                  {jiraProjects.map((p) => (
                    <li key={p.key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`jira-context-${p.key}`}
                        checked={selectedJiraKeys.includes(p.key)}
                        onChange={() => toggleJiraBoard(p.key)}
                        disabled={jiraSaving}
                        className="h-4 w-4 rounded border-neutral-300"
                      />
                      <label htmlFor={`jira-context-${p.key}`} className="text-sm cursor-pointer">
                        {p.name}
                        <span className="ml-1 text-neutral-500">({p.key})</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
    </section>
  );
}

const SUMMARY_HEADERS = ["PROJECT MOOD", "GOOGLE TRANSCRIPTS", "ADDITIONAL MATERIALS", "JIRA", "NEXT STEPS"];
const SUMMARY_TITLES: Record<string, string> = {
  "PROJECT MOOD": "Project mood",
  "GOOGLE TRANSCRIPTS": "Google transcripts",
  "ADDITIONAL MATERIALS": "Additional Materials",
  "JIRA": "Jira",
  "NEXT STEPS": "Next steps",
};

function FormattedSummary({ text }: { text: string }) {
  const normalized = text.replace(/^\d+\)\s*/gm, "").trim();
  const sections: { key: string; title: string; body: string }[] = [];
  for (let i = 0; i < SUMMARY_HEADERS.length; i++) {
    const header = SUMMARY_HEADERS[i];
    const nextHeader = SUMMARY_HEADERS[i + 1];
    const esc = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nextEsc = nextHeader ? nextHeader.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "$";
    const re = new RegExp(`${esc}\\s*\\n([\\s\\S]*?)(?=${nextEsc})`, "i");
    const m = normalized.match(re);
    const body = m ? m[1].replace(/^\s+/gm, "").trim() : "";
    sections.push({ key: header.replace(/\s+/g, "-").toLowerCase(), title: SUMMARY_TITLES[header] ?? header, body });
  }
  const hasAnyBody = sections.some((s) => s.body.length > 0);
  if (!hasAnyBody) {
    return <div className="whitespace-pre-wrap text-sm text-neutral-800">{text}</div>;
  }
  const moodColor = (body: string) => {
    const lower = body.toLowerCase();
    if (lower.includes("(green)") || lower.includes("on track")) return "bg-emerald-100 text-emerald-800 border-emerald-200";
    if (lower.includes("(yellow)") || lower.includes("needs attention")) return "bg-amber-100 text-amber-800 border-amber-200";
    if (lower.includes("(red)") || lower.includes("at risk")) return "bg-red-100 text-red-800 border-red-200";
    return "bg-neutral-200 text-neutral-700 border-neutral-300";
  };
  return (
    <div className="space-y-5 text-sm text-neutral-800">
      {sections.map((s) => (
        <div key={s.key}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{s.title}</h3>
          {s.key === "project-mood" && s.body ? (
            <span className={`mt-1 inline-flex rounded-md border px-2 py-0.5 text-sm font-medium ${moodColor(s.body)}`}>
              {s.body.replace(/\s*\(green\)|\(yellow\)|\(red\)|\(gray\)/gi, "").trim() || s.body}
            </span>
          ) : s.key === "next-steps" && s.body ? (
            <ul className="mt-1 list-disc list-inside space-y-0.5 pl-0">
              {s.body.split(/\n+/).filter(Boolean).map((line, i) => (
                <li key={i}>{line.replace(/^[\s*•\-]+\s*/, "").trim()}</li>
              ))}
            </ul>
          ) : s.body ? (
            <p className="mt-1 whitespace-pre-wrap leading-relaxed">{s.body}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ProjectMaterialsUpload({
  projectId,
  onUpload,
}: {
  projectId: string;
  onUpload: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || file.type !== "application/pdf") {
      setError("Please select a PDF file.");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/projects/${projectId}/context/files/upload`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Upload failed");
        return;
      }
      onUpload();
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-2">
      <label className="inline-block rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer">
        <input
          type="file"
          accept="application/pdf"
          onChange={handleFile}
          disabled={uploading}
          className="sr-only"
        />
        {uploading ? "Uploading…" : "Upload PDF"}
      </label>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
