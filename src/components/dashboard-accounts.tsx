"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";

const SERVICES = [
  {
    id: "harvest",
    name: "Harvest",
    icon: "/integrations/harvest.png",
    connectUrl: "/api/integrations/harvest/connect",
    disconnectApi: "/api/integrations/harvest",
  },
  {
    id: "jira",
    name: "Jira",
    icon: "/integrations/jira.png",
    connectUrl: "/api/integrations/jira/connect",
    disconnectApi: "/api/integrations/jira",
  },
  {
    id: "google_drive",
    name: "Google",
    icon: "/integrations/google.png",
    connectUrl: "/api/integrations/drive/connect",
    disconnectApi: "/api/integrations/drive",
  },
] as const;

export function DashboardAccounts({
  connected,
}: {
  connected: { harvest: boolean; jira: boolean; google_drive: boolean };
}) {
  const router = useRouter();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  async function handleDisconnect(api: string, id: string) {
    setDisconnecting(id);
    try {
      const res = await fetch(api, { method: "DELETE" });
      if (res.ok) {
        setOpenMenuId(null);
        router.refresh();
      }
    } finally {
      setDisconnecting(null);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="text-lg font-medium text-neutral-900">Accounts</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Connected services for reports and resource planning.
      </p>
      <ul className="mt-4 grid gap-4 sm:grid-cols-3">
        {SERVICES.map((svc) => {
          const isConnected = connected[svc.id as keyof typeof connected];
          return (
            <li
              key={svc.id}
              className={`flex items-center justify-between gap-3 rounded-lg border p-4 ${
                isConnected
                  ? "border-neutral-200 bg-neutral-50/50"
                  : "border-neutral-100 bg-neutral-50/30"
              }`}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Image
                  src={svc.icon}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 shrink-0 rounded"
                />
                <div className="min-w-0">
                  <p className="font-medium text-neutral-900">{svc.name}</p>
                  <p className="text-xs text-neutral-600">
                    {isConnected ? (
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        Connected
                      </span>
                    ) : (
                      "Not connected"
                    )}
                  </p>
                </div>
              </div>
              <div className="relative shrink-0" ref={openMenuId === svc.id ? menuRef : undefined}>
                {isConnected ? (
                  <>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === svc.id ? null : svc.id);
                      }}
                      className="rounded p-1.5 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700"
                      aria-label={`Options for ${svc.name}`}
                      aria-expanded={openMenuId === svc.id}
                    >
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                      </svg>
                    </button>
                    {openMenuId === svc.id && (
                      <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
                        <button
                          type="button"
                          onClick={() => handleDisconnect(svc.disconnectApi, svc.id)}
                          disabled={disconnecting === svc.id}
                          className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {disconnecting === svc.id ? "Disconnecting…" : "Disconnect"}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <Link
                    href={svc.connectUrl}
                    className="inline-block rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Connect
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
