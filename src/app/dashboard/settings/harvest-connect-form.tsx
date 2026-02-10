"use client";

import { useSearchParams } from "next/navigation";

export function HarvestConnectForm({ className }: { className?: string }) {
  const searchParams = useSearchParams();
  const harvest = searchParams.get("harvest");
  const error = searchParams.get("error");

  return (
    <div className={className}>
      <a
        href="/api/integrations/harvest/connect"
        className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm3.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
        </svg>
        Sign in with Harvest
      </a>
      {harvest === "connected" && (
        <p className="mt-2 text-sm text-green-600">Harvest connected. You can select Harvest projects when adding a project.</p>
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
