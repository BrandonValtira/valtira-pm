"use client";

import { useEffect, useRef, useState } from "react";
import { SignOutButton } from "@/components/sign-out-button";

type UserLike = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export function UserMenu({ user }: { user: UserLike }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    // Initialize theme from localStorage or OS preference
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("valtira-theme");
    let initial: "light" | "dark";
    if (stored === "light" || stored === "dark") {
      initial = stored;
    } else {
      initial = window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  function toggleTheme() {
    const next: "light" | "dark" = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", next === "dark");
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("valtira-theme", next);
    }
  }

  const displayName = user.name ?? user.email ?? "Signed in";
  const initial = (user.name ?? user.email ?? "?")[0]?.toUpperCase() ?? "?";

  return (
    <div
      ref={ref}
      className="relative ml-4 flex items-center gap-3 border-l border-neutral-200 pl-6"
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2"
      >
        <span className="text-sm text-neutral-900 truncate max-w-[140px]">
          {displayName}
        </span>
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 rounded-full border border-neutral-200 object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-xs font-medium text-neutral-600">
            {initial}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-neutral-200 bg-white py-1 text-sm text-neutral-700 shadow-lg">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs text-neutral-600">Dark mode</span>
            <button
              type="button"
              onClick={toggleTheme}
              className={`toggle relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-0 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 ${
                theme === "dark" ? "bg-neutral-900" : "bg-neutral-300"
              }`}
            >
              <span
                aria-hidden="true"
                className={`toggle-thumb pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                  theme === "dark" ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <div className="border-t border-neutral-200" />
          <SignOutButton className="block w-full px-3 py-2 text-left hover:bg-neutral-50" />
        </div>
      )}
    </div>
  );
}

