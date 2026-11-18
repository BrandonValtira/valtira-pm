"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme-context";

type SessionUser = { name?: string | null; email?: string | null; image?: string | null; role?: string };

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: GridIcon },
  { href: "/dashboard/resource-planning", label: "Resources", icon: ResourcesIcon },
  { href: "/dashboard/projects", label: "Projects", icon: ProjectsIcon },
  { href: "/dashboard/team", label: "Team", icon: TeamIcon, superAdminOnly: true },
  { href: "/dashboard/time-entry", label: "Time Sync", icon: TimeEntryIcon },
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

function TimeEntryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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

function ProjectsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
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

function ThemeToggle({ mode, className = "" }: { mode: SidebarMode; className?: string }) {
  const themeContext = useTheme();
  const theme = themeContext?.theme ?? "light";
  const toggleTheme = themeContext?.toggleTheme ?? (() => {});

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900 ${className}`}
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
      <span className={INLINE_LABEL[mode]}>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
      {HOVER_LABEL[mode] && (
        <span className={HOVER_LABEL[mode]} aria-hidden>
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </span>
      )}
    </button>
  );
}

/**
 * "auto": open with labels at 1440px and wider, icons with hover labels below that.
 * "open" / "closed": the user's choice from the collapse button, at any width.
 */
type SidebarMode = "auto" | "open" | "closed";

const SIDEBAR_STORAGE_KEY = "valtira-sidebar";
const WIDE_QUERY = "(min-width: 1440px)";

const SIDEBAR_WIDTH: Record<SidebarMode, string> = {
  auto: "w-14 min-[1440px]:w-[200px]",
  open: "w-[200px]",
  closed: "w-14",
};

/** Clipped rather than wrapped, so labels stay on one line while the sidebar width animates. */
const INLINE_LABEL_BASE = "min-w-0 overflow-hidden whitespace-nowrap";

const INLINE_LABEL: Record<SidebarMode, string> = {
  auto: `${INLINE_LABEL_BASE} hidden min-[1440px]:inline`,
  open: INLINE_LABEL_BASE,
  closed: `${INLINE_LABEL_BASE} hidden`,
};

const HOVER_LABEL_BASE =
  "pointer-events-none absolute left-full top-1/2 z-10 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100";

const HOVER_LABEL: Record<SidebarMode, string | null> = {
  auto: `${HOVER_LABEL_BASE} min-[1440px]:hidden`,
  open: null,
  closed: HOVER_LABEL_BASE,
};

const COLLAPSE_ICON_ROTATION: Record<SidebarMode, string> = {
  auto: "rotate-180 min-[1440px]:rotate-0",
  open: "",
  closed: "rotate-180",
};

/** The inline label only shows while open and the hover label only while collapsed, so each names the action it performs. */
function CollapseToggle({ mode, onToggle }: { mode: SidebarMode; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
    >
      <svg
        className={`h-5 w-5 shrink-0 transition-transform ${COLLAPSE_ICON_ROTATION[mode]}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
      </svg>
      <span className={INLINE_LABEL[mode]}>Collapse menu</span>
      {HOVER_LABEL[mode] && <span className={HOVER_LABEL[mode]}>Expand menu</span>}
    </button>
  );
}

function NavLinks({
  pathname,
  isSuperAdmin,
  mode,
  onNavigate,
}: {
  pathname: string;
  isSuperAdmin: boolean;
  mode: SidebarMode;
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
            className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              isActive
                ? "bg-neutral-100 font-medium text-neutral-900 dark:bg-blue-600 dark:text-white"
                : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-blue-600/80 dark:hover:text-white"
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className={INLINE_LABEL[mode]}>{item.label}</span>
            {HOVER_LABEL[mode] && <span className={HOVER_LABEL[mode]}>{item.label}</span>}
          </Link>
        );
      })}
    </>
  );
}

export function DashboardSidebar({ sessionUser }: { sessionUser: SessionUser | null }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mode, setMode] = useState<SidebarMode>("auto");

  const isSuperAdmin = (sessionUser as { role?: string })?.role === "super_admin";

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored === "open" || stored === "closed") setMode(stored);
    } catch {
      // ignore
    }
  }, []);

  function toggleSidebar() {
    const isOpen = mode === "auto" ? window.matchMedia(WIDE_QUERY).matches : mode === "open";
    const next: SidebarMode = isOpen ? "closed" : "open";
    setMode(next);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

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
                mode="open"
                onNavigate={() => setMobileOpen(false)}
              />
            </nav>
            <div className="mt-auto border-t border-neutral-200 pt-3">
              <ThemeToggle mode="open" />
            </div>
          </aside>
        </>
      )}

      {/* Desktop sidebar. Sits above the Resources grid's sticky columns (z-30) so hover labels aren't covered. */}
      <aside
        className={`fixed left-0 top-14 z-[35] hidden h-[calc(100vh-3.5rem)] border-r border-neutral-200 bg-white transition-[width] duration-200 ease-out md:block ${SIDEBAR_WIDTH[mode]}`}
      >
        <div className="flex h-full flex-col py-3">
          <nav className="flex flex-1 flex-col gap-0.5 px-2" aria-label="Main navigation">
            <NavLinks pathname={pathname} isSuperAdmin={isSuperAdmin} mode={mode} />
          </nav>

          <div className="mt-auto flex flex-col gap-0.5 border-t border-neutral-200 px-2 pt-2">
            <CollapseToggle mode={mode} onToggle={toggleSidebar} />
            <ThemeToggle mode={mode} />
          </div>
        </div>
      </aside>

      {/* Spacer so main content doesn't sit under sidebar (desktop) */}
      <div
        className={`hidden shrink-0 transition-[width] duration-200 ease-out md:block ${SIDEBAR_WIDTH[mode]}`}
        aria-hidden
      />
    </>
  );
}
