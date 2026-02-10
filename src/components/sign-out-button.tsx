"use client";

import { signOut } from "next-auth/react";

/**
 * Client-side sign out using NextAuth's official API (same pattern as GoogleSignInButton).
 * Uses redirectTo so the user is sent to "/" after sign out. SessionProvider handles the rest.
 */
export function SignOutButton({
  className = "",
  children = "Sign out",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => signOut({ redirectTo: "/" })}
      className={className}
    >
      {children}
    </button>
  );
}
