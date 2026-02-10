"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function JiraConnectForm({
  className,
  connected,
}: {
  className?: string;
  connected?: boolean;
}) {
  const searchParams = useSearchParams();
  const jira = searchParams.get("jira");
  const error = searchParams.get("error");
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    try {
      setDisconnecting(true);
      const res = await fetch("/api/integrations/jira", { method: "DELETE" });
      if (!res.ok) {
        return;
      }
      router.refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className={className}>
      {!connected ? (
        <a
          href="/api/integrations/jira/connect"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Image
            src="/integrations/jira.png"
            alt="Jira"
            width={20}
            height={20}
            className="h-5 w-5 rounded"
          />
          Sign in with Jira
        </a>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-sm text-green-700">
            <Image
              src="/integrations/jira.png"
              alt="Jira connected"
              width={16}
              height={16}
              className="h-4 w-4 rounded"
            />
            Jira connected
          </span>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="inline-flex items-center justify-center rounded-md border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
          >
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </button>
        </div>
      )}
      {jira === "connected" && (
        <p className="mt-2 text-sm text-green-600">
          Jira connected. You can add Jira project keys when creating or editing a project.
        </p>
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
