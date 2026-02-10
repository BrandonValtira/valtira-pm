"use client";

import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ValtiraLogo } from "@/components/valtira-logo";

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { data: session, status } = useSession();
  const router = useRouter();
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user || !token || accepting) return;

    let cancelled = false;
    setAccepting(true);
    setAcceptError(null);

    fetch("/api/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setAcceptError(data.error || "Failed to accept invite");
          return;
        }
        router.replace("/dashboard");
      })
      .catch(() => {
        if (!cancelled) setAcceptError("Something went wrong");
      })
      .finally(() => {
        if (!cancelled) setAccepting(false);
      });

    return () => { cancelled = true; };
  }, [status, session?.user, token, router, accepting]);

  if (!token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <p className="text-center text-neutral-600">Invalid or missing invite link.</p>
        <a href="/" className="mt-4 text-sm text-neutral-500 underline hover:text-neutral-700">
          Go home
        </a>
      </div>
    );
  }

  if (status === "loading" || (status === "authenticated" && accepting)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <ValtiraLogo height={40} />
        <p className="mt-4 text-sm text-neutral-500">Accepting invite…</p>
      </div>
    );
  }

  if (status === "authenticated") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <ValtiraLogo height={40} />
        {acceptError ? (
          <>
            <p className="mt-4 text-center text-sm text-red-600">{acceptError}</p>
            <a href="/dashboard" className="mt-4 text-sm text-neutral-500 underline hover:text-neutral-700">
              Go to dashboard
            </a>
          </>
        ) : (
          <p className="mt-4 text-sm text-neutral-500">Redirecting…</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <ValtiraLogo height={48} />
      <p className="mt-6 text-center text-sm text-neutral-600">
        Sign in with Google to accept your invite and join Valtira PM.
      </p>
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl: `/auth/accept-invite?token=${encodeURIComponent(token)}` })}
        className="mt-6 rounded-xl bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800"
      >
        Sign in with Google
      </button>
      <a href="/" className="mt-6 text-sm text-neutral-500 underline hover:text-neutral-700">
        Cancel
      </a>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <ValtiraLogo height={40} />
        <p className="mt-4 text-sm text-neutral-500">Loading…</p>
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  );
}
