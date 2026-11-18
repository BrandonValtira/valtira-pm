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

  const displayName = user.name ?? user.email ?? "Signed in";
  const initial = (user.name ?? user.email ?? "?")[0]?.toUpperCase() ?? "?";

  return (
    <div
      ref={ref}
      className="relative flex items-center gap-3"
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
          <SignOutButton className="block w-full px-3 py-2 text-left hover:bg-neutral-50" />
        </div>
      )}
    </div>
  );
}

