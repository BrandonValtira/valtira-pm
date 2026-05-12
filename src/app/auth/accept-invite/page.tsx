"use client";

import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { signIn } from "next-auth/react";
import { Suspense, useEffect, useRef, useState } from "react";
import { ValtiraLogo } from "@/components/valtira-logo";

type TokenState = "checking" | "invalid" | "valid";

function goToDashboard() {
  window.location.href = "/dashboard";
}

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { status } = useSession();
  const [tokenState, setTokenState] = useState<TokenState>("checking");
  const [accepting, setAccepting] = useState(false);
  const acceptStartedRef = useRef(false);

  useEffect(() => {
    if (!token.trim()) {
      setTokenState("invalid");
      return;
    }
    let cancelled = false;
    fetch(`/api/invites/validate?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setTokenState(data.valid ? "valid" : "invalid");
      })
      .catch(() => {
        if (!cancelled) setTokenState("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (tokenState !== "valid" || status !== "authenticated" || !token) return;
    if (acceptStartedRef.current) return;
    acceptStartedRef.current = true;
    setAccepting(true);

    const timeoutId = setTimeout(() => {
      goToDashboard();
    }, 10000);

    fetch("/api/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(() => {
        clearTimeout(timeoutId);
        goToDashboard();
      })
      .catch(() => {
        clearTimeout(timeoutId);
        goToDashboard();
      });

    return () => clearTimeout(timeoutId);
  }, [tokenState, status, token]);

  const isLoading = tokenState === "checking";
  const isInvalid = tokenState === "invalid";
  const isAuthenticated = status === "authenticated";
  const isSessionLoading = status === "loading";
  const showRedirecting = tokenState === "valid" && (accepting || (isAuthenticated && !accepting));

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4">
        <ValtiraLogo height={44} />
        <p className="mt-6 text-sm text-neutral-500">Checking invite…</p>
      </div>
    );
  }

  if (isInvalid) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4">
        <ValtiraLogo height={44} />
        <div className="mt-8 w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-center text-sm font-medium text-neutral-900">
            You don&apos;t have access
          </p>
          <p className="mt-2 text-center text-sm text-neutral-600">
            Contact your administrator for access to this app.
          </p>
          <a
            href="/"
            className="mt-6 block w-full rounded-lg border border-neutral-300 py-2.5 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Go home
          </a>
        </div>
      </div>
    );
  }

  if (showRedirecting) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4">
        <ValtiraLogo height={44} />
        <div className="mt-8 w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
          <p className="text-center text-sm text-neutral-600">
            {accepting ? "Accepting invite…" : "Redirecting to your projects…"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4">
      <ValtiraLogo height={44} />
      <div className="mt-8 w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-center text-lg font-semibold text-neutral-900">Sign in</h1>
        <p className="mt-1 text-center text-sm text-neutral-600">
          Use your Google account to continue.
        </p>
        <div className="mt-6">
          {isSessionLoading ? (
            <div className="flex justify-center py-2">
              <span className="text-sm text-neutral-500">Loading…</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() =>
                signIn("google", {
                  callbackUrl: `/auth/accept-invite?token=${encodeURIComponent(token)}`,
                })
              }
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-neutral-300 bg-white py-3 px-4 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4">
          <ValtiraLogo height={44} />
          <p className="mt-6 text-sm text-neutral-500">Loading…</p>
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}
