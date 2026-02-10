"use server";

import { signOut } from "@/auth";

export async function signOutAction() {
  const base =
    process.env.NEXTAUTH_URL?.replace(/\/$/, "") ||
    "https://brandonvaltira-valtira-pm.vercel.app";
  await signOut({ redirectTo: `${base}/` });
}
