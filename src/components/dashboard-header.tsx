"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { UserMenu } from "@/components/user-menu";
import { ValtiraLogo } from "@/components/valtira-logo";

type SessionUser = { name?: string | null; email?: string | null; image?: string | null; role?: string };

export function DashboardHeader({ sessionUser }: { sessionUser: SessionUser | null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const navLinks = [
    { href: "/dashboard", label: "My projects" },
    { href: "/dashboard/settings", label: "Settings" },
    { href: "/dashboard/team", label: "Team", superAdminOnly: true },
  ];

  const isSuperAdmin = (sessionUser as { role?: string })?.role === "super_admin";

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center" aria-label="Valtira – My projects">
          <ValtiraLogo height={43} />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => {
            if (link.superAdminOnly && !isSuperAdmin) {
              return (
                <span
                  key={link.href}
                  className="text-sm text-neutral-900 cursor-not-allowed opacity-60"
                  title="Team management is only available to Super Admins"
                >
                  {link.label}
                </span>
              );
            }
            return (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-neutral-900 hover:text-neutral-900"
              >
                {link.label}
              </Link>
            );
          })}
          {sessionUser && <UserMenu user={sessionUser} />}
        </nav>

        {/* Mobile: hamburger + overlay menu */}
        <div className="flex items-center md:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded p-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-20 bg-black/30 md:hidden"
            aria-hidden
            onClick={() => setMenuOpen(false)}
          />
          <nav
            className="fixed right-0 top-14 z-30 flex w-full max-w-xs flex-col gap-1 border-b border-l border-neutral-200 bg-white p-4 shadow-xl md:hidden"
            aria-label="Mobile menu"
          >
            {navLinks.map((link) => {
              if (link.superAdminOnly && !isSuperAdmin) {
                return (
                  <span
                    key={link.href}
                    className="rounded-lg px-3 py-2 text-sm text-neutral-500"
                    title="Team management is only available to Super Admins"
                  >
                    {link.label}
                  </span>
                );
              }
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    pathname === link.href
                      ? "bg-neutral-100 font-medium text-neutral-900"
                      : "text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            {sessionUser && (
              <div className="mt-2 border-t border-neutral-200 pt-2">
                <UserMenu user={sessionUser} />
              </div>
            )}
          </nav>
        </>
      )}
    </header>
  );
}
