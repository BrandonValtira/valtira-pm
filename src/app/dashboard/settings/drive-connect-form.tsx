"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Same flow as JiraConnectForm / HarvestConnectForm: connect link when disconnected,
// then light green pill + Disconnect button when connected.
export function DriveConnectForm({
  className,
  connected,
}: {
  className?: string;
  connected?: boolean;
}) {
  const searchParams = useSearchParams();
  const drive = searchParams.get("drive");
  const error = searchParams.get("error");
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    try {
      setDisconnecting(true);
      const res = await fetch("/api/integrations/drive", { method: "DELETE" });
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
          href="/api/integrations/drive/connect"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Image
            src="/integrations/google-drive.png"
            alt="Google Drive"
            width={20}
            height={20}
            className="h-5 w-5 rounded"
          />
          Sign in with Google Drive
        </a>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-sm text-green-700">
            <Image
              src="/integrations/google-drive.png"
              alt="Google Drive connected"
              width={16}
              height={16}
              className="h-4 w-4 rounded"
            />
            Google Drive connected
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
      {drive === "connected" && (
        <p className="mt-2 text-sm text-green-600">
          Google Drive connected. You can add Meet Recordings (My Drive → Meet Recordings) in Project Context on any project.
        </p>
      )}
      {error?.startsWith("drive_") && (
        <p className="mt-2 text-sm text-red-600">
          {error === "drive_not_configured" && "Google Drive uses your app’s Google OAuth client. Ensure AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET are set."}
          {error === "drive_callback_failed" && "Connection was cancelled or failed. Try again."}
          {error === "drive_token" && "Could not get access. Try again."}
          {!["drive_not_configured", "drive_callback_failed", "drive_token"].includes(error) && "Something went wrong. Try again."}
        </p>
      )}
    </div>
  );
}
