"use client";

import { useSearchParams } from "next/navigation";

export function JiraConnectForm({ className }: { className?: string }) {
  const searchParams = useSearchParams();
  const jira = searchParams.get("jira");
  const error = searchParams.get("error");

  return (
    <div className={className}>
      <a
        href="/api/integrations/jira/connect"
        className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214h2.129A5.215 5.215 0 0 0 24 12.518V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.759 0H12.575a5.215 5.215 0 0 0-5.215 5.215v2.058h-.001A5.215 5.215 0 0 0 2.145 12.49v.001H0V5.215A5.215 5.215 0 0 0 5.215 0h18.544a1.001 1.001 0 0 1 1 1v-.001z" />
        </svg>
        Sign in with Jira
      </a>
      {jira === "connected" && (
        <p className="mt-2 text-sm text-green-600">Jira connected. You can add Jira project keys when creating or editing a project.</p>
      )}
      {error?.startsWith("jira_") && (
        <p className="mt-2 text-sm text-red-600">
          {error === "jira_not_configured" && "Jira OAuth is not configured. Add ATLASSIAN_CLIENT_ID and ATLASSIAN_CLIENT_SECRET."}
          {error === "jira_callback_failed" && "Connection was cancelled or failed. Try again."}
          {error === "jira_no_site" && "No Jira site found. Try again."}
          {error === "jira_token" && "Could not get access. Try again."}
          {error === "jira_resources" && "Could not load your Jira sites. Try again."}
          {!["jira_not_configured", "jira_callback_failed", "jira_no_site", "jira_token", "jira_resources"].includes(error) && "Something went wrong. Try again."}
        </p>
      )}
    </div>
  );
}
