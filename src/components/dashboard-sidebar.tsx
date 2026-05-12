"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useCallback } from "react";
import { useTheme } from "@/components/theme-context";

type SessionUser = { name?: string | null; email?: string | null; image?: string | null; role?: string };

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: GridIcon },
  { href: "/dashboard/resource-planning", label: "Resources", icon: ResourcesIcon },
  { href: "/dashboard/team", label: "Team", icon: TeamIcon, superAdminOnly: true },
];

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}

function ResourcesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function TeamIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function ThemeToggle({ showLabel, className = "" }: { showLabel?: boolean; className?: string }) {
  const themeContext = useTheme();
  const theme = themeContext?.theme ?? "light";
  const toggleTheme = themeContext?.toggleTheme ?? (() => {});

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900 ${className}`}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? (
        <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
      {showLabel && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
    </button>
  );
}

const SIDEBAR_WIDTH_OPEN = 200;
const SIDEBAR_WIDTH_CLOSED = 56;

function NavLinks({
  pathname,
  isSuperAdmin,
  showLabels,
  onNavigate,
}: {
  pathname: string;
  isSuperAdmin: boolean;
  showLabels: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      {NAV_ITEMS.map((item) => {
        if (item.superAdminOnly && !isSuperAdmin) return null;
        const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              isActive
                ? "bg-neutral-100 font-medium text-neutral-900 dark:bg-blue-600 dark:text-white"
                : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-blue-600/80 dark:hover:text-white"
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {showLabels && <span>{item.label}</span>}
          </Link>
        );
      })}
    </>
  );
}

export function DashboardSidebar({ sessionUser }: { sessionUser: SessionUser | null }) {
  const pathname = usePathname();
  const [isHoveringEdge, setIsHoveringEdge] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isSuperAdmin = (sessionUser as { role?: string })?.role === "super_admin";
  const effectiveOpen = isHoveringEdge;

  const handleMouseEnterSidebar = useCallback(() => setIsHoveringEdge(true), []);
  const handleMouseLeaveSidebar = useCallback(() => setIsHoveringEdge(false), []);

  return (
    <>
      {/* Mobile: menu button to open sidebar overlay */}
      <div className="fixed left-4 top-14 z-30 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded p-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
          aria-label="Open menu"
        >
          <MenuIcon className="h-6 w-6" />
        </button>
      </div>

      {/* Mobile: overlay + slide-in panel */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 md:hidden"
            aria-hidden
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="fixed left-0 top-14 bottom-0 z-50 flex w-64 flex-col border-r border-neutral-200 bg-white p-4 shadow-xl md:hidden"
            aria-label="Mobile navigation"
          >
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">Menu</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded p-2 text-neutral-500 hover:bg-neutral-100"
                aria-label="Close menu"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="mt-4 flex flex-1 flex-col gap-0.5" aria-label="Main navigation">
              <NavLinks
                pathname={pathname}
                isSuperAdmin={isSuperAdmin}
                showLabels
                onNavigate={() => setMobileOpen(false)}
              />
            </nav>
            <div className="mt-auto border-t border-neutral-200 pt-3">
              <ThemeToggle showLabel />
            </div>
          </aside>
        </>
      )}

      {/* Desktop sidebar — full left column triggers hover-open when collapsed */}
      <aside
        className="fixed left-0 top-14 z-10 hidden h-[calc(100vh-3.5rem)] border-r border-neutral-200 bg-white transition-[width] duration-200 ease-out md:block"
        style={{ width: effectiveOpen ? SIDEBAR_WIDTH_OPEN : SIDEBAR_WIDTH_CLOSED }}
        onMouseEnter={handleMouseEnterSidebar}
        onMouseLeave={handleMouseLeaveSidebar}
      >
        <div className="flex h-full flex-col py-3">
          <nav className="flex flex-1 flex-col gap-0.5 px-2" aria-label="Main navigation">
            <NavLinks pathname={pathname} isSuperAdmin={isSuperAdmin} showLabels={effectiveOpen} />
          </nav>

          <div className="mt-auto border-t border-neutral-200 px-2 pt-2">
            <ThemeToggle showLabel={effectiveOpen} />
          </div>
        </div>
      </aside>

      {/* Spacer so main content doesn't sit under sidebar (desktop) */}
      <div
        className="hidden shrink-0 transition-[width] duration-200 ease-out md:block"
        style={{ width: effectiveOpen ? SIDEBAR_WIDTH_OPEN : SIDEBAR_WIDTH_CLOSED }}
        aria-hidden
      />
    </>
  );
}
