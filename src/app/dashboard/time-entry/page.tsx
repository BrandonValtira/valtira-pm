import { auth } from "@/auth";
import { loadTimeEntryDashboard } from "@/lib/project-anchor/dashboard";
import { redirect } from "next/navigation";
import { TimeEntryClient } from "./time-entry-client";

export const dynamic = "force-dynamic";

export default async function TimeEntryPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string })?.id;
  if (!userId) redirect("/");

  let data;
  let loadError: string | null = null;
  try {
    data = await loadTimeEntryDashboard(userId);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Failed to load Time Entry";
    data = null;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-neutral-900">Time Entry</h1>
      <p className="mt-1 text-sm text-neutral-700">
        Project Anchor syncs native Jira worklogs to Harvest for issues with a Harvest Billing Project.
      </p>
      {loadError ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{loadError}</div>
      ) : data ? (
        <TimeEntryClient initial={data} />
      ) : null}
    </div>
  );
}
