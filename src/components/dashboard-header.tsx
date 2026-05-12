"use client";

import Link from "next/link";
import { UserMenu } from "@/components/user-menu";
import { ValtiraLogo } from "@/components/valtira-logo";

type SessionUser = { name?: string | null; email?: string | null; image?: string | null; role?: string };

export function DashboardHeader({ sessionUser }: { sessionUser: SessionUser | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white">
      <div className="flex h-14 items-center justify-between px-4 md:mx-auto md:max-w-6xl">
        <Link href="/dashboard" className="flex items-center" aria-label="Valtira – Dashboard">
          <ValtiraLogo height={43} />
        </Link>

        <div className="flex items-center gap-2">
          {sessionUser && <UserMenu user={sessionUser} />}
        </div>
      </div>
    </header>
  );
}
