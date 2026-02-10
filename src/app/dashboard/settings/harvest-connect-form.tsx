"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function HarvestConnectForm({
  className,
  connected,
}: {
  className?: string;
  connected?: boolean;
}) {
  const searchParams = useSearchParams();
  const harvest = searchParams.get("harvest");
  const error = searchParams.get("error");
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    try {
      setDisconnecting(true);
      const res = await fetch("/api/integrations/harvest", { method: "DELETE" });
      if (!res.ok) {
        // Fail silently for now; could show a toast/message here
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
          href="/api/integrations/harvest/connect"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        >
          <Image
            src="/integrations/harvest.png"
            alt="Harvest"
            width={20}
            height={20}
            className="h-5 w-5 rounded"
          />
          Sign in with Harvest
        </a>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-sm text-green-700">
            <Image
              src="/integrations/harvest.png"
              alt="Harvest connected"
              width={16}
              height={16}
              className="h-4 w-4 rounded"
            />
            Harvest connected
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
      {harvest === "connected" && (
        <p className="mt-2 text-sm text-green-600">
          Harvest connected. You can select Harvest projects when adding a project.
        </p>
      )}
      {error?.startsWith("harvest_") && (
        <p className="mt-2 text-sm text-red-600">
          {error === "harvest_not_configured" && "Harvest OAuth is not configured. Add HARVEST_CLIENT_ID and HARVEST_CLIENT_SECRET."}
          {error === "harvest_callback_failed" && "Connection was cancelled or failed. Try again."}
          {error === "harvest_no_account" && "No Harvest account found. Try again."}
          {error === "harvest_token" && "Could not get access. Try again."}
          {!["harvest_not_configured", "harvest_callback_failed", "harvest_no_account", "harvest_token"].includes(error) && "Something went wrong. Try again."}
        </p>
      )}
    </div>
  );
}
