"use client";

import Image from "next/image";
import Link from "next/link";
import { ValtiraLogo } from "@/components/valtira-logo";

const SERVICES = [
  {
    id: "harvest",
    name: "Harvest",
    icon: "/integrations/harvest.png",
    connectUrl: "/api/integrations/harvest/connect",
    reason: "Project reporting and resource planning.",
  },
  {
    id: "jira",
    name: "Jira",
    icon: "/integrations/jira.png",
    connectUrl: "/api/integrations/jira/connect",
    reason: "AI-assisted project summaries.",
  },
  {
    id: "google_drive",
    name: "Google",
    icon: "/integrations/google.png",
    connectUrl: "/api/integrations/drive/connect",
    reason: "Drive for meeting transcripts and Gmail for sending reports.",
  },
] as const;

type Integrations = { harvest: boolean; jira: boolean; google_drive: boolean };

export function OnboardingConnectModal({
  integrations,
  onDismiss,
}: {
  integrations: Integrations;
  onDismiss?: () => void;
}) {
  const connected = [integrations.harvest, integrations.jira, integrations.google_drive].filter(Boolean).length;
  const total = 3;
  const allConnected = connected === total;
  const harvestMissing = !integrations.harvest;

  if (allConnected) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" aria-modal="true" role="dialog">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-xl">
        <div className="flex justify-center">
          <ValtiraLogo height={40} />
        </div>
        <h2 className="mt-6 text-center text-lg font-semibold text-neutral-900">Connect your services</h2>
        <p className="mt-2 text-center text-sm text-neutral-600">
          Connect Harvest, Jira, and Google to get the most out of Valtira PM.
        </p>

        <div className="mt-6">
          <div className="flex items-center justify-between text-sm text-neutral-600">
            <span>{connected} of {total} connected</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
            <div
              className="h-full rounded-full bg-neutral-900 transition-all duration-300"
              style={{ width: `${(connected / total) * 100}%` }}
            />
          </div>
        </div>

        <ul className="mt-6 space-y-4">
          {SERVICES.map((svc) => {
            const isConnected = integrations[svc.id as keyof Integrations];
            return (
              <li
                key={svc.id}
                className={`flex items-center justify-between gap-4 rounded-lg border p-4 ${
                  isConnected ? "border-green-200 bg-green-50/50" : "border-neutral-200 bg-neutral-50/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Image
                    src={svc.icon}
                    alt=""
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded"
                  />
                  <div>
                    <p className="font-medium text-neutral-900">{svc.name}</p>
                    <p className="text-xs text-neutral-600">{svc.reason}</p>
                  </div>
                </div>
                {isConnected ? (
                  <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Connected
                  </span>
                ) : (
                  <Link
                    href={svc.connectUrl}
                    className="shrink-0 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
                  >
                    Connect
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        {harvestMissing && (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            The app won’t work fully without at least Harvest (reporting and resource planning).
          </p>
        )}

        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={onDismiss}
            className="text-sm font-medium text-neutral-600 underline hover:text-neutral-900"
          >
            Remind me later
          </button>
        </div>
      </div>
    </div>
  );
}
