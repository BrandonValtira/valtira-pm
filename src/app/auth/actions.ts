"use server";

import { signOut } from "@/auth";
import { getAppBaseUrl } from "@/lib/app-url";

export async function signOutAction() {
  const base = getAppBaseUrl();
  await signOut({ redirectTo: `${base}/` });
}
