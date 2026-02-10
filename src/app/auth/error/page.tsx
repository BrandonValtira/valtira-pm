"use client";

import Link from "next/link";
import { LogoBackground } from "@/components/logo-background";

export default function AuthErrorPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-50">
      <LogoBackground position="bottom-right" />
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm text-center">
        <h1 className="text-xl font-semibold text-neutral-900">Access denied</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Your account isn’t on the invite list, or something went wrong. Contact your admin to get access.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Try again
        </Link>
      </div>
      </div>
    </div>
  );
}
