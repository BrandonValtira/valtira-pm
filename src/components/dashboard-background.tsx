"use client";

import { usePathname } from "next/navigation";
import { LogoBackground } from "@/components/logo-background";

/** Renders the bottom-right corner background on dashboard pages. 20% opacity on resources and project detail. */
export function DashboardBackground() {
  const pathname = usePathname();
  const isResources = pathname === "/dashboard/resource-planning";
  const isProjectDetail = /^\/dashboard\/project\/[^/]+$/.test(pathname);
  const opacity = isResources || isProjectDetail ? 0.2 : 1;
  return <LogoBackground position="bottom-right" opacity={opacity} />;
}
