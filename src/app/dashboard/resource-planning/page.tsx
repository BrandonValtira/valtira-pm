import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ResourcePlanningClient } from "./resource-planning-client";

export default async function ResourcePlanningPage() {
  const session = await auth();
  if (!(session?.user as { id?: string })?.id) redirect("/");
  return <ResourcePlanningClient />;
}
